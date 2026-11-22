import { useEffect, useMemo, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { Building2, FolderGit2, GitFork, Plus, RefreshCw, Search, Star } from 'lucide-react'
import { useApp } from '../lib/store'
import { useGh } from '../lib/hooks'
import { apiErrorMessage, gh } from '../lib/api'
import {
  Badge,
  EmptyState,
  ErrorBlock,
  LoadingBlock,
  LockGate,
  Modal,
  PageHeader,
  RepoRow,
  TimeAgo,
} from '../components/ui'
import { Pagination } from '../components/Pagination'
import type { GhRepo, GhSearchResult } from '../lib/types'
import { compactNumber } from '../lib/format'

type Tab = 'mine' | 'starred' | 'orgs'
type Org = { id: number; login: string; avatar_url: string; description: string | null }
type Visibility = 'all' | 'public' | 'private'
type RepoSort = 'updated' | 'pushed' | 'full_name' | 'stars'

export function ReposPage() {
  const { t, lang, authenticated, sessionVersion, navigate, openLogin, toast } = useApp()
  const L = (en: string, zh: string) => (lang === 'zh' ? zh : en)
  const [tab, setTab] = useState<Tab>('mine')
  const [filter, setFilter] = useState('')
  const [org, setOrg] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [minePage, setMinePage] = useState(1)
  const [starredPage, setStarredPage] = useState(1)
  const [orgsPage, setOrgsPage] = useState(1)
  const [orgRepoPage, setOrgRepoPage] = useState(1)
  const [visibility, setVisibility] = useState<Visibility>('all')
  const [sort, setSort] = useState<RepoSort>('updated')
  const [direction, setDirection] = useState<'desc' | 'asc'>('desc')
  const [language, setLanguage] = useState('')
  const [includeArchived, setIncludeArchived] = useState(true)

  const mine = useGh<GhRepo[]>(
    authenticated && tab === 'mine'
      ? `/user/repos?visibility=${visibility}&sort=${sort}&direction=${direction}&per_page=30&page=${minePage}&affiliation=owner,collaborator,organization_member`
      : null,
    [sessionVersion, minePage, tab, visibility, sort, direction],
  )
  const starred = useGh<GhRepo[]>(
    authenticated && tab === 'starred'
      ? `/user/starred?sort=updated&per_page=30&page=${starredPage}`
      : null,
    [sessionVersion, starredPage, tab],
  )
  const orgs = useGh<Org[]>(
    authenticated && tab === 'orgs' ? `/user/orgs?per_page=30&page=${orgsPage}` : null,
    [sessionVersion, orgsPage, tab],
  )
  const orgRepos = useGh<GhRepo[]>(
    authenticated && tab === 'orgs' && org
      ? `/orgs/${org}/repos?sort=updated&per_page=30&page=${orgRepoPage}`
      : null,
    [org, sessionVersion, orgRepoPage, tab],
  )

  const since = useMemo(() => new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10), [])
  const popular = useGh<GhSearchResult<GhRepo>>(
    authenticated ? null : `/search/repositories?q=stars:>2000+pushed:>${since}&sort=stars&order=desc&per_page=20`,
  )

  const matchText = (repo: GhRepo) => {
    if (!filter.trim()) return true
    const term = filter.trim().toLowerCase()
    return (
      repo.name.toLowerCase().includes(term) ||
      repo.full_name.toLowerCase().includes(term) ||
      (repo.description || '').toLowerCase().includes(term)
    )
  }

  const mineFiltered = useMemo(() => {
    let list = (mine.data || []).filter(matchText)
    if (language) list = list.filter((repo) => repo.language === language)
    if (!includeArchived) list = list.filter((repo) => !repo.archived)
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mine.data, filter, language, includeArchived])

  const starredFiltered = useMemo(() => {
    return (starred.data || []).filter(matchText)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [starred.data, filter])

  const languages = useMemo(() => {
    const values = new Set<string>()
    for (const repo of mine.data || []) {
      if (repo.language) values.add(repo.language)
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b))
  }, [mine.data])

  if (!authenticated) {
    return (
      <div className="page">
        <PageHeader
          title={t('repos.title')}
          subtitle={t('repos.subtitle')}
          actions={
            <button className="btn primary" onClick={openLogin}>
              {t('app.unlock')}
            </button>
          }
        />
        <LockGate title={t('repos.emptyAnonTitle')} text={t('repos.emptyAnonText')} />
        <section className="card">
          <div className="card-head">
            <div>
              <div className="card-title">{t('repos.popular')}</div>
              <div className="card-sub">{t('dashboard.trendingHint')}</div>
            </div>
          </div>
          <div className="list">
            {popular.loading ? (
              <LoadingBlock />
            ) : popular.error ? (
              <div style={{ padding: 16 }}>
                <ErrorBlock message={popular.error} onRetry={popular.reload} />
              </div>
            ) : popular.data?.items?.length ? (
              popular.data.items.map((repo) => (
                <RepoRow
                  key={repo.id}
                  repo={repo}
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
              <EmptyState title={t('repos.empty')} />
            )}
          </div>
        </section>
      </div>
    )
  }

  const activeLoading = tab === 'mine' ? mine : tab === 'starred' ? starred : orgRepos
  const activeList =
    tab === 'mine' ? mineFiltered : tab === 'starred' ? starredFiltered : orgRepos.data || []

  return (
    <div className="page">
      <PageHeader
        title={t('repos.title')}
        subtitle={t('repos.subtitle')}
        actions={
          <>
            <div className="search-box" style={{ width: 240 }}>
              <Search size={14} />
              <input
                value={filter}
                onChange={(event) => {
                  setFilter(event.target.value)
                  setMinePage(1)
                  setStarredPage(1)
                }}
                placeholder={t('repos.searchPlaceholder')}
                disabled={tab === 'orgs' && !org}
              />
            </div>
            <button className="btn" onClick={activeLoading.reload} disabled={activeLoading.loading}>
              <RefreshCw size={14} />
              {t('app.refresh')}
            </button>
            <button className="btn primary" onClick={() => setCreateOpen(true)}>
              <Plus size={14} />
              {t('repos.create')}
            </button>
          </>
        }
      />

      <section className="card">
        <div className="tabs">
          <button className={tab === 'mine' ? 'tab active' : 'tab'} onClick={() => setTab('mine')}>
            <FolderGit2 size={14} />
            {t('repos.myRepos')}
          </button>
          <button className={tab === 'starred' ? 'tab active' : 'tab'} onClick={() => setTab('starred')}>
            <Star size={14} />
            {t('repos.starred')}
          </button>
          <button className={tab === 'orgs' ? 'tab active' : 'tab'} onClick={() => setTab('orgs')}>
            <Building2 size={14} />
            {t('repos.orgs')}
          </button>
        </div>

        {tab === 'mine' ? (
          <div className="card-head" style={{ padding: '10px 16px', flexWrap: 'wrap' }}>
            <div className="row wrap" style={{ gap: 8 }}>
              <select
                className="select"
                style={{ width: 130, height: 30 }}
                value={visibility}
                onChange={(event) => {
                  setVisibility(event.target.value as Visibility)
                  setMinePage(1)
                }}
                aria-label={L('Visibility', '可见性')}
              >
                <option value="all">{L('All repos', '全部仓库')}</option>
                <option value="public">{L('Public', '公开')}</option>
                <option value="private">{L('Private', '私有')}</option>
              </select>
              <select
                className="select"
                style={{ width: 140, height: 30 }}
                value={sort}
                onChange={(event) => {
                  setSort(event.target.value as RepoSort)
                  setMinePage(1)
                }}
                aria-label={L('Sort', '排序')}
              >
                <option value="updated">{L('Recently updated', '最近更新')}</option>
                <option value="pushed">{L('Recently pushed', '最近推送')}</option>
                <option value="full_name">{L('Name', '名称')}</option>
                <option value="stars">{L('Most stars', '星标最多')}</option>
              </select>
              <select
                className="select"
                style={{ width: 120, height: 30 }}
                value={direction}
                onChange={(event) => {
                  setDirection(event.target.value as 'desc' | 'asc')
                  setMinePage(1)
                }}
                aria-label={L('Direction', '方向')}
              >
                <option value="desc">{L('Descending', '降序')}</option>
                <option value="asc">{L('Ascending', '升序')}</option>
              </select>
              <select
                className="select"
                style={{ width: 150, height: 30 }}
                value={language}
                onChange={(event) => {
                  setLanguage(event.target.value)
                  setMinePage(1)
                }}
                aria-label={L('Language', '语言')}
              >
                <option value="">{L('All languages', '所有语言')}</option>
                {languages.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
            <label className="row" style={{ gap: 8, fontSize: 12.5, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={includeArchived}
                onChange={(event) => setIncludeArchived(event.target.checked)}
              />
              {L('Include archived', '包含归档仓库')}
            </label>
          </div>
        ) : null}

        {tab === 'orgs' ? (
          org ? (
            <>
              <div className="card-head" style={{ padding: '10px 16px' }}>
                <button
                  className="btn small ghost"
                  onClick={() => {
                    setOrg('')
                    setOrgRepoPage(1)
                  }}
                >
                  {t('repos.backToOrgs')}
                </button>
                <Badge tone="blue">{org}</Badge>
              </div>
              {renderRepoList(orgRepos, t('repos.empty'), navigate)}
            </>
          ) : orgs.loading ? (
            <LoadingBlock />
          ) : orgs.error ? (
            <div style={{ padding: 16 }}>
              <ErrorBlock message={orgs.error} onRetry={orgs.reload} />
            </div>
          ) : !orgs.data?.length ? (
            <EmptyState icon={<Building2 size={20} />} title={t('repos.orgsEmpty')} />
          ) : (
            <div className="list">
              {orgs.data.map((item) => (
                <button
                  className="list-item"
                  key={item.id}
                  onClick={() => {
                    setOrg(item.login)
                    setOrgRepoPage(1)
                  }}
                >
                  <div className="repo-avatar">
                    <img src={item.avatar_url} alt={item.login} />
                  </div>
                  <div className="item-main">
                    <div className="item-title">{item.login}</div>
                    <div className="item-desc">{item.description || t('repos.selectOrg')}</div>
                  </div>
                </button>
              ))}
            </div>
          )
        ) : activeLoading.loading ? (
          <LoadingBlock />
        ) : activeLoading.error ? (
          <div style={{ padding: 16 }}>
            <ErrorBlock message={activeLoading.error} onRetry={activeLoading.reload} />
          </div>
        ) : !activeList.length ? (
          <EmptyState
            icon={<FolderGit2 size={20} />}
            title={tab === 'starred' ? t('repos.noStarred') : t('repos.empty')}
          />
        ) : (
          <div className="list">
            {activeList.map((repo) => (
              <RepoRow
                key={repo.id}
                repo={repo}
                onClick={() => navigate({ name: 'repo', owner: repo.owner.login, repo: repo.name })}
                right={
                  <>
                    <TimeAgo iso={repo.updated_at} />
                    <StarButton owner={repo.owner.login} repo={repo.name} />
                  </>
                }
              />
            ))}
          </div>
        )}

        {tab === 'orgs' ? (
          org ? (
            <Pagination
              page={orgRepoPage}
              onPage={setOrgRepoPage}
              hasNext={(orgRepos.data?.length || 0) === 30}
              loading={orgRepos.loading}
            />
          ) : (
            <Pagination
              page={orgsPage}
              onPage={setOrgsPage}
              hasNext={(orgs.data?.length || 0) === 30}
              loading={orgs.loading}
            />
          )
        ) : (
          <Pagination
            page={tab === 'starred' ? starredPage : minePage}
            onPage={tab === 'starred' ? setStarredPage : setMinePage}
            hasNext={(tab === 'mine' ? mine.data?.length : starred.data?.length) === 30}
            loading={activeLoading.loading}
          />
        )}
      </section>

      {createOpen ? (
        <CreateRepo
          onClose={() => setCreateOpen(false)}
          onCreated={(fullName) => {
            mine.reload()
            toast(t('repos.created'), 'success')
            const [ownerName, repoName] = fullName.split('/')
            navigate({ name: 'repo', owner: ownerName, repo: repoName })
          }}
        />
      ) : null}
    </div>
  )
}

function renderRepoList(
  state: { loading: boolean; error: string | null; data: GhRepo[] | null; reload: () => void },
  empty: string,
  navigate: (route: { name: 'repo'; owner: string; repo: string }) => void,
) {
  if (state.loading) return <LoadingBlock />
  if (state.error) {
    return (
      <div style={{ padding: 16 }}>
        <ErrorBlock message={state.error} onRetry={state.reload} />
      </div>
    )
  }
  if (!state.data?.length) return <EmptyState icon={<FolderGit2 size={20} />} title={empty} />
  return (
    <div className="list">
      {state.data.map((repo) => (
        <RepoRow
          key={repo.id}
          repo={repo}
          onClick={() => navigate({ name: 'repo', owner: repo.owner.login, repo: repo.name })}
          right={<StarButton owner={repo.owner.login} repo={repo.name} />}
        />
      ))}
    </div>
  )
}

function StarButton({ owner, repo }: { owner: string; repo: string }) {
  const { t, lang, authenticated, openLogin, toast } = useApp()
  const L = (en: string, zh: string) => (lang === 'zh' ? zh : en)
  const [starred, setStarred] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!authenticated) {
      setStarred(false)
      return
    }
    let alive = true
    gh(`/user/starred/${owner}/${repo}`).then((res) => {
      if (alive) setStarred(res.ok)
    })
    return () => {
      alive = false
    }
  }, [owner, repo, authenticated])

  const toggle = async (event: ReactMouseEvent) => {
    event.stopPropagation()
    if (!authenticated) {
      openLogin()
      return
    }
    if (busy) return
    setBusy(true)
    const res = await gh(`/user/starred/${owner}/${repo}`, { method: starred ? 'DELETE' : 'PUT' })
    setBusy(false)
    if (res.ok || res.status === 204) {
      setStarred(!starred)
      toast(starred ? L('Unstarred', '已取消星标') : t('repo.starred'), 'success')
    }
  }

  return (
    <span
      className="btn small ghost"
      role="button"
      tabIndex={-1}
      title={starred ? t('repo.starred') : t('repo.star')}
      style={{
        color: starred ? 'var(--yellow)' : undefined,
        opacity: busy ? 0.5 : undefined,
        cursor: 'pointer',
      }}
      onClick={(event) => void toggle(event)}
    >
      <Star size={12} fill={starred ? 'currentColor' : 'none'} />
      {starred ? t('repo.starred') : t('repo.star')}
    </span>
  )
}

function CreateRepo({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (fullName: string) => void
}) {
  const { t, lang, user } = useApp()
  const L = (en: string, zh: string) => (lang === 'zh' ? zh : en)
  const [owner, setOwner] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)
  const [autoInit, setAutoInit] = useState(true)
  const [gitignore, setGitignore] = useState('')
  const [license, setLicense] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const owners = useGh<Org[]>('/user/orgs?per_page=100')
  const gitignores = useGh<string[]>('/gitignore/templates')
  const licenses = useGh<{ key: string; name: string }[]>('/licenses')

  const create = async () => {
    if (!name.trim()) {
      setError(t('repos.needName'))
      return
    }
    setBusy(true)
    setError('')
    const body: Record<string, unknown> = {
      name: name.trim(),
      description,
      private: isPrivate,
      auto_init: autoInit,
    }
    if (gitignore) body.gitignore_template = gitignore
    if (license) body.license_template = license
    const res = await gh(owner ? `/orgs/${owner}/repos` : '/user/repos', {
      method: 'POST',
      body,
    })
    setBusy(false)
    if (res.ok) {
      onCreated(res.data.full_name)
      onClose()
    } else {
      setError(apiErrorMessage(res.data, t('app.requestFailed', { status: res.status })))
    }
  }

  return (
    <Modal
      title={t('repos.createTitle')}
      subtitle={t('repos.createHint')}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            {t('app.cancel')}
          </button>
          <button className="btn primary" onClick={() => void create()} disabled={busy}>
            {busy ? <span className="spinner" /> : <Plus size={14} />}
            {t('common.create')}
          </button>
        </>
      }
    >
      <div className="field" style={{ marginBottom: 12 }}>
        <label className="field-label">{L('Owner', '所有者')}</label>
        <select className="select" value={owner} onChange={(event) => setOwner(event.target.value)}>
          <option value="">{user ? L(`${user.login} (you)`, `${user.login}（你）`) : L('Your account', '你的账户')}</option>
          {(owners.data || []).map((item) => (
            <option key={item.id} value={item.login}>
              {item.login}
            </option>
          ))}
        </select>
      </div>
      <div className="field" style={{ marginBottom: 12 }}>
        <label className="field-label">{t('repos.name')}</label>
        <input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="my-project" />
      </div>
      <div className="field" style={{ marginBottom: 12 }}>
        <label className="field-label">{t('repos.desc')}</label>
        <textarea className="textarea" value={description} onChange={(event) => setDescription(event.target.value)} />
      </div>
      <div className="row wrap" style={{ gap: 12, marginBottom: 12 }}>
        <div className="field" style={{ flex: 1, minWidth: 180 }}>
          <label className="field-label">{L('.gitignore template', '.gitignore 模板')}</label>
          <select className="select" value={gitignore} onChange={(event) => setGitignore(event.target.value)}>
            <option value="">{L('None', '无')}</option>
            {(gitignores.data || []).map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ flex: 1, minWidth: 180 }}>
          <label className="field-label">{L('License', '许可证')}</label>
          <select className="select" value={license} onChange={(event) => setLicense(event.target.value)}>
            <option value="">{L('None', '无')}</option>
            {(licenses.data || []).map((item) => (
              <option key={item.key} value={item.key}>
                {item.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="row wrap" style={{ gap: 18 }}>
        <label className="row" style={{ gap: 8, fontSize: 12.5, cursor: 'pointer' }}>
          <input type="checkbox" checked={isPrivate} onChange={(event) => setIsPrivate(event.target.checked)} />
          {t('repo.privateRepo')}
        </label>
        <label className="row" style={{ gap: 8, fontSize: 12.5, cursor: 'pointer' }}>
          <input type="checkbox" checked={autoInit} onChange={(event) => setAutoInit(event.target.checked)} />
          {t('repos.autoInit')}
        </label>
      </div>
      {error ? (
        <div style={{ marginTop: 12 }}>
          <ErrorBlock message={error} />
        </div>
      ) : null}
    </Modal>
  )
}
