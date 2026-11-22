import { useEffect, useMemo, useState } from 'react'
import { Activity, ArrowUpRight, Bell, BookOpen, Compass, FolderGit2, GitFork, Lock, Sparkles, Star, Users } from 'lucide-react'
import { useApp } from '../lib/store'
import { useGh } from '../lib/hooks'
import { Avatar, Badge, ErrorBlock, LoadingBlock, PageHeader, RepoRow, TimeAgo } from '../components/ui'
import type { GhRepo, GhSearchResult } from '../lib/types'
import { compactNumber } from '../lib/format'
import { gh } from '../lib/api'

function eventTarget(event: any) {
  const [owner, repo] = String(event.repo?.name || '').split('/')
  const number = event.payload?.pull_request?.number || event.payload?.issue?.number || event.payload?.number
  if (
    (event.type === 'PullRequestEvent' ||
      event.type === 'PullRequestReviewEvent' ||
      event.type === 'PullRequestReviewCommentEvent') &&
    number
  ) {
    return { name: 'issue' as const, owner, repo, number, kind: 'pull' as const }
  }
  if ((event.type === 'IssuesEvent' || event.type === 'IssueCommentEvent') && number) {
    return { name: 'issue' as const, owner, repo, number, kind: 'issue' as const }
  }
  return { name: 'repo' as const, owner, repo }
}

function FeedItem({ event, onOpen }: { event: any; onOpen: (event: any) => void }) {
  const { lang } = useApp()
  const L = (en: string, zh: string) => (lang === 'zh' ? zh : en)
  const [owner, repo] = String(event.repo?.name || '').split('/')
  const repoNode = <strong>{event.repo?.name}</strong>
  let text: React.ReactNode = repoNode
  let detail = ''
  let typeLabel = event.type

  switch (event.type) {
    case 'WatchEvent':
      text = (
        <>
          {L('starred', '收藏了')} {repoNode}
        </>
      )
      typeLabel = L('Star', '收藏')
      break
    case 'ForkEvent':
      text = (
        <>
          {L('forked', '复刻了')} {repoNode}
        </>
      )
      typeLabel = L('Fork', '复刻')
      break
    case 'CreateEvent':
      text = (
        <>
          {L('created', '创建了')} {event.payload?.ref_type || 'repository'}{' '}
          {event.payload?.ref ? <strong>{event.payload.ref}</strong> : null} {L('in', '于')} {repoNode}
        </>
      )
      typeLabel = L('Create', '创建')
      break
    case 'PushEvent': {
      const commits = Array.isArray(event.payload?.commits) ? event.payload.commits : []
      text = (
        <>
          {L('pushed', '推送了')} {commits.length}{' '}
          {L(commits.length === 1 ? 'commit' : 'commits', '个提交')} {L('to', '到')}{' '}
          <strong>{String(event.payload?.ref || '').replace('refs/heads/', '')}</strong> {repoNode}
        </>
      )
      detail = commits
        .slice(0, 2)
        .map((commit: any) => commit.message)
        .join(' · ')
      typeLabel = L('Push', '推送')
      break
    }
    case 'PullRequestEvent':
      text = (
        <>
          {event.payload?.action} {L('pull request', '拉取请求')}{' '}
          <strong>#{event.payload?.number}</strong> {L('in', '于')} {repoNode}
        </>
      )
      detail = event.payload?.pull_request?.title || ''
      typeLabel = L('Pull request', '拉取请求')
      break
    case 'IssuesEvent':
      text = (
        <>
          {event.payload?.action} {L('issue', '议题')} <strong>#{event.payload?.issue?.number}</strong>{' '}
          {L('in', '于')} {repoNode}
        </>
      )
      detail = event.payload?.issue?.title || ''
      typeLabel = L('Issue', '议题')
      break
    case 'IssueCommentEvent':
      text = (
        <>
          {L('commented on', '评论了')} <strong>#{event.payload?.issue?.number}</strong> {L('in', '于')}{' '}
          {repoNode}
        </>
      )
      detail = event.payload?.issue?.title || ''
      typeLabel = L('Comment', '评论')
      break
    case 'ReleaseEvent':
      text = (
        <>
          {L('published', '发布了')} <strong>{event.payload?.release?.tag_name}</strong> {L('in', '于')}{' '}
          {repoNode}
        </>
      )
      typeLabel = L('Release', '发布')
      break
    default:
      text = (
        <>
          {L('updated', '更新了')} {repoNode}
        </>
      )
  }

  return (
    <button className="list-item" onClick={() => onOpen(event)}>
      <Avatar url={event.actor?.avatar_url} name={event.actor?.login} size={30} />
      <div className="item-main">
        <div className="item-title">
          <span className="truncate">
            {event.actor?.display_login || event.actor?.login ? (
              <strong style={{ marginRight: 4 }}>{event.actor.display_login || event.actor.login}</strong>
            ) : null}
            {text}
          </span>
        </div>
        {detail ? <div className="item-desc">{detail}</div> : null}
        <div className="item-meta">
          <span>{typeLabel}</span>
          <span>
            {owner}/{repo}
          </span>
          <span>
            <TimeAgo iso={event.created_at} />
          </span>
        </div>
      </div>
    </button>
  )
}

export function DashboardPage() {
  const { t, lang, user, authenticated, sessionVersion, rate, openLogin, navigate } = useApp()
  const L = (en: string, zh: string) => (lang === 'zh' ? zh : en)
  const [feedTab, setFeedTab] = useState<'for-you' | 'following'>('for-you')
  const [followingEvents, setFollowingEvents] = useState<any[] | null>(null)
  const [followingLoading, setFollowingLoading] = useState(false)

  const since = useMemo(() => {
    const date = new Date(Date.now() - 7 * 86400000)
    return date.toISOString().slice(0, 10)
  }, [])

  const trending = useGh<GhSearchResult<GhRepo>>(
    `/search/repositories?q=stars:>800+pushed:>${since}&sort=stars&order=desc&per_page=8`,
  )
  const recent = useGh<GhRepo[]>(
    authenticated ? '/user/repos?sort=updated&per_page=6&affiliation=owner,collaborator,organization_member' : null,
    [sessionVersion],
  )
  const received = useGh<any[]>(
    authenticated && user ? `/users/${user.login}/received_events/public?per_page=30` : null,
    [sessionVersion, feedTab],
  )

  useEffect(() => {
    if (!authenticated || !user || feedTab !== 'following') return
    let alive = true
    setFollowingLoading(true)
    const load = async () => {
      const following = await gh<any[]>(`/users/${user.login}/following?per_page=8`)
      const logins: string[] = Array.isArray(following.data)
        ? following.data.map((item: any) => item.login).filter(Boolean)
        : []
      const lists = await Promise.all(
        logins.slice(0, 6).map((login) => gh<any[]>(`/users/${login}/events/public?per_page=6`)),
      )
      const merged = lists
        .flatMap((res) => (Array.isArray(res.data) ? res.data : []))
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      if (!alive) return
      setFollowingEvents(merged.slice(0, 30))
      setFollowingLoading(false)
    }
    void load()
    return () => {
      alive = false
    }
  }, [authenticated, user, feedTab, sessionVersion])

  const openEvent = (event: any) => {
    const target = eventTarget(event)
    navigate(target as any)
  }

  const feedItems = feedTab === 'for-you' ? received.data : followingEvents
  const feedLoading = feedTab === 'for-you' ? received.loading : followingLoading
  const feedError = feedTab === 'for-you' ? received.error : null

  const resetLabel = rate?.reset
    ? new Date(rate.reset * 1000).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    : '—'
  const percent = rate && rate.limit > 0 ? Math.max(2, Math.min(100, (rate.remaining / rate.limit) * 100)) : 0
  const meterTone = percent < 12 ? 'danger' : percent < 32 ? 'warn' : ''

  return (
    <div className="page">
      <PageHeader title={t('dashboard.title')} subtitle={t('app.tagline')} />

      <section className="hero">
        <div className="hero-content">
          <div className="hero-kicker">
            <Sparkles size={11} />
            {authenticated ? t('app.fullVersion') : t('app.limitedVersion')}
          </div>
          <h1>
            {authenticated && user
              ? t('dashboard.welcomeBack', { name: user.name || user.login })
              : t('dashboard.anonymousTitle')}
          </h1>
          <p>{authenticated ? t('dashboard.privateAccess') + ' · ' + t('app.authedRate') : t('dashboard.anonymousText')}</p>
          <div className="hero-actions">
            {authenticated ? (
              <>
                <button className="btn primary" onClick={() => navigate({ name: 'repos' })}>
                  {t('repos.myRepos')}
                </button>
                <button className="btn" onClick={() => navigate({ name: 'notifications' })}>
                  <Bell size={14} />
                  {t('nav.notifications')}
                </button>
              </>
            ) : (
              <>
                <button className="btn primary" onClick={openLogin}>
                  <Lock size={14} />
                  {t('dashboard.signInCta')}
                </button>
                <button className="btn" onClick={() => navigate({ name: 'explore' })}>
                  <Compass size={14} />
                  {t('search.title')}
                </button>
              </>
            )}
          </div>
        </div>

        <div className="hero-visual">
          {authenticated && user ? (
            <>
              <div className="hero-stat">
                <Avatar user={user} size={34} />
                <div style={{ minWidth: 0 }}>
                  <strong className="truncate">{user.login}</strong>
                  <span>{t('auth.fullUnlockedTitle')}</span>
                </div>
              </div>
              <div className="hero-stat">
                <Users size={18} color="var(--accent)" />
                <div>
                  <strong>{compactNumber(user.followers)}</strong>
                  <span>followers</span>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="hero-stat">
                <Lock size={17} color="var(--accent)" />
                <div>
                  <strong>60 / h</strong>
                  <span>{t('dashboard.publicOnly')}</span>
                </div>
              </div>
              <div className="hero-stat">
                <Sparkles size={17} color="var(--accent)" />
                <div>
                  <strong>5,000 / h</strong>
                  <span>{t('dashboard.allData')}</span>
                </div>
              </div>
            </>
          )}
        </div>
      </section>

      <div className="two-col">
        <section className="card">
          <div className="card-head">
            <div>
              <div className="card-title">{t('dashboard.trending')}</div>
              <div className="card-sub">{t('dashboard.trendingHint')}</div>
            </div>
            <button className="btn small ghost" onClick={() => navigate({ name: 'explore' })}>
              {t('dashboard.viewAll')}
              <ArrowUpRight size={13} />
            </button>
          </div>
          <div className="list">
            {trending.loading ? (
              <LoadingBlock />
            ) : trending.error ? (
              <div style={{ padding: 16 }}>
                <ErrorBlock message={trending.error} onRetry={trending.reload} />
              </div>
            ) : trending.data?.items?.length ? (
              trending.data.items.map((repo, index) => (
                <RepoRow
                  key={repo.id}
                  repo={repo}
                  rank={index + 1}
                  onClick={() => navigate({ name: 'repo', owner: repo.owner.login, repo: repo.name })}
                  right={
                    <>
                      <span>
                        <Star size={12} /> {compactNumber(repo.stargazers_count)}
                      </span>
                      <span>
                        <GitFork size={12} /> {compactNumber(repo.forks_count)}
                      </span>
                    </>
                  }
                />
              ))
            ) : (
              <div className="readme-empty">{t('search.empty')}</div>
            )}
          </div>
        </section>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <section className="card">
            <div className="card-head">
              <div>
                <div className="card-title">{t('dashboard.rateTitle')}</div>
                <div className="card-sub">{authenticated ? t('app.authedRate') : t('app.anonymousRate')}</div>
              </div>
              <Badge tone={authenticated ? 'green' : 'gold'}>
                {authenticated ? t('app.fullVersion') : t('app.limitedVersion')}
              </Badge>
            </div>
            <div className="card-body">
              <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                <strong style={{ fontSize: 22, letterSpacing: '-0.3px' }}>
                  {rate ? rate.remaining.toLocaleString() : '—'}
                  <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>
                    {' '}
                    / {rate ? rate.limit.toLocaleString() : '—'}
                  </span>
                </strong>
                <span className="muted" style={{ fontSize: 11.5 }}>
                  {t('app.resetAt', { time: resetLabel })}
                </span>
              </div>
              <div className={`meter ${meterTone}`}>
                <span style={{ width: `${percent}%` }} />
              </div>
              <p className="field-hint" style={{ marginTop: 10 }}>
                {t('dashboard.rateHint')}
              </p>
              {!authenticated ? (
                <button className="btn block" style={{ marginTop: 12 }} onClick={openLogin}>
                  <Lock size={14} />
                  {t('dashboard.signInCta')}
                </button>
              ) : null}
            </div>
          </section>

          <section className="card">
            <div className="card-head plain">
              <div className="card-title">{t('dashboard.quickLinks')}</div>
            </div>
            <div className="card-body" style={{ paddingTop: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <button className="btn" onClick={() => navigate({ name: 'repos' })} style={{ justifyContent: 'flex-start' }}>
                  <BookOpen size={13} />
                  {t('nav.repos')}
                </button>
                <button className="btn" onClick={() => navigate({ name: 'explore' })} style={{ justifyContent: 'flex-start' }}>
                  <Compass size={13} />
                  {t('nav.explore')}
                </button>
                <button className="btn" onClick={() => navigate({ name: 'local' })} style={{ justifyContent: 'flex-start' }}>
                  <FolderGit2 size={13} />
                  {t('nav.local')}
                </button>
                <button
                  className="btn"
                  onClick={() => navigate({ name: 'notifications' })}
                  style={{ justifyContent: 'flex-start' }}
                >
                  <Bell size={13} />
                  {t('nav.notifications')}
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>

      {authenticated ? (
        <section className="card">
          <div className="card-head">
            <div>
              <div className="card-title">
                <Activity size={14} />
                {L('Activity', '动态')}
              </div>
              <div className="card-sub">{L('What people you follow are working on', '你关注的人最近在做什么')}</div>
            </div>
            <div className="segmented">
              <button className={feedTab === 'for-you' ? 'active' : ''} onClick={() => setFeedTab('for-you')}>
                {L('For you', '为你推荐')}
              </button>
              <button className={feedTab === 'following' ? 'active' : ''} onClick={() => setFeedTab('following')}>
                {L('Following', '关注')}
              </button>
            </div>
          </div>
          <div className="list">
            {feedLoading ? (
              <LoadingBlock />
            ) : feedError ? (
              <div style={{ padding: 16 }}>
                <ErrorBlock message={feedError} onRetry={received.reload} />
              </div>
            ) : feedItems?.length ? (
              feedItems.map((event: any) => <FeedItem key={event.id} event={event} onOpen={openEvent} />)
            ) : (
              <div className="readme-empty">
                {L('No activity yet. Follow people to fill your feed.', '暂无动态，关注一些开发者后这里就会有内容。')}
              </div>
            )}
          </div>
        </section>
      ) : null}

      {authenticated ? (
        <section className="card">
          <div className="card-head">
            <div>
              <div className="card-title">{t('dashboard.recentRepos')}</div>
              <div className="card-sub">{t('dashboard.recentReposHint')}</div>
            </div>
            <button className="btn small ghost" onClick={() => navigate({ name: 'repos' })}>
              {t('dashboard.viewAll')}
            </button>
          </div>
          <div className="list">
            {recent.loading ? (
              <LoadingBlock />
            ) : recent.error ? (
              <div style={{ padding: 16 }}>
                <ErrorBlock message={recent.error} onRetry={recent.reload} />
              </div>
            ) : recent.data?.length ? (
              recent.data.map((repo) => (
                <RepoRow
                  key={repo.id}
                  repo={repo}
                  onClick={() => navigate({ name: 'repo', owner: repo.owner.login, repo: repo.name })}
                  right={<TimeAgo iso={repo.updated_at} />}
                />
              ))
            ) : (
              <div className="readme-empty">{t('repos.empty')}</div>
            )}
          </div>
        </section>
      ) : null}
    </div>
  )
}
