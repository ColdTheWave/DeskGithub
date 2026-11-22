import { useEffect, useMemo, useState } from 'react'
import hljs from 'highlight.js'
import {
  Activity,
  BookOpen,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Code2,
  Copy,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FilePlus2,
  File as FileIcon,
  Flag,
  Folder,
  FolderGit2,
  FolderKanban,
  GitCommitHorizontal,
  GitCompare,
  GitFork,
  GitPullRequest,
  ListChecks,
  Lock,
  MessagesSquare,
  Package,
  Pencil,
  Plus,
  Settings2,
  ShieldCheck,
  Star,
  Tag,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react'
import { useApp } from '../lib/store'
import { apiErrorMessage, gh } from '../lib/api'
import { useGh } from '../lib/hooks'
import { Avatar, Badge, EmptyState, ErrorBlock, LoadingBlock, Modal, TimeAgo } from '../components/ui'
import { Markdown } from '../components/Markdown'
import { IssueRow } from '../components/Items'
import { Pagination } from '../components/Pagination'
import {
  FileEditorModal,
  IssueComposerModal,
  MilestonesModal,
  PullComposerModal,
  RepoSettingsModal,
} from '../components/RepoModals'
import { LabelsModal } from '../components/LabelsModal'
import { ContributorsModal } from '../components/ContributorsModal'
import { WikiModal } from '../components/WikiModal'
import { CommunityModal } from '../components/CommunityModal'
import { PeopleModal } from '../components/PeopleModal'
import { CompareModal } from '../components/CompareModal'
import { FileHistoryModal } from '../components/FileHistoryModal'
import { UploadFilesModal } from '../components/UploadFilesModal'
import { CommitsTab } from './repo/CommitsTab'
import { ReleasesTab } from './repo/ReleasesTab'
import { ActionsTab } from './repo/ActionsTab'
import { DiscussionsTab } from './repo/DiscussionsTab'
import { ProjectsTab } from './repo/ProjectsTab'
import { EventsTab } from './repo/EventsTab'
import { InsightsTab } from './repo/InsightsTab'
import { SecurityTab } from './repo/SecurityTab'
import type { GhBranch, GhContentItem, GhIssue, GhPull, GhRepo } from '../lib/types'
import { bytes, decodeBase64, detectLanguage, languageColor } from '../lib/format'
import { openExternal } from '../lib/desktop'

const BINARY_EXT = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'pdf', 'zip', 'gz', 'tgz', 'tar', 'rar', '7z',
  'woff', 'woff2', 'ttf', 'otf', 'eot', 'mp3', 'mp4', 'mov', 'avi', 'wav', 'flac', 'psd',
  'exe', 'dll', 'so', 'dylib', 'class', 'jar', 'wasm',
])

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function isBinary(path: string) {
  const ext = path.split('.').pop()?.toLowerCase() || ''
  return BINARY_EXT.has(ext)
}

type Tab =
  | 'code'
  | 'commits'
  | 'issues'
  | 'pulls'
  | 'events'
  | 'discussions'
  | 'actions'
  | 'releases'
  | 'projects'
  | 'insights'
  | 'security'

export function RepoPage({ owner, repo }: { owner: string; repo: string }) {
  const { t, lang, authenticated, openLogin, navigate, toast, sessionVersion } = useApp()
  const L = (en: string, zh: string) => (lang === 'zh' ? zh : en)
  const [tab, setTab] = useState<Tab>('code')
  const [branch, setBranch] = useState('')
  const [dirPath, setDirPath] = useState('')
  const [filePath, setFilePath] = useState<string | null>(null)
  const [fileVersion, setFileVersion] = useState(0)
  const [issueState, setIssueState] = useState<'open' | 'closed' | 'all'>('open')
  const [issuePage, setIssuePage] = useState(1)
  const [pullPage, setPullPage] = useState(1)
  const [labelFilter, setLabelFilter] = useState('')
  const [assigneeFilter, setAssigneeFilter] = useState('')
  const [milestoneFilter, setMilestoneFilter] = useState('')
  const [issueSort, setIssueSort] = useState('updated')
  const [gotoValue, setGotoValue] = useState('')
  const [cloneOpen, setCloneOpen] = useState(false)
  const [starred, setStarred] = useState(false)
  const [starBusy, setStarBusy] = useState(false)
  const [watching, setWatching] = useState(false)
  const [forkBusy, setForkBusy] = useState(false)
  const [branchModal, setBranchModal] = useState(false)
  const [newBranch, setNewBranch] = useState('')
  const [branchBusy, setBranchBusy] = useState(false)
  const [editor, setEditor] = useState<
    null | { mode: 'new' | 'edit'; path: string; content: string; sha?: string }
  >(null)
  const [issueComposer, setIssueComposer] = useState(false)
  const [pullComposer, setPullComposer] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [milestonesOpen, setMilestonesOpen] = useState(false)
  const [labelsOpen, setLabelsOpen] = useState(false)
  const [contributorsOpen, setContributorsOpen] = useState(false)
  const [wikiOpen, setWikiOpen] = useState(false)
  const [communityOpen, setCommunityOpen] = useState(false)
  const [peopleModal, setPeopleModal] = useState<'stargazers' | 'watchers' | 'forks' | null>(null)
  const [compareOpen, setCompareOpen] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [watchMenuOpen, setWatchMenuOpen] = useState(false)

  const repoQuery = useGh<GhRepo>(`/repos/${owner}/${repo}`, [sessionVersion])
  const data = repoQuery.data

  useEffect(() => {
    if (data && !branch) setBranch(data.default_branch)
  }, [data, branch])

  useEffect(() => {
    setBranch('')
    setDirPath('')
    setFilePath(null)
    setTab('code')
    setIssuePage(1)
    setPullPage(1)
    setLabelFilter('')
    setAssigneeFilter('')
    setMilestoneFilter('')
    setIssueSort('updated')
    setGotoValue('')
    setCloneOpen(false)
    setCompareOpen(false)
    setUploadOpen(false)
    setEditor(null)
    setSettingsOpen(false)
    setMilestonesOpen(false)
    setBranchModal(false)
    setNewBranch('')
  }, [owner, repo])

  useEffect(() => {
    if (!authenticated || !data) {
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
  }, [authenticated, owner, repo, data, sessionVersion])

  useEffect(() => {
    if (!authenticated || !data) {
      setWatching(false)
      return
    }
    let alive = true
    gh(`/repos/${owner}/${repo}/subscription`).then((res) => {
      if (alive) setWatching(res.ok)
    })
    return () => {
      alive = false
    }
  }, [authenticated, owner, repo, data, sessionVersion])

  const branches = useGh<GhBranch[]>(`/repos/${owner}/${repo}/branches?per_page=100`)

  const contentsPath =
    branch && tab === 'code'
      ? `/repos/${owner}/${repo}/contents${dirPath ? '/' + dirPath.split('/').map(encodeURIComponent).join('/') : ''}?ref=${encodeURIComponent(branch)}`
      : null
  const contents = useGh<GhContentItem[] | GhContentItem>(contentsPath, [branch, dirPath, tab])

  const readme = useGh<GhContentItem>(
    tab === 'code' && dirPath === '' && !filePath && branch
      ? `/repos/${owner}/${repo}/readme?ref=${encodeURIComponent(branch)}`
      : null,
    [branch, dirPath, filePath, tab],
  )

  const headCommit = useGh<any[]>(
    tab === 'code' && branch
      ? `/repos/${owner}/${repo}/commits?sha=${encodeURIComponent(branch)}&per_page=1`
      : null,
    [branch, tab],
  )

  const issues = useGh<GhIssue[]>(
    tab === 'issues'
      ? `/repos/${owner}/${repo}/issues?state=${issueState}&per_page=30&page=${issuePage}&sort=${issueSort}&direction=desc${labelFilter ? `&labels=${encodeURIComponent(labelFilter)}` : ''}${assigneeFilter ? `&assignee=${encodeURIComponent(assigneeFilter)}` : ''}${milestoneFilter ? `&milestone=${encodeURIComponent(milestoneFilter)}` : ''}`
      : null,
    [tab, issueState, issuePage, labelFilter, assigneeFilter, milestoneFilter, issueSort],
  )
  const issueLabelOptions = useGh<{ id: number; name: string }[]>(
    tab === 'issues' ? `/repos/${owner}/${repo}/labels?per_page=100` : null,
  )
  const issueAssigneeOptions = useGh<{ id: number; login: string }[]>(
    tab === 'issues' ? `/repos/${owner}/${repo}/assignees?per_page=100` : null,
  )
  const issueMilestoneOptions = useGh<{ id: number; title: string }[]>(
    tab === 'issues' ? `/repos/${owner}/${repo}/milestones?state=open&per_page=100` : null,
  )

  const pulls = useGh<GhPull[]>(
    tab === 'pulls'
      ? `/repos/${owner}/${repo}/pulls?state=${issueState === 'all' ? 'all' : issueState}&per_page=30&page=${pullPage}&sort=updated`
      : null,
    [tab, issueState, pullPage],
  )

  const latestRelease = useGh<any>(`/repos/${owner}/${repo}/releases/latest`)

  const entries = useMemo(() => {
    if (!Array.isArray(contents.data)) return []
    return [...contents.data].sort((a, b) => {
      if (a.type === 'dir' && b.type !== 'dir') return -1
      if (a.type !== 'dir' && b.type === 'dir') return 1
      return a.name.localeCompare(b.name)
    })
  }, [contents.data])

  const issueItems = useMemo(() => (issues.data || []).filter((item) => !item.pull_request), [issues.data])
  const readmeText = useMemo(() => {
    if (!readme.data?.content) return ''
    try {
      return decodeBase64(readme.data.content)
    } catch {
      return ''
    }
  }, [readme.data])

  const toggleStar = async () => {
    if (!authenticated) {
      toast(t('repo.loginToStar'), 'info')
      openLogin()
      return
    }
    setStarBusy(true)
    const res = await gh(`/user/starred/${owner}/${repo}`, { method: starred ? 'DELETE' : 'PUT' })
    setStarBusy(false)
    if (res.ok || res.status === 204) {
      setStarred(!starred)
      repoQuery.reload()
      toast(t('repo.starred'), 'success')
    }
  }

  const toggleWatch = async () => {
    if (!authenticated) {
      openLogin()
      return
    }
    const res = await gh(`/repos/${owner}/${repo}/subscription`, {
      method: watching ? 'DELETE' : 'PUT',
      body: watching ? undefined : { subscribed: true },
    })
    if (res.ok || res.status === 204) {
      setWatching(!watching)
      toast(t(watching ? 'repo.unwatched' : 'repo.watching'), 'success')
    }
  }

  const setWatchMode = async (mode: 'watching' | 'ignored' | 'none') => {
    setWatchMenuOpen(false)
    if (!authenticated) {
      openLogin()
      return
    }
    const res =
      mode === 'none'
        ? await gh(`/repos/${owner}/${repo}/subscription`, { method: 'DELETE' })
        : await gh(`/repos/${owner}/${repo}/subscription`, {
            method: 'PUT',
            body: { subscribed: mode === 'watching', ignored: mode === 'ignored' },
          })
    if (res.ok || res.status === 204) {
      setWatching(mode === 'watching')
      toast(
        mode === 'none'
          ? t('repo.unwatched')
          : mode === 'ignored'
            ? L('Notifications ignored', '已忽略通知')
            : t('repo.watching'),
        'success',
      )
    }
  }

  const refreshFiles = () => {
    setFileVersion((value) => value + 1)
    contents.reload()
    readme.reload()
  }

  const deleteFile = async (sha: string) => {
    if (!filePath) return
    if (!window.confirm(t('repo.deleteFileConfirm', { path: filePath }))) return
    const encoded = filePath.split('/').map(encodeURIComponent).join('/')
    const res = await gh(`/repos/${owner}/${repo}/contents/${encoded}`, {
      method: 'DELETE',
      body: { message: `Delete ${filePath}`, sha, branch },
    })
    if (res.ok) {
      toast(t('repo.fileDeleted'), 'success')
      setFilePath(null)
      refreshFiles()
    } else {
      toast(apiErrorMessage(res.data, t('app.requestFailed', { status: res.status })), 'error')
    }
  }

  const forkRepo = async () => {
    if (!authenticated) {
      openLogin()
      return
    }
    setForkBusy(true)
    const res = await gh(`/repos/${owner}/${repo}/forks`, { method: 'POST' })
    setForkBusy(false)
    if (res.ok && res.data?.full_name) {
      toast(t('repo.forked'), 'success')
      const [nextOwner, nextRepo] = String(res.data.full_name).split('/')
      navigate({ name: 'repo', owner: nextOwner, repo: nextRepo })
    } else {
      toast(apiErrorMessage(res.data, t('repo.forkFailed')), 'error')
    }
  }

  const createBranch = async () => {
    const name = newBranch.trim()
    if (!name) {
      toast(t('repo.needBranchName'), 'error')
      return
    }
    const source = branches.data?.find((item) => item.name === branch)
    if (!source) {
      toast(t('repo.branchCreateFailed'), 'error')
      return
    }
    setBranchBusy(true)
    const res = await gh(`/repos/${owner}/${repo}/git/refs`, {
      method: 'POST',
      body: { ref: `refs/heads/${name}`, sha: source.commit.sha },
    })
    setBranchBusy(false)
    if (res.ok) {
      toast(t('repo.branchCreated'), 'success')
      setBranchModal(false)
      setNewBranch('')
      setBranch(name)
      branches.reload()
    } else {
      toast(apiErrorMessage(res.data, t('repo.branchCreateFailed')), 'error')
    }
  }

  const deleteBranch = async () => {
    if (!data || branch === data.default_branch) return
    if (!window.confirm(t('repo.deleteBranchConfirm', { branch }))) return
    const res = await gh(`/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, {
      method: 'DELETE',
    })
    if (res.ok || res.status === 204) {
      toast(t('repo.branchDeleted'), 'success')
      setBranch(data.default_branch)
      setFilePath(null)
      branches.reload()
    } else {
      toast(apiErrorMessage(res.data, t('app.requestFailed', { status: res.status })), 'error')
    }
  }

  const startClone = () => {
    sessionStorage.setItem('dg.pendingClone', `https://github.com/${owner}/${repo}.git`)
    navigate({ name: 'local' })
  }

  const openItem = (item: { number: number }, kind: 'issue' | 'pull') => {
    navigate({ name: 'issue', owner, repo, number: item.number, kind })
  }

  const onIssueCreated = (number: number) => {
    issues.reload()
    navigate({ name: 'issue', owner, repo, number, kind: 'issue' })
  }

  const onPullCreated = (number: number) => {
    pulls.reload()
    navigate({ name: 'issue', owner, repo, number, kind: 'pull' })
  }

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast(t('app.copied'), 'success')
    } catch {
      toast(t('app.error'), 'error')
    }
  }

  const openGoto = () => {
    const value = gotoValue.trim()
    if (!value) return
    const found = entries.find(
      (entry) =>
        entry.name.toLowerCase() === value.toLowerCase() ||
        entry.path.toLowerCase() === value.toLowerCase(),
    )
    if (found) {
      if (found.type === 'dir') {
        setDirPath(found.path)
        setFilePath(null)
      } else {
        setFilePath(found.path)
      }
    } else {
      setFilePath(dirPath ? `${dirPath}/${value}` : value)
    }
    setGotoValue('')
  }

  const cloneUrl = `https://github.com/${owner}/${repo}.git`
  const sshUrl = `git@github.com:${owner}/${repo}.git`
  const cliCommand = `gh repo clone ${owner}/${repo}`
  const zipUrl = `https://codeload.github.com/${owner}/${repo}/zip/refs/heads/${branch || data?.default_branch || 'main'}`

  if (repoQuery.loading) return <LoadingBlock />

  if (repoQuery.error || !data) {
    return (
      <div className="page">
        <div className="card card-body">
          <ErrorBlock message={repoQuery.error || t('repo.notFound')} onRetry={repoQuery.reload} />
        </div>
      </div>
    )
  }

  const segments = dirPath ? dirPath.split('/') : []
  const showAbout = tab === 'code' && dirPath === '' && !filePath

  return (
    <div className="page">
      <section className="repo-header">
        <div className="repo-header-row">
          <div className="repo-hero-main">
            <div className="repo-title">
              <BookOpen size={16} color="var(--muted)" />
              <button className="owner" onClick={() => navigate({ name: 'user', login: data.owner.login })}>
                {data.owner.login}
              </button>
              <span className="owner" style={{ marginLeft: -4 }}>/</span>
              <span>{data.name}</span>
              {data.private ? (
                <Badge tone="gold">
                  <Lock size={10} />
                  {t('repos.private')}
                </Badge>
              ) : (
                <Badge tone="green">{t('repos.public')}</Badge>
              )}
            </div>
          </div>
          <div className="repo-hero-actions">
          <div className="gh-menu-wrap">
            <button className="btn" onClick={() => setWatchMenuOpen((value) => !value)}>
              {watching ? <EyeOff size={14} /> : <Eye size={14} />}
              {watching ? t('repo.unwatch') : t('repo.watch')}
              <ChevronDown size={12} />
            </button>
            {watchMenuOpen ? (
              <div className="gh-menu">
                <div className="gh-menu-label">{L('Notifications', '通知')}</div>
                <button onClick={() => void setWatchMode('watching')}>
                  <Eye size={14} />
                  {L('All activity', '所有动态')}
                </button>
                <button onClick={() => void setWatchMode('ignored')}>
                  <EyeOff size={14} />
                  {L('Ignore', '忽略')}
                </button>
                <div className="gh-menu-sep" />
                <button onClick={() => void setWatchMode('none')}>
                  <EyeOff size={14} />
                  {L('Stop watching', '停止关注')}
                </button>
              </div>
            ) : null}
          </div>
            <button className="btn" onClick={() => void forkRepo()} disabled={forkBusy}>
              <GitFork size={14} />
              {t('repo.fork')}
            </button>
            <button className="btn" onClick={() => void toggleStar()} disabled={starBusy}>
              <Star size={14} fill={starred ? 'currentColor' : 'none'} />
              {starred ? t('repo.starred') : t('repo.star')}
            </button>
            <div className="gh-menu-wrap">
              <button className="btn primary" onClick={() => setCloneOpen((value) => !value)}>
                <FolderGit2 size={14} />
                {t('repo.clone')}
              </button>
              {cloneOpen ? (
                <div className="gh-menu" style={{ minWidth: 240 }}>
                  <div className="gh-menu-label">{L('Clone', '克隆')}</div>
                  <button
                    onClick={() => {
                      setCloneOpen(false)
                      void copyText(cloneUrl)
                    }}
                  >
                    <ExternalLink size={14} />
                    HTTPS · {cloneUrl}
                  </button>
                  <button
                    onClick={() => {
                      setCloneOpen(false)
                      void copyText(sshUrl)
                    }}
                  >
                    <ExternalLink size={14} />
                    SSH · {sshUrl}
                  </button>
                  <button
                    onClick={() => {
                      setCloneOpen(false)
                      void copyText(cliCommand)
                    }}
                  >
                    <FolderGit2 size={14} />
                    {cliCommand}
                  </button>
                  <div className="gh-menu-sep" />
                  <button
                    onClick={() => {
                      setCloneOpen(false)
                      void openExternal(zipUrl)
                    }}
                  >
                    <Download size={14} />
                    {L('Download ZIP', '下载 ZIP')}
                  </button>
                  <button
                    onClick={() => {
                      setCloneOpen(false)
                      startClone()
                    }}
                  >
                    <FolderGit2 size={14} />
                    {t('nav.local')}
                  </button>
                </div>
              ) : null}
            </div>
            <button
              className="icon-btn"
              title={t('repo.openOnGitHub')}
              onClick={() => void openExternal(data.html_url)}
            >
              <ExternalLink size={15} />
            </button>
            {authenticated ? (
              <button
                className="icon-btn"
                title={t('repo.settings')}
                onClick={() => setSettingsOpen(true)}
              >
                <Settings2 size={15} />
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <div className={showAbout ? 'repo-body' : undefined}>
        <div className={showAbout ? 'repo-body-main' : undefined}>
      <section className="card">
        <div className="tabs">
          {(
            [
              { key: 'code', label: t('repo.code'), icon: <BookOpen size={14} /> },
              { key: 'commits', label: t('repo.commits'), icon: <GitCommitHorizontal size={14} /> },
              { key: 'issues', label: t('repo.issues'), icon: <CircleDot size={14} />, count: data.open_issues_count },
              { key: 'pulls', label: t('repo.pulls'), icon: <GitPullRequest size={14} /> },
              { key: 'events', label: t('repo.events'), icon: <Activity size={14} /> },
              { key: 'discussions', label: t('repo.discussions'), icon: <MessagesSquare size={14} /> },
              { key: 'actions', label: t('repo.actions'), icon: <ListChecks size={14} /> },
              { key: 'releases', label: t('repo.releases'), icon: <Package size={14} /> },
              { key: 'projects', label: t('repo.projects'), icon: <FolderKanban size={14} /> },
              { key: 'insights', label: L('Insights', '洞察'), icon: <Activity size={14} /> },
              { key: 'security', label: L('Security', '安全'), icon: <ShieldCheck size={14} /> },
            ] as { key: Tab; label: string; icon: React.ReactNode; count?: number }[]
          ).map((item) => (
            <button
              key={item.key}
              className={tab === item.key ? 'tab active' : 'tab'}
              onClick={() => setTab(item.key)}
            >
              {item.icon}
              {item.label}
              {item.count !== undefined ? <span className="count">{item.count}</span> : null}
            </button>
          ))}
        </div>

        {tab === 'code' ? (
          <div className="code-layout">
            <div className="file-toolbar">
              <select
                className="select"
                style={{ width: 'auto', height: 32, minWidth: 150 }}
                value={branch}
                onChange={(event) => {
                  setBranch(event.target.value)
                  setFilePath(null)
                }}
                aria-label={t('repo.branch')}
              >
                {(branches.data || []).map((item) => (
                  <option key={item.name} value={item.name}>
                    {item.name}
                  </option>
                ))}
                {branches.data?.length ? null : <option value={branch}>{branch || '—'}</option>}
              </select>
              <button
                className="icon-btn"
                title={t('repo.newBranch')}
                onClick={() => setBranchModal(true)}
                disabled={!authenticated}
              >
                <Plus size={14} />
              </button>
              {branch && branch !== data.default_branch ? (
                <button
                  className="icon-btn"
                  title={t('repo.deleteBranch')}
                  onClick={() => void deleteBranch()}
                  disabled={!authenticated}
                >
                  <Trash2 size={14} />
                </button>
              ) : null}

              <div className="crumbs">
                <button
                  className="crumb"
                  onClick={() => {
                    setDirPath('')
                    setFilePath(null)
                  }}
                >
                  {data.name}
                </button>
                {segments.map((segment, index) => (
                  <span key={segment + index} className="row" style={{ gap: 2 }}>
                    <ChevronRight size={12} color="var(--muted)" />
                    <button
                      className={index === segments.length - 1 ? 'crumb current' : 'crumb'}
                      onClick={() => {
                        setDirPath(segments.slice(0, index + 1).join('/'))
                        setFilePath(null)
                      }}
                    >
                      {segment}
                    </button>
                  </span>
                ))}
                {filePath ? (
                  <span className="row" style={{ gap: 2 }}>
                    <ChevronRight size={12} color="var(--muted)" />
                    <span className="crumb current">{filePath.split('/').pop()}</span>
                  </span>
                ) : null}
              </div>
              <div className="spacer" />
              <input
                className="input"
                style={{ height: 32, width: 150 }}
                value={gotoValue}
                onChange={(event) => setGotoValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') openGoto()
                }}
                placeholder={L('Go to file', '跳转到文件')}
                aria-label={L('Go to file', '跳转到文件')}
              />
              <button className="btn small" onClick={() => setCompareOpen(true)}>
                <GitCompare size={13} />
                {L('Compare', '比较')}
              </button>
              {authenticated ? (
                <>
                  <button
                    className="btn small"
                    onClick={() =>
                      setEditor({
                        mode: 'new',
                        path: dirPath ? `${dirPath}/` : '',
                        content: '',
                      })
                    }
                  >
                    <FilePlus2 size={13} />
                    {t('repo.newFile')}
                  </button>
                  <button className="btn small" onClick={() => setUploadOpen(true)}>
                    <Upload size={13} />
                    {L('Upload files', '上传文件')}
                  </button>
                </>
              ) : null}
              <span className="muted" style={{ fontSize: 11.5 }}>
                {entries.length ? t('repo.fileCount', { n: entries.length }) : ''}
              </span>
            </div>

            {headCommit.data?.[0] ? (
              <div
                className="row"
                style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', gap: 8, flexWrap: 'nowrap' }}
              >
                <Avatar user={headCommit.data[0].author} size={24} />
                <strong style={{ fontSize: 12.5, flex: 'none' }}>
                  {headCommit.data[0].author?.login || headCommit.data[0].commit?.author?.name || ''}
                </strong>
                <span className="truncate" style={{ fontSize: 12.5, color: 'var(--text-2)' }}>
                  {String(headCommit.data[0].commit?.message || '').split('\n')[0]}
                </span>
                <span className="spacer" />
                <span className="mono muted" style={{ fontSize: 11 }}>
                  {String(headCommit.data[0].sha || '').slice(0, 7)}
                </span>
                <TimeAgo iso={headCommit.data[0].commit?.author?.date} />
              </div>
            ) : null}

            {filePath ? (
              <FileViewer
                key={`${filePath}-${fileVersion}`}
                owner={owner}
                repo={repo}
                branch={branch}
                path={filePath}
                canEdit={authenticated}
                onEdit={(content, sha) => setEditor({ mode: 'edit', path: filePath, content, sha })}
                onDelete={(sha) => void deleteFile(sha)}
                onClose={() => setFilePath(null)}
              />
            ) : contents.loading ? (
              <LoadingBlock />
            ) : contents.error ? (
              <div style={{ padding: 16 }}>
                <ErrorBlock message={contents.error} onRetry={contents.reload} />
              </div>
            ) : (
              <div>
                {dirPath ? (
                  <button
                    className="file-row"
                    onClick={() => {
                      const parts = dirPath.split('/')
                      parts.pop()
                      setDirPath(parts.join('/'))
                    }}
                  >
                    <span className="file-icon dir">
                      <Folder size={15} />
                    </span>
                    <span className="file-name">..</span>
                    <span className="file-size">{t('repo.parentDir')}</span>
                  </button>
                ) : null}
                {entries.length === 0 ? (
                  <div className="readme-empty">{t('repo.emptyDir')}</div>
                ) : (
                  entries.map((entry) => (
                    <button
                      className="file-row"
                      key={entry.sha + entry.path}
                      onClick={() => {
                        if (entry.type === 'dir') {
                          setDirPath(entry.path)
                          setFilePath(null)
                        } else {
                          setFilePath(entry.path)
                        }
                      }}
                    >
                      <span className={entry.type === 'dir' ? 'file-icon dir' : 'file-icon'}>
                        {entry.type === 'dir' ? <Folder size={15} /> : <FileIcon size={15} />}
                      </span>
                      <span className="file-name">{entry.name}</span>
                      <span className="file-size">{entry.type === 'file' ? bytes(entry.size) : ''}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        ) : null}

        {tab === 'issues' ? (
          <div>
            <div className="card-head plain" style={{ padding: '12px 16px' }}>
              <div className="segmented">
                {(['open', 'closed', 'all'] as const).map((state) => (
                  <button
                    key={state}
                    className={issueState === state ? 'active' : ''}
                    onClick={() => {
                      setIssueState(state)
                      setIssuePage(1)
                      setPullPage(1)
                    }}
                  >
                    {state === 'open' ? t('issues.open') : state === 'closed' ? t('issues.closed') : t('issues.all')}
                  </button>
                ))}
              </div>
              <div className="action-row">
                <select
                  className="select"
                  style={{ width: 150, height: 32 }}
                  value={labelFilter}
                  onChange={(event) => {
                    setLabelFilter(event.target.value)
                    setIssuePage(1)
                  }}
                >
                  <option value="">{t('issues.allLabels')}</option>
                  {(issueLabelOptions.data || []).map((label) => (
                    <option key={label.id} value={label.name}>
                      {label.name}
                    </option>
                  ))}
                </select>
                <select
                  className="select"
                  style={{ width: 140, height: 32 }}
                  value={assigneeFilter}
                  onChange={(event) => {
                    setAssigneeFilter(event.target.value)
                    setIssuePage(1)
                  }}
                  aria-label={L('Assignee', '指派给')}
                >
                  <option value="">{L('Assignee', '指派给')}</option>
                  {(issueAssigneeOptions.data || []).map((assignee) => (
                    <option key={assignee.id} value={assignee.login}>
                      {assignee.login}
                    </option>
                  ))}
                </select>
                <select
                  className="select"
                  style={{ width: 140, height: 32 }}
                  value={milestoneFilter}
                  onChange={(event) => {
                    setMilestoneFilter(event.target.value)
                    setIssuePage(1)
                  }}
                  aria-label={L('Milestone', '里程碑')}
                >
                  <option value="">{L('Milestone', '里程碑')}</option>
                  {(issueMilestoneOptions.data || []).map((milestone) => (
                    <option key={milestone.id} value={String(milestone.id)}>
                      {milestone.title}
                    </option>
                  ))}
                </select>
                <select
                  className="select"
                  style={{ width: 130, height: 32 }}
                  value={issueSort}
                  onChange={(event) => {
                    setIssueSort(event.target.value)
                    setIssuePage(1)
                  }}
                  aria-label={L('Sort', '排序')}
                >
                  <option value="updated">{L('Recently updated', '最近更新')}</option>
                  <option value="created">{L('Newest', '最新创建')}</option>
                  <option value="comments">{L('Most commented', '评论最多')}</option>
                </select>
                <button className="btn small" onClick={() => setLabelsOpen(true)}>
                  <Tag size={13} />
                  {t('repo.labels')}
                </button>
                <button className="btn small" onClick={() => setMilestonesOpen(true)}>
                  <Flag size={13} />
                  {t('repo.milestones')}
                </button>
                <button
                  className="btn small primary"
                  onClick={() => (authenticated ? setIssueComposer(true) : openLogin())}
                >
                  <Plus size={13} />
                  {t('repo.newIssue')}
                </button>
              </div>
            </div>
            {issues.loading ? (
              <LoadingBlock />
            ) : issues.error ? (
              <div style={{ padding: 16 }}>
                <ErrorBlock message={issues.error} onRetry={issues.reload} />
              </div>
            ) : issueItems.length === 0 ? (
              <EmptyState icon={<CircleDot size={20} />} title={t('issues.noIssues')} />
            ) : (
              issueItems.map((issue) => (
                <IssueRow key={issue.id} item={issue} onClick={() => openItem(issue, 'issue')} />
              ))
            )}
            <Pagination
              page={issuePage}
              onPage={setIssuePage}
              hasNext={(issues.data?.length || 0) === 30}
              loading={issues.loading}
            />
          </div>
        ) : null}

        {tab === 'pulls' ? (
          <div>
            <div className="card-head plain" style={{ padding: '12px 16px' }}>
              <div className="segmented">
                {(['open', 'closed', 'all'] as const).map((state) => (
                  <button
                    key={state}
                    className={issueState === state ? 'active' : ''}
                    onClick={() => {
                      setIssueState(state)
                      setIssuePage(1)
                      setPullPage(1)
                    }}
                  >
                    {state === 'open' ? t('issues.open') : state === 'closed' ? t('issues.closed') : t('issues.all')}
                  </button>
                ))}
              </div>
              <div className="action-row">
                <button
                  className="btn small primary"
                  onClick={() => (authenticated ? setPullComposer(true) : openLogin())}
                >
                  <Plus size={13} />
                  {t('repo.newPull')}
                </button>
              </div>
            </div>
            {pulls.loading ? (
              <LoadingBlock />
            ) : pulls.error ? (
              <div style={{ padding: 16 }}>
                <ErrorBlock message={pulls.error} onRetry={pulls.reload} />
              </div>
            ) : !pulls.data?.length ? (
              <EmptyState icon={<GitPullRequest size={20} />} title={t('pulls.noPulls')} />
            ) : (
              pulls.data.map((pull) => (
                <IssueRow key={pull.id} item={pull} isPull onClick={() => openItem(pull, 'pull')} />
              ))
            )}
            <Pagination
              page={pullPage}
              onPage={setPullPage}
              hasNext={(pulls.data?.length || 0) === 30}
              loading={pulls.loading}
            />
          </div>
        ) : null}

        {tab === 'commits' ? (
          <CommitsTab
            owner={owner}
            repo={repo}
            branch={branch}
            onOpen={(sha) => navigate({ name: 'commit', owner, repo, sha })}
          />
        ) : null}

        {tab === 'discussions' ? <DiscussionsTab owner={owner} repo={repo} /> : null}
        {tab === 'actions' ? <ActionsTab owner={owner} repo={repo} branch={branch} /> : null}
        {tab === 'events' ? <EventsTab owner={owner} repo={repo} /> : null}
        {tab === 'releases' ? <ReleasesTab owner={owner} repo={repo} /> : null}
        {tab === 'projects' ? <ProjectsTab owner={owner} repo={repo} /> : null}
        {tab === 'insights' ? <InsightsTab owner={owner} repo={repo} /> : null}
        {tab === 'security' ? <SecurityTab owner={owner} repo={repo} /> : null}
      </section>

      {tab === 'code' && dirPath === '' && !filePath ? (
        <section className="card readme-card">
          <div className="card-head">
            <div className="card-title">
              <BookOpen size={15} />
              {t('repo.readme')}
            </div>
            <div className="row" style={{ gap: 8 }}>
              {authenticated && readme.data?.sha ? (
                <button
                  className="btn small ghost"
                  onClick={() =>
                    setEditor({
                      mode: 'edit',
                      path: readme.data?.path || 'README.md',
                      content: readmeText,
                      sha: readme.data?.sha,
                    })
                  }
                >
                  <Pencil size={13} />
                  {t('common.edit')}
                </button>
              ) : null}
              <Badge>{readme.data?.name || 'README.md'}</Badge>
            </div>
          </div>
          <div className="card-body">
            {readmeText ? (
              <Markdown markdown={readmeText} owner={owner} repo={repo} branch={branch} />
            ) : (
              <div className="readme-empty">{readme.loading ? t('app.loading') : t('repo.noReadme')}</div>
            )}
          </div>
        </section>
      ) : null}
        </div>
        {showAbout ? (
          <aside className="repo-about">
            <div className="repo-about-title">{t('repo.about')}</div>
            {data.description ? <p className="repo-about-desc">{data.description}</p> : null}
            {(data as any).homepage ? (
              <button className="repo-about-link" onClick={() => void openExternal((data as any).homepage)}>
                <ExternalLink size={13} />
                <span className="truncate">{(data as any).homepage}</span>
              </button>
            ) : null}
            {data.topics?.length ? (
              <div className="chip-row" style={{ margin: '10px 0' }}>
                {data.topics.slice(0, 10).map((topic) => (
                  <span className="repo-topic" key={topic}>
                    {topic}
                  </span>
                ))}
              </div>
            ) : null}
            <div className="repo-about-stats">
              <span
                style={{ cursor: 'pointer' }}
                title={L('View stargazers', '查看星标用户')}
                onClick={() => setPeopleModal('stargazers')}
              >
                <Star size={13} /> {data.stargazers_count.toLocaleString()}
              </span>
              <span
                style={{ cursor: 'pointer' }}
                title={L('View watchers', '查看关注者')}
                onClick={() => setPeopleModal('watchers')}
              >
                <Eye size={13} /> {(((data as any).subscribers_count as number) ?? data.watchers_count).toLocaleString()}
              </span>
              <span
                style={{ cursor: 'pointer' }}
                title={L('View forks', '查看复刻')}
                onClick={() => setPeopleModal('forks')}
              >
                <GitFork size={13} /> {data.forks_count.toLocaleString()}
              </span>
            </div>
            {data.language ? (
              <div className="row" style={{ gap: 6, fontSize: 12.5, marginBottom: 10 }}>
                <i className="dot" style={{ background: languageColor(data.language) }} />
                {data.language}
              </div>
            ) : null}
            <div className="repo-about-links">
              {latestRelease.data?.tag_name ? (
                <button className="repo-about-link" onClick={() => setTab('releases')}>
                  <Package size={13} />
                  <span className="truncate">{latestRelease.data.tag_name}</span>
                  <Badge tone="green">{L('Latest', '最新')}</Badge>
                </button>
              ) : null}
              <button className="repo-about-link" onClick={() => setContributorsOpen(true)}>
                <Users size={13} />
                {t('repo.contributors')}
              </button>
              <button className="repo-about-link" onClick={() => setWikiOpen(true)}>
                <BookOpen size={13} />
                {t('repo.wiki')}
              </button>
              <button className="repo-about-link" onClick={() => setTab('releases')}>
                <Package size={13} />
                {t('repo.releases')}
              </button>
              <button className="repo-about-link" onClick={() => setCommunityOpen(true)}>
                <ShieldCheck size={13} />
                {t('repo.community')}
              </button>
            </div>
          </aside>
        ) : null}
      </div>

      {issueComposer ? (
        <IssueComposerModal
          owner={owner}
          repo={repo}
          onClose={() => setIssueComposer(false)}
          onCreated={onIssueCreated}
        />
      ) : null}

      {pullComposer ? (
        <PullComposerModal
          owner={owner}
          repo={repo}
          branches={(branches.data || []).map((item) => item.name)}
          defaultBranch={data.default_branch}
          onClose={() => setPullComposer(false)}
          onCreated={onPullCreated}
        />
      ) : null}

      {editor ? (
        <FileEditorModal
          key={`${editor.mode}-${editor.path}`}
          owner={owner}
          repo={repo}
          branch={branch}
          mode={editor.mode}
          path={editor.path}
          initialContent={editor.content}
          sha={editor.sha}
          onClose={() => setEditor(null)}
          onSaved={refreshFiles}
        />
      ) : null}

      {settingsOpen ? (
        <RepoSettingsModal
          repo={data}
          onClose={() => setSettingsOpen(false)}
          onSaved={() => repoQuery.reload()}
          onDeleted={() => navigate({ name: 'repos' })}
        />
      ) : null}

      {milestonesOpen ? (
        <MilestonesModal owner={owner} repo={repo} onClose={() => setMilestonesOpen(false)} />
      ) : null}

      {labelsOpen ? (
        <LabelsModal owner={owner} repo={repo} onClose={() => setLabelsOpen(false)} />
      ) : null}

      {contributorsOpen ? (
        <ContributorsModal owner={owner} repo={repo} onClose={() => setContributorsOpen(false)} />
      ) : null}

      {wikiOpen ? (
        <WikiModal owner={owner} repo={repo} onClose={() => setWikiOpen(false)} />
      ) : null}

      {communityOpen ? (
        <CommunityModal owner={owner} repo={repo} onClose={() => setCommunityOpen(false)} />
      ) : null}

      {peopleModal ? (
        <PeopleModal owner={owner} repo={repo} mode={peopleModal} onClose={() => setPeopleModal(null)} />
      ) : null}

      {compareOpen ? (
        <CompareModal
          owner={owner}
          repo={repo}
          branches={(branches.data || []).map((item) => item.name)}
          defaultBranch={data.default_branch}
          onClose={() => setCompareOpen(false)}
        />
      ) : null}

      {uploadOpen ? (
        <UploadFilesModal
          owner={owner}
          repo={repo}
          branch={branch}
          dirPath={dirPath}
          onClose={() => setUploadOpen(false)}
          onUploaded={refreshFiles}
        />
      ) : null}

      {branchModal ? (
        <Modal
          title={t('repo.newBranchTitle')}
          subtitle={t('repo.branchFrom', { branch })}
          onClose={() => setBranchModal(false)}
          footer={
            <>
              <button className="btn ghost" onClick={() => setBranchModal(false)}>
                {t('app.cancel')}
              </button>
              <button className="btn primary" onClick={() => void createBranch()} disabled={branchBusy}>
                {branchBusy ? <span className="spinner" /> : <Plus size={14} />}
                {t('common.create')}
              </button>
            </>
          }
        >
          <div className="field">
            <label className="field-label">{t('repo.branchName')}</label>
            <input
              className="input mono"
              value={newBranch}
              onChange={(event) => setNewBranch(event.target.value)}
              placeholder="feature/my-branch"
              spellCheck={false}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void createBranch()
              }}
            />
          </div>
        </Modal>
      ) : null}
    </div>
  )
}

function FileViewer({
  owner,
  repo,
  branch,
  path,
  canEdit,
  onEdit,
  onDelete,
  onClose,
}: {
  owner: string
  repo: string
  branch: string
  path: string
  canEdit?: boolean
  onEdit?: (content: string, sha: string) => void
  onDelete?: (sha: string) => void
  onClose: () => void
}) {
  const { t, lang, toast } = useApp()
  const L = (en: string, zh: string) => (lang === 'zh' ? zh : en)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [state, setState] = useState<{ loading: boolean; error: string | null; content: string; item: GhContentItem | null }>(
    { loading: true, error: null, content: '', item: null },
  )

  useEffect(() => {
    let alive = true
    setState({ loading: true, error: null, content: '', item: null })
    const encoded = path.split('/').map(encodeURIComponent).join('/')
    gh<GhContentItem>(`/repos/${owner}/${repo}/contents/${encoded}?ref=${encodeURIComponent(branch)}`).then((res) => {
      if (!alive) return
      if (!res.ok) {
        const message = (res.data as any)?.message
        setState({ loading: false, error: typeof message === 'string' ? message : 'Failed to load file', content: '', item: null })
        return
      }
      const item = res.data
      if (!item.content || item.encoding !== 'base64') {
        setState({ loading: false, error: null, content: '', item })
        return
      }
      try {
        setState({ loading: false, error: null, content: decodeBase64(item.content), item })
      } catch {
        setState({ loading: false, error: 'Could not decode file', content: '', item })
      }
    })
    return () => {
      alive = false
    }
  }, [owner, repo, branch, path])

  const highlighted = useMemo(() => {
    if (!state.content) return ''
    if (isBinary(path) || state.content.length > 400_000) return escapeHtml(state.content)
    const lang = detectLanguage(path)
    try {
      if (lang && hljs.getLanguage(lang)) {
        return hljs.highlight(state.content, { language: lang, ignoreIllegals: true }).value
      }
      return hljs.highlightAuto(state.content).value
    } catch {
      return escapeHtml(state.content)
    }
  }, [state.content, path])

  const lineCount = state.content ? state.content.split('\n').length : 0
  const gutter = useMemo(() => Array.from({ length: lineCount }, (_, index) => index + 1).join('\n'), [lineCount])

  return (
    <div className="code-shell">
      <div className="code-head">
        <FileIcon size={14} color="var(--muted)" />
        <span className="mono" style={{ fontSize: 12 }}>
          {path}
        </span>
        <span className="spacer" />
        <button
          className="btn small ghost"
          title={L('Copy path', '复制路径')}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(path)
              toast(t('app.copied'), 'success')
            } catch {
              toast(t('app.error'), 'error')
            }
          }}
        >
          <Copy size={13} />
        </button>
        <button
          className="btn small ghost"
          title={L('View history', '查看历史')}
          onClick={() => setHistoryOpen(true)}
        >
          {L('History', '历史')}
        </button>
        <button
          className="btn small ghost"
          title={L('View blame', '查看逐行追溯')}
          onClick={() =>
            void openExternal(
              `https://github.com/${owner}/${repo}/blame/${encodeURIComponent(branch)}/${path
                .split('/')
                .map(encodeURIComponent)
                .join('/')}`,
            )
          }
        >
          {L('Blame', '追溯')}
        </button>
        {state.item?.size !== undefined ? <span className="muted" style={{ fontSize: 11 }}>{bytes(state.item.size)}</span> : null}
        {state.item?.download_url ? (
          <button className="btn small ghost" onClick={() => void openExternal(state.item?.download_url || '')}>
            <Code2 size={13} />
            {L('Raw', '原始文件')}
          </button>
        ) : null}
        {state.item?.download_url ? (
          <button className="btn small ghost" onClick={() => void openExternal(state.item?.download_url || '')}>
            <Download size={13} />
            {t('repo.download')}
          </button>
        ) : null}
        {canEdit && state.item?.sha ? (
          <>
            {!isBinary(path) && (state.item.size ?? 0) < 1_000_000 ? (
              <button
                className="btn small ghost"
                onClick={() => onEdit?.(state.content, state.item?.sha || '')}
                title={t('repo.editFile')}
              >
                <Pencil size={13} />
                {t('common.edit')}
              </button>
            ) : null}
            <button
              className="btn small ghost"
              style={{ color: 'var(--red)' }}
              onClick={() => onDelete?.(state.item?.sha || '')}
              title={t('repo.deleteFile')}
            >
              <Trash2 size={13} />
            </button>
          </>
        ) : null}
        <button className="btn small ghost" onClick={onClose} aria-label={t('app.close')}>
          <X size={14} />
        </button>
      </div>

      {state.loading ? (
        <LoadingBlock label={t('repo.loadingFile')} />
      ) : state.error ? (
        <div style={{ padding: 16 }}>
          <ErrorBlock message={state.error} />
        </div>
      ) : isBinary(path) ? (
        <div className="readme-empty">{t('repo.binaryFile')}</div>
      ) : !state.content && (state.item?.size ?? 0) === 0 ? (
        <div className="readme-empty">{t('repo.emptyDir')}</div>
      ) : !state.content ? (
        <div className="readme-empty">
          {t('repo.tooLarge')}
          <div style={{ marginTop: 12 }}>
            <button
              className="btn small"
              onClick={() => void openExternal(`https://github.com/${owner}/${repo}/blob/${branch}/${path}`)}
            >
              <ExternalLink size={13} />
              {t('app.openInBrowser')}
            </button>
          </div>
        </div>
      ) : (
        <div className="code-scroll">
          <div className="code-table">
            <pre className="code-gutter" style={{ margin: 0 }}>
              {gutter}
            </pre>
            <pre className="code-pre">
              <code className="hljs" dangerouslySetInnerHTML={{ __html: highlighted }} />
            </pre>
          </div>
        </div>
      )}

      {historyOpen ? (
        <FileHistoryModal
          owner={owner}
          repo={repo}
          branch={branch}
          path={path}
          onClose={() => setHistoryOpen(false)}
        />
      ) : null}
    </div>
  )
}
