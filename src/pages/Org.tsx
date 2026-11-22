import { useEffect, useState } from 'react'
import {
  BookOpen,
  Building2,
  CalendarDays,
  ExternalLink,
  Globe2,
  Layers,
  MapPin,
  Package,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { useApp } from '../lib/store'
import { useGh, useGql } from '../lib/hooks'
import { gh } from '../lib/api'
import { Avatar, Badge, EmptyState, ErrorBlock, LoadingBlock, Modal, PageHeader, RepoRow } from '../components/ui'
import { Pagination } from '../components/Pagination'
import { Markdown } from '../components/Markdown'
import { decodeBase64, formatDate } from '../lib/format'
import { openExternal } from '../lib/desktop'

type OrgProfile = {
  login: string
  name: string | null
  description: string | null
  avatar_url: string
  blog: string | null
  location: string | null
  email: string | null
  created_at: string
  followers: number
  public_repos: number
  html_url: string
}

type Member = { id: number; login: string; avatar_url: string; html_url: string }
type Team = { id: number; name: string; slug: string; description: string | null; privacy: string }
type Project = { id: string; title: string; url: string; closed: boolean; shortDescription: string | null }
type OrgPackage = {
  id: number
  name: string
  package_type: string
  visibility?: string
  html_url?: string
  version_count?: number
}
type OrgTab = 'overview' | 'repos' | 'members' | 'teams' | 'projects' | 'packages'
type MemberRole = 'all' | 'admin' | 'member'

const PACKAGE_TYPES = ['container', 'npm', 'maven', 'nuget', 'rubygems'] as const

const PROJECTS_QUERY = `query($login: String!) {
  organization(login: $login) {
    projectsV2(first: 30) {
      nodes {
        id
        title
        url
        closed
        shortDescription
      }
    }
  }
}`

export function OrgPage({ org }: { org: string }) {
  const { t, lang, authenticated, navigate } = useApp()
  const L = (en: string, zh: string) => (lang === 'zh' ? zh : en)
  const [tab, setTab] = useState<OrgTab>('overview')
  const [repoPage, setRepoPage] = useState(1)
  const [memberPage, setMemberPage] = useState(1)
  const [memberRole, setMemberRole] = useState<MemberRole>('all')
  const [packages, setPackages] = useState<OrgPackage[]>([])
  const [packagesLoading, setPackagesLoading] = useState(false)
  const [team, setTeam] = useState<Team | null>(null)

  const profile = useGh<OrgProfile>(`/orgs/${org}`)
  const repos = useGh<any[]>(
    tab === 'repos' ? `/orgs/${org}/repos?per_page=30&page=${repoPage}&sort=updated` : null,
    [repoPage],
  )
  const members = useGh<Member[]>(
    tab === 'members'
      ? `/orgs/${org}/members?per_page=30&page=${memberPage}${memberRole === 'all' ? '' : `&role=${memberRole}`}`
      : null,
    [memberPage, memberRole],
  )
  const teams = useGh<Team[]>(tab === 'teams' && authenticated ? `/orgs/${org}/teams?per_page=30` : null)
  const projects = useGql<{ organization: { projectsV2: { nodes: Project[] } } | null }>(
    tab === 'projects' ? PROJECTS_QUERY : null,
    { login: org },
    [tab],
  )
  const orgReadme = useGh<{ content?: string; name?: string }>(
    tab === 'overview' ? `/repos/${org}/.github/contents/profile/README.md` : null,
    [tab, org],
  )
  const popularRepos = useGh<any[]>(
    tab === 'overview' ? `/orgs/${org}/repos?per_page=6&sort=stars&direction=desc` : null,
    [tab, org],
  )

  useEffect(() => {
    if (tab !== 'packages') return
    let alive = true
    setPackagesLoading(true)
    Promise.all(
      PACKAGE_TYPES.map(async (type) => {
        const res = await gh<OrgPackage[]>(
          `/orgs/${org}/packages?package_type=${type}&per_page=50`,
          { accept: 'application/vnd.github+json' },
        )
        return res.ok && Array.isArray(res.data) ? res.data : []
      }),
    ).then((groups) => {
      if (!alive) return
      setPackages(groups.flat())
      setPackagesLoading(false)
    })
    return () => {
      alive = false
    }
  }, [org, tab])

  if (profile.loading) return <LoadingBlock />
  if (profile.error || !profile.data) {
    return (
      <div className="page">
        <div className="card card-body">
          <ErrorBlock message={profile.error || t('org.notFound')} onRetry={profile.reload} />
        </div>
      </div>
    )
  }

  const data = profile.data
  const tabs = [
    { key: 'overview' as const, label: L('Overview', '概览'), icon: <Building2 size={13} /> },
    { key: 'repos' as const, label: t('org.repos'), icon: <BookOpen size={13} /> },
    { key: 'members' as const, label: t('org.members'), icon: <Users size={13} /> },
    { key: 'teams' as const, label: t('org.teams'), icon: <ShieldCheck size={13} /> },
    { key: 'projects' as const, label: L('Projects', '项目'), icon: <Layers size={13} /> },
    { key: 'packages' as const, label: L('Packages', '软件包'), icon: <Package size={13} /> },
  ]

  return (
    <div className="page">
      <PageHeader
        title={data.name || data.login}
        subtitle={`@${data.login}`}
        actions={
          <button className="btn" onClick={() => void openExternal(data.html_url)}>
            <ExternalLink size={14} />
            {t('user.viewOnGitHub')}
          </button>
        }
      />

      <section className="card card-body">
        <div className="row" style={{ alignItems: 'flex-start', gap: 18, flexWrap: 'wrap' }}>
          <Avatar user={{ avatar_url: data.avatar_url, login: data.login }} size={84} />
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{data.name || data.login}</div>
            <div className="muted mono" style={{ fontSize: 12, marginTop: 2 }}>
              {data.login}
            </div>
            <p style={{ margin: '10px 0', color: 'var(--text-2)', fontSize: 13.5, lineHeight: 1.65 }}>
              {data.description || t('org.noDescription')}
            </p>
            <div className="repo-counts">
              {data.location ? (
                <span>
                  <MapPin size={13} /> {data.location}
                </span>
              ) : null}
              {data.blog ? (
                <span>
                  <Globe2 size={13} /> {data.blog}
                </span>
              ) : null}
              {data.email ? (
                <span>
                  <Building2 size={13} /> {data.email}
                </span>
              ) : null}
              {data.created_at ? (
                <span>
                  <CalendarDays size={13} /> {t('user.joined')} {formatDate(data.created_at, lang)}
                </span>
              ) : null}
              <span>
                {t('user.followers')} {data.followers?.toLocaleString()}
              </span>
              <span>
                {t('user.publicRepos')} {data.public_repos?.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <div className="tabs" style={{ borderBottom: 0, padding: 0 }}>
            {tabs.map((item) => (
              <button
                key={item.key}
                className={tab === item.key ? 'tab active' : 'tab'}
                onClick={() => setTab(item.key)}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {tab === 'overview' ? (
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {orgReadme.loading ? (
              <LoadingBlock />
            ) : orgReadme.data?.content ? (
              <div className="wiki-body">
                <Markdown markdown={decodeBase64(orgReadme.data.content)} owner={org} repo=".github" />
              </div>
            ) : (
              <div className="readme-empty">{L('No organization profile README', '暂无组织简介')}</div>
            )}
            <div>
              <div className="card-title" style={{ marginBottom: 8 }}>
                {L('Popular repositories', '热门仓库')}
              </div>
              {popularRepos.loading ? (
                <LoadingBlock />
              ) : !popularRepos.data?.length ? (
                <div className="readme-empty">{t('org.noRepos')}</div>
              ) : (
                <div className="list">
                  {popularRepos.data.map((repo) => (
                    <RepoRow
                      key={repo.id}
                      repo={repo}
                      onClick={() => navigate({ name: 'repo', owner: repo.owner.login, repo: repo.name })}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}

        {tab === 'repos' ? (
          <>
            {repos.loading ? (
              <LoadingBlock />
            ) : repos.error ? (
              <div style={{ padding: 16 }}>
                <ErrorBlock message={repos.error} onRetry={repos.reload} />
              </div>
            ) : !repos.data?.length ? (
              <EmptyState icon={<BookOpen size={20} />} title={t('org.noRepos')} />
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
          </>
        ) : null}

        {tab === 'members' ? (
          <>
            <div className="card-head" style={{ padding: '10px 16px' }}>
              <span className="card-sub">{L('Filter by role', '按角色筛选')}</span>
              <select
                className="select"
                style={{ width: 150, height: 30 }}
                value={memberRole}
                onChange={(event) => {
                  setMemberRole(event.target.value as MemberRole)
                  setMemberPage(1)
                }}
                aria-label={L('Role', '角色')}
              >
                <option value="all">{L('All roles', '全部角色')}</option>
                <option value="admin">{L('Admin', '管理员')}</option>
                <option value="member">{L('Member', '成员')}</option>
              </select>
            </div>
            {members.loading ? (
              <LoadingBlock />
            ) : members.error ? (
              <div style={{ padding: 16 }}>
                <ErrorBlock message={members.error} onRetry={members.reload} />
              </div>
            ) : !members.data?.length ? (
              <EmptyState icon={<Users size={20} />} title={t('org.noMembers')} />
            ) : (
              <div className="list">
                {members.data.map((member) => (
                  <button
                    className="list-item"
                    key={member.id}
                    onClick={() => navigate({ name: 'user', login: member.login })}
                  >
                    <Avatar user={member} size={28} />
                    <div className="item-main">
                      <div className="item-title">{member.login}</div>
                    </div>
                    <ExternalLink size={13} color="var(--muted)" />
                  </button>
                ))}
              </div>
            )}
            <Pagination
              page={memberPage}
              onPage={setMemberPage}
              hasNext={(members.data?.length || 0) === 30}
              loading={members.loading}
            />
          </>
        ) : null}

        {tab === 'teams' ? (
          !authenticated ? (
            <div className="readme-empty">{t('org.teamsLogin')}</div>
          ) : teams.loading ? (
            <LoadingBlock />
          ) : teams.error ? (
            <div style={{ padding: 16 }}>
              <ErrorBlock message={teams.error} onRetry={teams.reload} />
            </div>
          ) : !teams.data?.length ? (
            <EmptyState icon={<ShieldCheck size={20} />} title={t('org.noTeams')} />
          ) : (
            <div className="list">
              {teams.data.map((item) => (
                <button className="list-item" key={item.id} onClick={() => setTeam(item)}>
                  <ShieldCheck size={16} color="var(--muted)" />
                  <div className="item-main">
                    <div className="item-title">{item.name}</div>
                    <div className="item-meta">
                      <span className="mono">@{item.slug}</span>
                      {item.description ? <span>{item.description}</span> : null}
                    </div>
                  </div>
                  <span className="badge">
                    {item.privacy === 'closed' ? t('org.privacy.closed') : t('org.privacy.visible')}
                  </span>
                </button>
              ))}
            </div>
          )
        ) : null}

        {tab === 'projects' ? (
          projects.loading ? (
            <LoadingBlock />
          ) : projects.error ? (
            <div style={{ padding: 16 }}>
              <ErrorBlock message={projects.error} onRetry={projects.reload} />
            </div>
          ) : !projects.data?.organization?.projectsV2.nodes.length ? (
            <EmptyState icon={<Layers size={20} />} title={L('No projects', '没有项目')} />
          ) : (
            <div className="list">
              {projects.data.organization.projectsV2.nodes.map((project) => (
                <button className="list-item" key={project.id} onClick={() => void openExternal(project.url)}>
                  <Layers size={16} color="var(--muted)" />
                  <div className="item-main">
                    <div className="item-title">
                      <span className="truncate">{project.title}</span>
                      {project.closed ? <Badge>{L('Closed', '已关闭')}</Badge> : null}
                    </div>
                    {project.shortDescription ? <div className="item-desc">{project.shortDescription}</div> : null}
                  </div>
                  <ExternalLink size={13} color="var(--muted)" />
                </button>
              ))}
            </div>
          )
        ) : null}

        {tab === 'packages' ? (
          packagesLoading ? (
            <LoadingBlock />
          ) : !packages.length ? (
            <EmptyState
              icon={<Package size={20} />}
              title={L('No packages', '没有软件包')}
              text={L(
                'Packages published to this organization will appear here.',
                '该组织发布的软件包会显示在这里。',
              )}
            />
          ) : (
            <div className="list">
              {packages.map((pkg) => (
                <button
                  className="list-item"
                  key={`${pkg.package_type}-${pkg.id}`}
                  onClick={() => {
                    if (pkg.html_url) void openExternal(pkg.html_url)
                  }}
                >
                  <Package size={16} color="var(--muted)" />
                  <div className="item-main">
                    <div className="item-title">
                      <span className="truncate">{pkg.name}</span>
                      <Badge tone="blue">{pkg.package_type}</Badge>
                    </div>
                    <div className="item-meta">
                      <span>{pkg.package_type}</span>
                      {pkg.visibility ? <span>{pkg.visibility}</span> : null}
                      {typeof pkg.version_count === 'number' ? (
                        <span>{L(`${pkg.version_count} versions`, `${pkg.version_count} 个版本`)}</span>
                      ) : null}
                    </div>
                  </div>
                  <ExternalLink size={13} color="var(--muted)" />
                </button>
              ))}
            </div>
          )
        ) : null}
      </section>

      {team ? <TeamModal org={org} team={team} onClose={() => setTeam(null)} /> : null}
    </div>
  )
}

function TeamModal({ org, team, onClose }: { org: string; team: Team; onClose: () => void }) {
  const { t, navigate } = useApp()
  const [tab, setTab] = useState<'members' | 'repos'>('members')
  const members = useGh<Member[]>(`/orgs/${org}/teams/${team.slug}/members?per_page=100`)
  const repos = useGh<any[]>(`/orgs/${org}/teams/${team.slug}/repos?per_page=100`)

  return (
    <Modal
      wide
      title={team.name}
      subtitle={`@${team.slug} · ${team.privacy === 'closed' ? t('org.privacy.closed') : t('org.privacy.visible')}`}
      onClose={onClose}
    >
      <div className="tabs" style={{ borderBottom: 0, padding: 0, marginBottom: 12 }}>
        <button className={tab === 'members' ? 'tab active' : 'tab'} onClick={() => setTab('members')}>
          {t('org.teamMembers')}
        </button>
        <button className={tab === 'repos' ? 'tab active' : 'tab'} onClick={() => setTab('repos')}>
          {t('org.teamRepos')}
        </button>
      </div>

      {tab === 'members' ? (
        members.loading ? (
          <LoadingBlock />
        ) : members.error ? (
          <ErrorBlock message={members.error} onRetry={members.reload} />
        ) : !members.data?.length ? (
          <div className="readme-empty">{t('org.teamEmptyMembers')}</div>
        ) : (
          <div className="list" style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            {members.data.map((member) => (
              <button
                className="list-item"
                key={member.id}
                onClick={() => {
                  onClose()
                  navigate({ name: 'user', login: member.login })
                }}
              >
                <Avatar user={member} size={26} />
                <div className="item-main">
                  <div className="item-title">{member.login}</div>
                </div>
              </button>
            ))}
          </div>
        )
      ) : repos.loading ? (
        <LoadingBlock />
      ) : repos.error ? (
        <ErrorBlock message={repos.error} onRetry={repos.reload} />
      ) : !repos.data?.length ? (
        <div className="readme-empty">{t('org.teamEmptyRepos')}</div>
      ) : (
        <div className="list" style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          {repos.data.map((repo) => (
            <RepoRow
              key={repo.id}
              repo={repo}
              onClick={() => {
                onClose()
                navigate({ name: 'repo', owner: repo.owner.login, repo: repo.name })
              }}
            />
          ))}
        </div>
      )}
    </Modal>
  )
}
