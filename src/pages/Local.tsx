import { useCallback, useEffect, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  GitBranch,
  GitCommitHorizontal,
  FolderOpen,
  FolderPlus,
  FolderGit2,
  History,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import { useApp } from '../lib/store'
import { getDesktop } from '../lib/desktop'
import { Badge, EmptyState, ErrorBlock, LoadingBlock, Modal, PageHeader } from '../components/ui'
import type { LocalGitCommit, LocalGitStatus } from '../lib/types'

type LocalRepo = { path: string; name: string }

function loadRepos(): LocalRepo[] {
  try {
    const raw = localStorage.getItem('dg.localRepos')
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed.filter((item) => item && typeof item.path === 'string')
    return []
  } catch {
    return []
  }
}

function baseName(dir: string) {
  return dir.split(/[\\/]/).filter(Boolean).pop() || dir
}

function firstLine(text: string) {
  return text.split('\n').filter(Boolean).slice(0, 2).join(' ')
}

export function LocalPage() {
  const { t, toast } = useApp()
  const desktop = getDesktop()
  const [repos, setRepos] = useState<LocalRepo[]>(loadRepos)
  const [selected, setSelected] = useState<string | null>(null)
  const [status, setStatus] = useState<LocalGitStatus | null>(null)
  const [commits, setCommits] = useState<LocalGitCommit[]>([])
  const [branches, setBranches] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [gitReady, setGitReady] = useState<boolean | null>(null)
  const [cloneOpen, setCloneOpen] = useState(false)
  const [cloneUrl, setCloneUrl] = useState('')
  const [cloneParent, setCloneParent] = useState('')
  const [cloneError, setCloneError] = useState('')

  const persist = (next: LocalRepo[]) => {
    setRepos(next)
    try {
      localStorage.setItem('dg.localRepos', JSON.stringify(next))
    } catch {
      /* ignore */
    }
  }

  const refresh = useCallback(async (dir: string) => {
    const api = getDesktop()
    if (!api) return
    setLoading(true)
    const [st, lg, br] = await Promise.all([api.git.status(dir), api.git.log(dir), api.git.branches(dir)])
    setStatus(st)
    setCommits(lg.commits || [])
    setBranches(br.branches || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    const api = getDesktop()
    if (!api) {
      setGitReady(false)
      return
    }
    api.git.version().then((res) => setGitReady(res.ok))
    api.app.info().then((info) => {
      setCloneParent((prev) => prev || info.home)
    })
  }, [])

  useEffect(() => {
    if (!selected && repos.length > 0) setSelected(repos[0].path)
  }, [repos, selected])

  useEffect(() => {
    if (selected) {
      setStatus(null)
      setMessage('')
      void refresh(selected)
    }
  }, [selected, refresh])

  useEffect(() => {
    const pending = sessionStorage.getItem('dg.pendingClone')
    if (pending) {
      sessionStorage.removeItem('dg.pendingClone')
      setCloneUrl(pending)
      setCloneOpen(true)
    }
  }, [])

  const addPath = async (dir: string) => {
    const api = getDesktop()
    if (!api) return
    const validation = await api.git.validate(dir)
    if (!validation.ok) {
      toast(t('local.notRepo'), 'error')
      return
    }
    if (!repos.some((item) => item.path === dir)) {
      persist([...repos, { path: dir, name: baseName(dir) }])
    }
    setSelected(dir)
    toast(t('local.added'), 'success')
  }

  const addExisting = async () => {
    const api = getDesktop()
    if (!api) return
    const dir = await api.git.pickDirectory()
    if (dir) await addPath(dir)
  }

  const pickParent = async () => {
    const api = getDesktop()
    if (!api) return
    const dir = await api.git.pickDirectory()
    if (dir) setCloneParent(dir)
  }

  const runClone = async () => {
    const api = getDesktop()
    if (!api) return
    if (!cloneUrl.trim()) return
    if (!cloneParent.trim()) {
      setCloneError(t('local.chooseFolder'))
      return
    }
    setBusy('clone')
    setCloneError('')
    const res = await api.git.clone({ url: cloneUrl.trim(), parentDir: cloneParent })
    setBusy(null)
    if (res.ok && res.path) {
      const next = repos.some((item) => item.path === res.path) ? repos : [...repos, { path: res.path, name: baseName(res.path) }]
      persist(next)
      setSelected(res.path)
      setCloneOpen(false)
      setCloneUrl('')
      toast(t('local.cloneSuccess', { path: res.path }), 'success')
    } else {
      setCloneError(firstLine(res.stderr) || t('local.cloneFailed'))
    }
  }

  const runCommit = async () => {
    const api = getDesktop()
    if (!api || !selected) return
    if (!status?.files?.length) {
      toast(t('local.noChanges'), 'info')
      return
    }
    if (!message.trim()) {
      toast(t('local.needMessage'), 'error')
      return
    }
    setBusy('commit')
    const res = await api.git.commitAll({ dir: selected, message: message.trim() })
    setBusy(null)
    if (res.ok) {
      setMessage('')
      toast(t('local.commitSuccess'), 'success')
      void refresh(selected)
    } else {
      toast(firstLine(res.stderr) || t('local.commitSuccess'), 'error')
    }
  }

  const runPush = async () => {
    const api = getDesktop()
    if (!api || !selected) return
    setBusy('push')
    const res = await api.git.push(selected)
    setBusy(null)
    if (res.ok) {
      toast(t('local.pushed'), 'success')
      void refresh(selected)
    } else {
      toast(`${t('local.pushFailed')}: ${firstLine(res.stderr)}`, 'error')
    }
  }

  const runPull = async () => {
    const api = getDesktop()
    if (!api || !selected) return
    setBusy('pull')
    const res = await api.git.pull(selected)
    setBusy(null)
    if (res.ok) {
      toast(t('local.pulled'), 'success')
      void refresh(selected)
    } else {
      toast(`${t('local.pullFailed')}: ${firstLine(res.stderr)}`, 'error')
    }
  }

  const runCheckout = async (branch: string) => {
    const api = getDesktop()
    if (!api || !selected) return
    setBusy('checkout')
    const res = await api.git.checkout({ dir: selected, branch })
    setBusy(null)
    if (res.ok) {
      toast(t('local.checkoutDone', { branch }), 'success')
      void refresh(selected)
    } else {
      toast(firstLine(res.stderr) || 'Checkout failed', 'error')
    }
  }

  const removeRepo = (path: string) => {
    const next = repos.filter((item) => item.path !== path)
    persist(next)
    if (selected === path) {
      setSelected(next[0]?.path || null)
      setStatus(null)
    }
    toast(t('local.removed'), 'info')
  }

  const fileFlag = (x: string, y: string) => {
    const flag = y !== ' ' && y !== '?' ? y : x
    const tone = flag === '?' || flag === 'A' ? 'add' : flag === 'D' ? 'del' : 'mod'
    return { letter: flag === '?' ? 'U' : flag, tone }
  }

  return (
    <div className="page">
      <PageHeader
        title={t('local.title')}
        subtitle={t('local.subtitle')}
        actions={
          <>
            <button className="btn" onClick={() => void addExisting()} disabled={!desktop}>
              <FolderPlus size={14} />
              {t('local.add')}
            </button>
            <button className="btn primary" onClick={() => setCloneOpen(true)} disabled={!desktop}>
              <Plus size={14} />
              {t('local.clone')}
            </button>
          </>
        }
      />

      {gitReady === false ? (
        <section className="card card-body">
          <ErrorBlock message={`${t('local.gitMissing')} — ${t('local.gitMissingText')}`} />
        </section>
      ) : repos.length === 0 ? (
        <section className="card">
          <EmptyState
            icon={<FolderGit2 size={20} />}
            title={t('local.empty')}
            text={t('local.emptyText')}
            action={
              <div className="action-row" style={{ justifyContent: 'center' }}>
                <button className="btn primary" onClick={() => setCloneOpen(true)} disabled={!desktop}>
                  <Plus size={14} />
                  {t('local.clone')}
                </button>
                <button className="btn" onClick={() => void addExisting()} disabled={!desktop}>
                  <FolderPlus size={14} />
                  {t('local.add')}
                </button>
              </div>
            }
          />
        </section>
      ) : (
        <div className="local-grid">
          <aside className="local-list">
            {repos.map((repo) => (
              <button
                key={repo.path}
                className={repo.path === selected ? 'local-card active' : 'local-card'}
                onClick={() => setSelected(repo.path)}
              >
                <span className="local-card-name">
                  <FolderGit2 size={14} />
                  {repo.name}
                </span>
                <span className="local-card-path" title={repo.path}>
                  {repo.path}
                </span>
                {repo.path === selected && status ? (
                  <span className="local-card-meta">
                    <span>
                      <GitBranch size={11} /> {status.branch}
                    </span>
                    <span>
                      {status.files?.length
                        ? t('local.changes', { n: status.files.length })
                        : t('local.clean')}
                    </span>
                  </span>
                ) : null}
              </button>
            ))}
          </aside>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
            {!selected ? (
              <section className="card">
                <LoadingBlock />
              </section>
            ) : loading && !status ? (
              <section className="card">
                <LoadingBlock label={t('local.loading')} />
              </section>
            ) : status && !status.ok ? (
              <section className="card card-body">
                <ErrorBlock message={status.error || t('local.notRepo')} onRetry={() => void refresh(selected)} />
              </section>
            ) : status ? (
              <>
                <section className="card">
                  <div className="card-head">
                    <div style={{ minWidth: 0 }}>
                      <div className="card-title">
                        <FolderGit2 size={15} />
                        {baseName(selected)}
                      </div>
                      <div className="card-sub mono truncate" title={selected}>
                        {selected}
                      </div>
                    </div>
                    <div className="action-row">
                      <select
                        className="select"
                        style={{ width: 'auto', height: 32, minWidth: 140 }}
                        value={status.branch || ''}
                        onChange={(event) => void runCheckout(event.target.value)}
                        disabled={busy === 'checkout'}
                        aria-label={t('local.branch')}
                      >
                        {(branches.includes(status.branch || '') ? branches : [status.branch || '', ...branches])
                          .filter(Boolean)
                          .map((branch) => (
                            <option key={branch} value={branch}>
                              {branch}
                            </option>
                          ))}
                      </select>
                      <button
                        className="icon-btn"
                        title={t('local.openFolder')}
                        onClick={() => void desktop?.git.openFolder(selected)}
                      >
                        <FolderOpen size={15} />
                      </button>
                      <button className="icon-btn" title={t('local.refresh')} onClick={() => void refresh(selected)}>
                        <RefreshCw size={15} />
                      </button>
                      <button className="icon-btn" title={t('local.remove')} onClick={() => removeRepo(selected)}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                  <div className="card-body">
                    <div className="row wrap" style={{ gap: 10 }}>
                      <Badge tone="blue">
                        <GitBranch size={10} />
                        {status.branch}
                      </Badge>
                      {status.ahead ? (
                        <Badge tone="green">
                          <ArrowUp size={10} />
                          {t('local.ahead', { n: status.ahead })}
                        </Badge>
                      ) : null}
                      {status.behind ? (
                        <Badge tone="gold">
                          <ArrowDown size={10} />
                          {t('local.behind', { n: status.behind })}
                        </Badge>
                      ) : null}
                      {!status.hasUpstream ? <Badge>{t('local.noUpstream')}</Badge> : null}
                      {status.lastCommit ? (
                        <span className="muted" style={{ fontSize: 11.5 }}>
                          {t('local.lastCommit')}: <span className="mono">{status.lastCommit.hash}</span> {status.lastCommit.subject}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </section>

                <section className="card">
                  <div className="card-head">
                    <div className="card-title">
                      <GitCommitHorizontal size={15} />
                      {t('local.status')}
                    </div>
                    <Badge tone={status.files?.length ? 'gold' : 'green'}>
                      {status.files?.length ? t('local.changes', { n: status.files.length }) : t('local.clean')}
                    </Badge>
                  </div>
                  <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                    {status.files?.length ? (
                      status.files.map((file) => {
                        const { letter, tone } = fileFlag(file.x, file.y)
                        return (
                          <div className="status-row" key={file.path + file.x + file.y}>
                            <span className={`status-flag ${tone}`}>{letter}</span>
                            <span className="status-path" title={file.path}>
                              {file.path}
                            </span>
                          </div>
                        )
                      })
                    ) : (
                      <div className="readme-empty">{t('local.clean')}</div>
                    )}
                  </div>
                  <div className="card-body" style={{ borderTop: '1px solid var(--border)' }}>
                    <textarea
                      className="textarea"
                      value={message}
                      onChange={(event) => setMessage(event.target.value)}
                      placeholder={t('local.commitMessagePlaceholder')}
                      rows={3}
                    />
                    <div className="action-row" style={{ marginTop: 10, alignItems: 'center' }}>
                      <button
                        className="btn primary"
                        onClick={() => void runCommit()}
                        disabled={busy !== null || !status.files?.length || !message.trim()}
                      >
                        {busy === 'commit' ? <span className="spinner" /> : <GitCommitHorizontal size={14} />}
                        {t('local.commit')}
                      </button>
                      <button className="btn" onClick={() => void runPull()} disabled={busy !== null}>
                        {busy === 'pull' ? <span className="spinner" /> : <ArrowDown size={14} />}
                        {t('local.pull')}
                      </button>
                      <button className="btn" onClick={() => void runPush()} disabled={busy !== null}>
                        {busy === 'push' ? <span className="spinner" /> : <ArrowUp size={14} />}
                        {t('local.push')}
                      </button>
                      <span className="spacer" />
                      <span className="muted" style={{ fontSize: 11 }}>
                        {t('local.commitHint')}
                      </span>
                    </div>
                  </div>
                </section>

                <section className="card">
                  <div className="card-head">
                    <div className="card-title">
                      <History size={15} />
                      {t('local.history')}
                    </div>
                    <span className="muted" style={{ fontSize: 11.5 }}>
                      {commits.length}
                    </span>
                  </div>
                  {commits.length === 0 ? (
                    <div className="readme-empty">{t('local.noHistory')}</div>
                  ) : (
                    <div className="log-list">
                      {commits.map((commit) => (
                        <div className="log-item" key={commit.sha}>
                          <span className="log-sha">{commit.short}</span>
                          <div className="log-main">
                            <div className="log-subject" title={commit.subject}>
                              {commit.subject}
                            </div>
                            <div className="log-meta">
                              {commit.author} · {commit.date}
                              {commit.refs ? ` · ${commit.refs}` : ''}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </>
            ) : (
              <section className="card">
                <LoadingBlock label={t('local.loading')} />
              </section>
            )}
          </div>
        </div>
      )}

      {cloneOpen ? (
        <Modal
          title={t('local.cloneTitle')}
          subtitle={t('local.cloneHint')}
          onClose={() => {
            setCloneOpen(false)
            setCloneError('')
          }}
          footer={
            <>
              <button
                className="btn ghost"
                onClick={() => {
                  setCloneOpen(false)
                  setCloneError('')
                }}
              >
                {t('app.cancel')}
              </button>
              <button className="btn primary" onClick={() => void runClone()} disabled={busy === 'clone' || !desktop}>
                {busy === 'clone' ? <span className="spinner" /> : <FolderGit2 size={14} />}
                {busy === 'clone' ? t('local.cloning') : t('local.cloneAction')}
              </button>
            </>
          }
        >
          <div className="field" style={{ marginBottom: 14 }}>
            <label className="field-label">{t('local.repoUrl')}</label>
            <input
              className="input mono"
              value={cloneUrl}
              onChange={(event) => setCloneUrl(event.target.value)}
              placeholder={t('local.repoUrlPlaceholder')}
              spellCheck={false}
            />
          </div>
          <div className="field">
            <label className="field-label">{t('local.parentDir')}</label>
            <div className="row">
              <input className="input mono" value={cloneParent} onChange={(event) => setCloneParent(event.target.value)} />
              <button className="btn" onClick={() => void pickParent()} disabled={!desktop}>
                {t('local.chooseFolder')}
              </button>
            </div>
          </div>
          {cloneError ? (
            <div style={{ marginTop: 12 }}>
              <ErrorBlock message={cloneError} />
            </div>
          ) : null}
          {!desktop ? (
            <div className="note" style={{ marginTop: 12 }}>
              <span>{t('auth.notSupportedBrowser')}</span>
            </div>
          ) : null}
        </Modal>
      ) : null}
    </div>
  )
}
