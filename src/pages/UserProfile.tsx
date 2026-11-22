import { useEffect, useState } from 'react'
import { Activity, Building2, CalendarDays, ExternalLink, MapPin, Package, Star, UserPlus, UserMinus } from 'lucide-react'
import { useApp } from '../lib/store'
import { gh } from '../lib/api'
import { useGh, useGql } from '../lib/hooks'
import { Avatar, Badge, EmptyState, ErrorBlock, LoadingBlock, PageHeader, RepoRow, TimeAgo } from '../components/ui'
import { Pagination } from '../components/Pagination'
import { compactNumber, formatDate } from '../lib/format'
import { openExternal } from '../lib/desktop'

const CONTRIBUTION_QUERY = `query ($login: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $login) {
    contributionsCollection(from: $from, to: $to) {
      contributionCalendar {
        totalContributions
        weeks {
          contributionDays { date contributionCount }
        }
      }
    }
  }
}`

const PINNED_QUERY = `query ($login: String!) {
  user(login: $login) {
    pinnedItems(first: 6, types: REPOSITORY) {
      nodes {
        ... on Repository {
          id
          name
          nameWithOwner
          description
          isPrivate
          stargazers { totalCount }
          forkCount
          primaryLanguage { name color }
          owner { login avatarUrl }
        }
      }
    }
  }
}`

type ContributionCalendar = {
  user: {
    contributionsCollection: {
      contributionCalendar: {
        totalContributions: number
        weeks: { contributionDays: { date: string; contributionCount: number }[] }[]
      }
    }
  }
}

type PinnedResult = {
  user: {
    pinnedItems: {
      nodes: {
        id: string
        name: string
        nameWithOwner: string
        description: string | null
        isPrivate: boolean
        stargazers: { totalCount: number }
        forkCount: number
        primaryLanguage: { name: string; color: string | null } | null
        owner: { login: string; avatarUrl: string }
      }[]
    }
  }
}

function contributionLevel(count: number) {
  if (count <= 0) return 0
  if (count <= 3) return 1
  if (count <= 6) return 2
  if (count <= 9) return 3
  return 4
}

type ProfileTab = 'overview' | 'repos' | 'stars' | 'followers' | 'following' | 'packages'

function describeEvent(event: any, L: (en: string, zh: string) => string) {
  const repo = event.repo?.name || ''
  const payload = event.payload || {}
  switch (event.type) {
    case 'WatchEvent':
      return `${L('Starred', '收藏了')} ${repo}`
    case 'ForkEvent':
      return `${L('Forked', '复刻了')} ${repo}`
    case 'PushEvent':
      return `${L('Pushed to', '推送到')} ${String(payload.ref || '').replace('refs/heads/', '')} · ${repo}`
    case 'CreateEvent':
      return `${L('Created', '创建了')} ${payload.ref || payload.ref_type || 'repository'} · ${repo}`
    case 'IssuesEvent':
      return `${payload.action || 'updated'} issue #${payload.issue?.number} · ${repo}`
    case 'PullRequestEvent':
      return `${payload.action || 'updated'} pull request #${payload.number} · ${repo}`
    case 'IssueCommentEvent':
      return `${L('Commented on', '评论了')} #${payload.issue?.number} · ${repo}`
    case 'ReleaseEvent':
      return `${L('Published', '发布了')} ${payload.release?.tag_name} · ${repo}`
    case 'DeleteEvent':
      return `${L('Deleted', '删除了')} ${payload.ref} · ${repo}`
    default:
      return `${L('Updated', '更新了')} ${repo}`
  }
}

export function UserProfilePage({ login }: { login: string }) {
  const { t, lang, authenticated, user, sessionVersion, navigate, toast } = useApp()
  const L = (en: string, zh: string) => (lang === 'zh' ? zh : en)
  const [tab, setTab] = useState<ProfileTab>('overview')
  const [repoPage, setRepoPage] = useState(1)
  const [starPage, setStarPage] = useState(1)
  const [followerPage, setFollowerPage] = useState(1)
  const [followingPage, setFollowingPage] = useState(1)
  const [contribYear, setContribYear] = useState(new Date().getFullYear())

  const profile = useGh<any>(`/users/${login}`, [sessionVersion])
  const repos = useGh<any[]>(`/users/${login}/repos?per_page=30&page=${repoPage}&sort=updated`, [repoPage])
  const starred = useGh<any[]>(
    tab === 'stars' ? `/users/${login}/starred?per_page=30&page=${starPage}` : null,
    [tab, login, starPage],
  )
  const followers = useGh<any[]>(
    tab === 'followers' ? `/users/${login}/followers?per_page=30&page=${followerPage}` : null,
    [tab, login, followerPage],
  )
  const followingList = useGh<any[]>(
    tab === 'following' ? `/users/${login}/following?per_page=30&page=${followingPage}` : null,
    [tab, login, followingPage],
  )
  const calendar = useGql<ContributionCalendar>(authenticated ? CONTRIBUTION_QUERY : null, {
    login,
    from: `${contribYear}-01-01T00:00:00Z`,
    to: `${contribYear}-12-31T23:59:59Z`,
  })
  const pinned = useGql<PinnedResult>(authenticated && tab === 'overview' ? PINNED_QUERY : null, { login })
  const events = useGh<any[]>(
    tab === 'overview' ? `/users/${login}/events/public?per_page=30` : null,
    [tab, login],
  )

  const calendarDays =
    calendar.data?.user?.contributionsCollection?.contributionCalendar?.weeks.flatMap(
      (week) => week.contributionDays,
    ) || []
  const totalContributions =
    calendar.data?.user?.contributionsCollection?.contributionCalendar?.totalContributions || 0
  const pinnedRepos = pinned.data?.user?.pinnedItems?.nodes?.filter(Boolean) || []

  const [following, setFollowing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [packages, setPackages] = useState<any[] | null>(null)
  const [pkgLoading, setPkgLoading] = useState(false)

  const isSelf = Boolean(user && user.login.toLowerCase() === login.toLowerCase())

  useEffect(() => {
    if (tab !== 'packages') return
    let alive = true
    setPkgLoading(true)
    const base = isSelf ? '/user/packages' : `/users/${login}/packages`
    Promise.all(
      ['container', 'npm', 'maven', 'nuget', 'rubygems'].map((type) =>
        gh<any[]>(`${base}?package_type=${type}&per_page=30`),
      ),
    ).then((results) => {
      if (!alive) return
      const merged = results.flatMap((res) => (res.ok && Array.isArray(res.data) ? res.data : []))
      setPackages(merged)
      setPkgLoading(false)
    })
    return () => {
      alive = false
    }
  }, [tab, login, isSelf])

  useEffect(() => {
    setTab('overview')
    setRepoPage(1)
    setStarPage(1)
    setFollowerPage(1)
    setFollowingPage(1)
  }, [login])

  useEffect(() => {
    if (!authenticated || isSelf) {
      setFollowing(false)
      return
    }
    let alive = true
    gh(`/user/following/${login}`).then((res) => {
      if (alive) setFollowing(res.ok)
    })
    return () => {
      alive = false
    }
  }, [authenticated, isSelf, login, sessionVersion])

  const toggleFollow = async () => {
    if (!authenticated) return
    setBusy(true)
    const res = await gh(`/user/following/${login}`, { method: following ? 'DELETE' : 'PUT' })
    setBusy(false)
    if (res.ok || res.status === 204) {
      setFollowing(!following)
      toast(following ? t('user.unfollowed') : t('user.followed'), 'success')
      profile.reload()
    }
  }

  if (profile.loading) return <LoadingBlock />
  if (profile.error || !profile.data) {
    return (
      <div className="page">
        <div className="card card-body">
          <ErrorBlock message={profile.error || t('user.notFound')} onRetry={profile.reload} />
        </div>
      </div>
    )
  }

  const data = profile.data

  return (
    <div className="page">
      <PageHeader
        title={data.name || data.login}
        subtitle={`@${data.login}`}
        actions={
          <>
            {data.type === 'Organization' ? (
              <button className="btn" onClick={() => navigate({ name: 'org', org: data.login })}>
                <Building2 size={14} />
                {t('user.viewOrg')}
              </button>
            ) : null}
            <button className="btn" onClick={() => void openExternal(data.html_url)}>
              <ExternalLink size={14} />
              {t('user.viewOnGitHub')}
            </button>
            {authenticated && !isSelf ? (
              <button className={following ? 'btn' : 'btn primary'} onClick={() => void toggleFollow()} disabled={busy}>
                {following ? <UserMinus size={14} /> : <UserPlus size={14} />}
                {following ? t('user.unfollow') : t('user.follow')}
              </button>
            ) : null}
            {isSelf ? <Badge tone="blue">{t('user.you')}</Badge> : null}
          </>
        }
      />

      <section className="card card-body">
        <div className="row" style={{ alignItems: 'flex-start', gap: 18, flexWrap: 'wrap' }}>
          <Avatar user={data} size={84} />
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{data.name || data.login}</div>
            <div className="muted mono" style={{ fontSize: 12, marginTop: 2 }}>
              {data.login}
            </div>
            <p style={{ margin: '10px 0', color: 'var(--text-2)', fontSize: 13.5, lineHeight: 1.65 }}>
              {data.bio || t('user.bioEmpty')}
            </p>
            <div className="repo-counts">
              {data.company ? (
                <span>
                  <Building2 size={13} /> {data.company}
                </span>
              ) : null}
              {data.location ? (
                <span>
                  <MapPin size={13} /> {data.location}
                </span>
              ) : null}
              {data.created_at ? (
                <span>
                  <CalendarDays size={13} /> {t('user.joined')} {formatDate(data.created_at, lang)}
                </span>
              ) : null}
              <button
                className="btn small ghost"
                style={{ height: 'auto', padding: 0 }}
                onClick={() => setTab('followers')}
              >
                {t('user.followers')} {data.followers?.toLocaleString()}
              </button>
              <button
                className="btn small ghost"
                style={{ height: 'auto', padding: 0 }}
                onClick={() => setTab('following')}
              >
                {t('user.following')} {data.following?.toLocaleString()}
              </button>
              <button
                className="btn small ghost"
                style={{ height: 'auto', padding: 0 }}
                onClick={() => setTab('repos')}
              >
                {t('user.publicRepos')} {data.public_repos?.toLocaleString()}
              </button>
            </div>
          </div>
        </div>
      </section>

      <div className="tabs">
        {(
          [
            { key: 'overview', label: L('Overview', '概览') },
            { key: 'repos', label: t('user.repos'), count: data.public_repos },
            { key: 'packages', label: L('Packages', '软件包') },
            { key: 'stars', label: L('Stars', '星标') },
            { key: 'followers', label: L('Followers', '关注者'), count: data.followers },
            { key: 'following', label: L('Following', '正在关注'), count: data.following },
          ] as { key: ProfileTab; label: string; count?: number }[]
        ).map((item) => (
          <button
            key={item.key}
            className={tab === item.key ? 'tab active' : 'tab'}
            onClick={() => setTab(item.key)}
          >
            {item.label}
            {item.count !== undefined ? <span className="count">{item.count}</span> : null}
          </button>
        ))}
      </div>

      {tab === 'overview' ? (
        <>
          {pinnedRepos.length ? (
            <section className="card">
              <div className="card-head">
                <div className="card-title">
                  <Star size={15} />
                  {L('Pinned', '置顶仓库')}
                </div>
              </div>
              <div className="list">
                {pinnedRepos.map((repo) => (
                  <button
                    className="list-item"
                    key={repo.id}
                    onClick={() => navigate({ name: 'repo', owner: repo.owner.login, repo: repo.name })}
                  >
                    <div className="repo-avatar">
                      <Avatar url={repo.owner.avatarUrl} name={repo.owner.login} size={38} square />
                    </div>
                    <div className="item-main">
                      <div className="item-title">
                        <span className="mono truncate" style={{ color: 'var(--muted)' }}>
                          {repo.owner.login}/
                        </span>
                        <span className="truncate">{repo.name}</span>
                        {repo.isPrivate ? <Badge tone="gold">{t('repos.private')}</Badge> : null}
                      </div>
                      {repo.description ? <div className="item-desc">{repo.description}</div> : null}
                      <div className="item-meta">
                        {repo.primaryLanguage ? (
                          <span>
                            <i
                              className="dot"
                              style={{ background: repo.primaryLanguage.color || 'var(--muted)' }}
                            />
                            {repo.primaryLanguage.name}
                          </span>
                        ) : null}
                        <span>
                          <Star size={12} /> {compactNumber(repo.stargazers.totalCount)}
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {authenticated && calendarDays.length ? (
            <section className="card card-body">
              <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
                <div className="card-title">
                  <CalendarDays size={15} />
                  {t('user.contributions')}
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <select
                    className="select"
                    style={{ height: 28, width: 'auto' }}
                    value={contribYear}
                    onChange={(event) => setContribYear(Number(event.target.value))}
                    aria-label={L('Contribution year', '贡献年份')}
                  >
                    {[0, 1, 2, 3, 4].map((offset) => {
                      const year = new Date().getFullYear() - offset
                      return (
                        <option key={year} value={year}>
                          {year}
                        </option>
                      )
                    })}
                  </select>
                  <span className="muted" style={{ fontSize: 11.5 }}>
                    {t('user.contributionsTotal', { n: totalContributions.toLocaleString() })}
                  </span>
                </div>
              </div>
              <div className="contribution-grid">
                {calendarDays.map((day) => (
                  <span
                    className={`contribution-cell level-${contributionLevel(day.contributionCount)}`}
                    key={day.date}
                    title={`${day.date}: ${day.contributionCount}`}
                  />
                ))}
              </div>
            </section>
          ) : null}

          <section className="card">
            <div className="card-head">
              <div className="card-title">{t('user.repos')}</div>
              <button className="btn small ghost" onClick={() => setTab('repos')}>
                {L('View all', '查看全部')}
              </button>
            </div>
            {repos.loading ? (
              <LoadingBlock />
            ) : repos.error ? (
              <div style={{ padding: 16 }}>
                <ErrorBlock message={repos.error} onRetry={repos.reload} />
              </div>
            ) : !repos.data?.length ? (
              <EmptyState title={t('user.noRepos')} />
            ) : (
              <div className="list">
                {repos.data.slice(0, 6).map((repo) => (
                  <RepoRow
                    key={repo.id}
                    repo={repo}
                    onClick={() => navigate({ name: 'repo', owner: repo.owner.login, repo: repo.name })}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="card">
            <div className="card-head">
              <div className="card-title">
                <Activity size={15} />
                {L('Recent activity', '近期活动')}
              </div>
              <span className="muted" style={{ fontSize: 11.5 }}>
                {events.data?.length || 0}
              </span>
            </div>
            {events.loading ? (
              <LoadingBlock />
            ) : !events.data?.length ? (
              <div className="readme-empty">{L('No public activity yet.', '暂无公开动态。')}</div>
            ) : (
              <div className="list">
                {events.data.slice(0, 20).map((event: any) => {
                  const [eventOwner, eventRepo] = String(event.repo?.name || '').split('/')
                  return (
                    <button
                      className="list-item"
                      key={event.id}
                      onClick={() =>
                        eventOwner && eventRepo
                          ? navigate({ name: 'repo', owner: eventOwner, repo: eventRepo })
                          : undefined
                      }
                    >
                      <Avatar url={event.actor?.avatar_url} name={event.actor?.login} size={28} />
                      <div className="item-main">
                        <div className="item-title">
                          <span className="truncate">{describeEvent(event, L)}</span>
                        </div>
                        <div className="item-meta">
                          <span>{String(event.type || '').replace('Event', '')}</span>
                          <span>
                            <TimeAgo iso={event.created_at} />
                          </span>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </section>
        </>
      ) : null}

      {tab === 'repos' ? (
        <section className="card">
          <div className="card-head">
            <div className="card-title">{t('user.repos')}</div>
            <span className="muted" style={{ fontSize: 11.5 }}>
              {repos.data?.length || 0}
            </span>
          </div>
          {repos.loading ? (
            <LoadingBlock />
          ) : repos.error ? (
            <div style={{ padding: 16 }}>
              <ErrorBlock message={repos.error} onRetry={repos.reload} />
            </div>
          ) : !repos.data?.length ? (
            <EmptyState title={t('user.noRepos')} />
          ) : (
            <div className="list">
              {repos.data.map((repo) => (
                <RepoRow
                  key={repo.id}
                  repo={repo}
                  onClick={() => navigate({ name: 'repo', owner: repo.owner.login, repo: repo.name })}
                />
              ))}
            </div>
          )}
          <Pagination
            page={repoPage}
            onPage={setRepoPage}
            hasNext={(repos.data?.length || 0) === 30}
            loading={repos.loading}
          />
        </section>
      ) : null}

      {tab === 'packages' ? (
        <section className="card">
          <div className="card-head">
            <div className="card-title">
              <Package size={15} />
              {L('Packages', '软件包')}
            </div>
            {packages ? <Badge>{packages.length}</Badge> : null}
          </div>
          {pkgLoading ? (
            <LoadingBlock />
          ) : !packages?.length ? (
            <EmptyState
              title={L('No packages', '没有软件包')}
              text={L('This account has no public packages.', '该账号没有公开的软件包。')}
            />
          ) : (
            <div className="list">
              {packages.map((pkg) => (
                <button
                  className="list-item"
                  key={`${pkg.package_type}-${pkg.id}`}
                  onClick={() => pkg.html_url && void openExternal(pkg.html_url)}
                >
                  <Package size={18} color="var(--muted)" />
                  <div className="item-main">
                    <div className="item-title">{pkg.name}</div>
                    <div className="item-meta">
                      <Badge>{pkg.package_type}</Badge>
                      {pkg.visibility ? <span>{pkg.visibility}</span> : null}
                      {pkg.version_count !== undefined ? (
                        <span>{pkg.version_count} versions</span>
                      ) : null}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {tab === 'stars' ? (
        <section className="card">
          <div className="card-head">
            <div className="card-title">
              <Star size={15} />
              {L('Starred repositories', '星标仓库')}
            </div>
          </div>
          {starred.loading ? (
            <LoadingBlock />
          ) : starred.error ? (
            <div style={{ padding: 16 }}>
              <ErrorBlock message={starred.error} onRetry={starred.reload} />
            </div>
          ) : !starred.data?.length ? (
            <EmptyState title={L('No starred repositories', '没有星标仓库')} />
          ) : (
            <div className="list">
              {starred.data.map((repo) => (
                <RepoRow
                  key={repo.id}
                  repo={repo}
                  onClick={() => navigate({ name: 'repo', owner: repo.owner.login, repo: repo.name })}
                  right={<TimeAgo iso={repo.updated_at} />}
                />
              ))}
            </div>
          )}
          <Pagination
            page={starPage}
            onPage={setStarPage}
            hasNext={(starred.data?.length || 0) === 30}
            loading={starred.loading}
          />
        </section>
      ) : null}

      {tab === 'followers' || tab === 'following' ? (
        <section className="card">
          <div className="card-head">
            <div className="card-title">
              {tab === 'followers' ? L('Followers', '关注者') : L('Following', '正在关注')}
            </div>
          </div>
          {(tab === 'followers' ? followers : followingList).loading ? (
            <LoadingBlock />
          ) : (tab === 'followers' ? followers : followingList).error ? (
            <div style={{ padding: 16 }}>
              <ErrorBlock
                message={(tab === 'followers' ? followers : followingList).error || ''}
                onRetry={(tab === 'followers' ? followers : followingList).reload}
              />
            </div>
          ) : !(tab === 'followers' ? followers : followingList).data?.length ? (
            <EmptyState title={L('Nobody here yet', '这里还没有人')} />
          ) : (
            <div className="list">
              {(tab === 'followers' ? followers : followingList).data!.map((person: any) => (
                <button
                  className="list-item"
                  key={person.id}
                  onClick={() => navigate({ name: 'user', login: person.login })}
                >
                  <Avatar user={person} size={38} />
                  <div className="item-main">
                    <div className="item-title">{person.login}</div>
                    {person.type ? <div className="item-desc">{person.type}</div> : null}
                  </div>
                  <span className="btn small ghost">{L('View profile', '查看主页')}</span>
                </button>
              ))}
            </div>
          )}
          <Pagination
            page={tab === 'followers' ? followerPage : followingPage}
            onPage={tab === 'followers' ? setFollowerPage : setFollowingPage}
            hasNext={((tab === 'followers' ? followers : followingList).data?.length || 0) === 30}
            loading={(tab === 'followers' ? followers : followingList).loading}
          />
        </section>
      ) : null}
    </div>
  )
}
