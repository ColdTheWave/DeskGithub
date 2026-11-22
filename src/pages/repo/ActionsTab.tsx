import { useEffect, useMemo, useState } from 'react'
import {
  Ban,
  CheckCircle2,
  Database,
  ExternalLink,
  FileText,
  ListChecks,
  Package,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
  X,
  XCircle,
} from 'lucide-react'
import { useApp } from '../../lib/store'
import { apiErrorMessage, gh } from '../../lib/api'
import { useGh } from '../../lib/hooks'
import { Badge, EmptyState, ErrorBlock, LoadingBlock, Modal, TimeAgo } from '../../components/ui'
import { Pagination } from '../../components/Pagination'
import { getDesktop, openExternal } from '../../lib/desktop'
import { bytes, decodeBase64 } from '../../lib/format'

type Workflow = { id: number; name: string; path: string; state: string; html_url?: string }
type Run = {
  id: number
  name: string
  run_number: number
  head_branch: string | null
  event: string
  status: string
  conclusion: string | null
  created_at: string
  html_url: string
  actor: { login: string; avatar_url: string } | null
}
type Step = { name: string; status: string; conclusion: string | null; number: number }
type Job = {
  id: number
  name: string
  status: string
  conclusion: string | null
  steps: Step[]
}

function toneFor(conclusion: string | null, status: string): 'green' | 'red' | 'gold' | 'blue' | 'default' {
  if (conclusion === 'success') return 'green'
  if (conclusion === 'failure' || conclusion === 'cancelled' || conclusion === 'timed_out') return 'red'
  if (conclusion === 'skipped' || conclusion === 'neutral') return 'default'
  if (status === 'in_progress') return 'blue'
  if (status === 'queued' || status === 'waiting') return 'gold'
  return 'default'
}

function stateLabel(t: (key: string) => string, value: string | null | undefined) {
  if (!value) return '—'
  const key = `actions.state.${value}`
  const text = t(key)
  return text === key ? value : text
}

function JobsModal({ owner, repo, run, onClose }: { owner: string; repo: string; run: Run; onClose: () => void }) {
  const { t, authenticated, toast } = useApp()
  const jobs = useGh<{ jobs: Job[] }>(`/repos/${owner}/${repo}/actions/runs/${run.id}/jobs?per_page=50`)
  const [rerunning, setRerunning] = useState<number | null>(null)

  const rerunJob = async (job: Job) => {
    setRerunning(job.id)
    const res = await gh(`/repos/${owner}/${repo}/actions/jobs/${job.id}/rerun`, { method: 'POST' })
    setRerunning(null)
    if (res.ok || res.status === 201) {
      toast(t('actions.rerunDone'), 'success')
      jobs.reload()
    } else {
      toast(apiErrorMessage(res.data, t('app.requestFailed', { status: res.status })), 'error')
    }
  }

  return (
    <Modal wide title={t('actions.jobs')} subtitle={`${run.name} #${run.run_number}`} onClose={onClose}>
      {jobs.loading ? (
        <LoadingBlock label={t('actions.loadingJobs')} />
      ) : jobs.error ? (
        <ErrorBlock message={jobs.error} onRetry={jobs.reload} />
      ) : !jobs.data?.jobs?.length ? (
        <div className="readme-empty">{t('actions.empty')}</div>
      ) : (
        <div className="job-list">
          {jobs.data.jobs.map((job) => (
            <div className="job-card" key={job.id}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <div className="row" style={{ gap: 8 }}>
                  {job.conclusion === 'success' ? (
                    <CheckCircle2 size={15} color="var(--green)" />
                  ) : job.conclusion && job.conclusion !== 'success' ? (
                    <XCircle size={15} color="var(--red)" />
                  ) : (
                    <span className="spinner" />
                  )}
                  <strong style={{ fontSize: 12.5 }}>{job.name}</strong>
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <Badge tone={toneFor(job.conclusion, job.status)}>
                    {stateLabel(t, job.conclusion || job.status)}
                  </Badge>
                  {authenticated ? (
                    <button
                      className="icon-btn ghost tiny"
                      title={t('actions.rerun')}
                      onClick={() => void rerunJob(job)}
                      disabled={rerunning !== null}
                    >
                      {rerunning === job.id ? <span className="spinner" /> : <RotateCcw size={12} />}
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="job-steps">
                {job.steps?.map((step) => (
                  <div className="job-step" key={`${job.id}-${step.number}`}>
                    {step.conclusion === 'success' ? (
                      <CheckCircle2 size={12} color="var(--green)" />
                    ) : step.conclusion && step.conclusion !== 'success' ? (
                      <XCircle size={12} color="var(--red)" />
                    ) : (
                      <span className="dot" style={{ background: 'var(--muted)' }} />
                    )}
                    <span className="truncate">{step.name}</span>
                    <span className="muted" style={{ fontSize: 10.5 }}>
                      {stateLabel(t, step.conclusion || step.status)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="modal-foot" style={{ paddingLeft: 0, paddingRight: 0 }}>
        <button className="btn small" onClick={() => void openExternal(run.html_url)}>
          <ExternalLink size={13} />
          {t('actions.openLogs')}
        </button>
      </div>
    </Modal>
  )
}

export function ActionsTab({
  owner,
  repo,
  branch,
}: {
  owner: string
  repo: string
  branch: string
}) {
  const { t, lang, authenticated, openLogin, toast } = useApp()
  const L = (en: string, zh: string) => (lang === 'zh' ? zh : en)
  const [page, setPage] = useState(1)
  const [runFilter, setRunFilter] = useState<'all' | 'success' | 'failure'>('all')
  const [draftBranch, setDraftBranch] = useState('')
  const [draftEvent, setDraftEvent] = useState('')
  const [draftActor, setDraftActor] = useState('')
  const [filters, setFilters] = useState({ branch: '', event: '', actor: '' })
  const [togglingWorkflow, setTogglingWorkflow] = useState<number | null>(null)
  const hasFilters = Boolean(filters.branch || filters.event || filters.actor)
  const workflows = useGh<{ workflows: Workflow[] }>(`/repos/${owner}/${repo}/actions/workflows?per_page=50`)
  const branches = useGh<{ name: string }[]>(`/repos/${owner}/${repo}/branches?per_page=100`)
  const runs = useGh<{ workflow_runs: Run[] }>(
    `/repos/${owner}/${repo}/actions/runs?per_page=20&page=${page}${
      runFilter === 'all' ? '' : `&status=${runFilter}`
    }${filters.branch ? `&branch=${encodeURIComponent(filters.branch)}` : ''}${
      filters.event ? `&event=${encodeURIComponent(filters.event)}` : ''
    }${filters.actor ? `&actor=${encodeURIComponent(filters.actor)}` : ''}`,
    [page, runFilter, filters.branch, filters.event, filters.actor],
  )
  const [jobsRun, setJobsRun] = useState<Run | null>(null)
  const [logsRun, setLogsRun] = useState<Run | null>(null)
  const [artifactsRun, setArtifactsRun] = useState<Run | null>(null)
  const [deploymentsRun, setDeploymentsRun] = useState<Run | null>(null)
  const [workflowFile, setWorkflowFile] = useState<Workflow | null>(null)
  const [dispatchOpen, setDispatchOpen] = useState(false)
  const [workflowId, setWorkflowId] = useState('')
  const [ref, setRef] = useState(branch)
  const [inputsText, setInputsText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const openDispatch = () => {
    if (!authenticated) {
      openLogin()
      return
    }
    setWorkflowId(workflows.data?.workflows?.[0] ? String(workflows.data.workflows[0].id) : '')
    setRef(branch)
    setInputsText('')
    setError('')
    setDispatchOpen(true)
  }

  const dispatch = async () => {
    if (!workflowId) return
    let inputs: Record<string, string> | undefined
    if (inputsText.trim()) {
      try {
        const parsed = JSON.parse(inputsText)
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid')
        inputs = parsed as Record<string, string>
      } catch {
        setError(t('actions.inputsInvalid'))
        return
      }
    }
    setBusy(true)
    setError('')
    const res = await gh(`/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`, {
      method: 'POST',
      body: { ref: ref.trim() || branch, ...(inputs ? { inputs } : {}) },
    })
    setBusy(false)
    if (res.ok || res.status === 204) {
      toast(t('actions.dispatched'), 'success')
      setDispatchOpen(false)
      runs.reload()
    } else {
      setError(apiErrorMessage(res.data, t('app.requestFailed', { status: res.status })))
    }
  }

  const applyFilters = () => {
    setFilters({ branch: draftBranch.trim(), event: draftEvent, actor: draftActor.trim() })
    setPage(1)
  }

  const clearFilters = () => {
    setDraftBranch('')
    setDraftEvent('')
    setDraftActor('')
    setFilters({ branch: '', event: '', actor: '' })
    setPage(1)
  }

  const toggleWorkflow = async (workflow: Workflow) => {
    const enable = workflow.state !== 'active'
    setTogglingWorkflow(workflow.id)
    const res = await gh(
      `/repos/${owner}/${repo}/actions/workflows/${workflow.id}/${enable ? 'enable' : 'disable'}`,
      { method: 'PUT' },
    )
    setTogglingWorkflow(null)
    if (res.ok || res.status === 204) {
      toast(L(enable ? 'Workflow enabled' : 'Workflow disabled', enable ? '工作流已启用' : '工作流已禁用'), 'success')
      workflows.reload()
    } else {
      toast(apiErrorMessage(res.data, t('app.requestFailed', { status: res.status })), 'error')
    }
  }

  const rerun = async (run: Run) => {
    const res = await gh(`/repos/${owner}/${repo}/actions/runs/${run.id}/rerun-failed-jobs`, { method: 'POST' })
    if (res.ok || res.status === 201) {
      toast(t('actions.rerunDone'), 'success')
      runs.reload()
    } else {
      toast(apiErrorMessage(res.data, t('app.requestFailed', { status: res.status })), 'error')
    }
  }

  const rerunAll = async (run: Run) => {
    const res = await gh(`/repos/${owner}/${repo}/actions/runs/${run.id}/rerun`, { method: 'POST' })
    if (res.ok || res.status === 201) {
      toast(t('actions.rerunAllDone'), 'success')
      runs.reload()
    } else {
      toast(apiErrorMessage(res.data, t('app.requestFailed', { status: res.status })), 'error')
    }
  }

  const cancelRun = async (run: Run) => {
    const res = await gh(`/repos/${owner}/${repo}/actions/runs/${run.id}/cancel`, { method: 'POST' })
    if (res.ok || res.status === 202 || res.status === 204) {
      toast(t('actions.cancelled'), 'success')
      runs.reload()
    } else {
      toast(apiErrorMessage(res.data, t('actions.cancelFailed')), 'error')
    }
  }

  return (
    <div>
      <div className="card-head" style={{ padding: '12px 16px' }}>
        <div className="card-title">
          <ListChecks size={15} />
          {t('actions.title')}
        </div>
        <div className="action-row">
          <div className="segmented">
            {(['all', 'success', 'failure'] as const).map((filter) => (
              <button
                key={filter}
                className={runFilter === filter ? 'active' : ''}
                onClick={() => {
                  setRunFilter(filter)
                  setPage(1)
                }}
              >
                {filter === 'all'
                  ? t('actions.filterAll')
                  : filter === 'success'
                    ? t('actions.filterSuccess')
                    : t('actions.filterFailure')}
              </button>
            ))}
          </div>
          <button className="btn small" onClick={runs.reload} disabled={runs.loading}>
            <RefreshCw size={13} />
          </button>
          <button
            className="btn small primary"
            onClick={openDispatch}
            disabled={Boolean(workflows.data && workflows.data.workflows.length === 0)}
          >
            <Play size={13} />
            {t('actions.dispatch')}
          </button>
        </div>
      </div>

      <div
        className="row wrap"
        style={{ padding: '10px 16px', gap: 8, borderBottom: '1px solid var(--border)' }}
      >
        <input
          className="input"
          style={{ flex: '1 1 140px', minWidth: 110, maxWidth: 220, height: 30 }}
          value={draftBranch}
          onChange={(event) => setDraftBranch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') applyFilters()
          }}
          placeholder={L('Branch', '分支')}
          list="actions-branch-options"
        />
        <datalist id="actions-branch-options">
          {(branches.data || []).map((item) => (
            <option key={item.name} value={item.name} />
          ))}
        </datalist>
        <select
          className="select"
          style={{ flex: '0 0 auto', width: 170, height: 30 }}
          value={draftEvent}
          onChange={(event) => setDraftEvent(event.target.value)}
        >
          <option value="">{L('All events', '全部事件')}</option>
          <option value="push">push</option>
          <option value="pull_request">pull_request</option>
          <option value="workflow_dispatch">workflow_dispatch</option>
          <option value="schedule">schedule</option>
        </select>
        <input
          className="input"
          style={{ flex: '1 1 120px', minWidth: 100, maxWidth: 180, height: 30 }}
          value={draftActor}
          onChange={(event) => setDraftActor(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') applyFilters()
          }}
          placeholder={L('Actor', '触发者')}
        />
        <button className="btn small" onClick={applyFilters}>
          <Search size={13} />
          {L('Filter', '筛选')}
        </button>
        {hasFilters ? (
          <button className="btn small ghost" onClick={clearFilters}>
            <X size={13} />
            {L('Clear', '清空')}
          </button>
        ) : null}
      </div>

      {runs.loading ? (
        <LoadingBlock />
      ) : runs.error ? (
        <div style={{ padding: 16 }}>
          <ErrorBlock message={runs.error} onRetry={runs.reload} />
        </div>
      ) : !runs.data?.workflow_runs?.length ? (
        <EmptyState icon={<ListChecks size={20} />} title={t('actions.empty')} />
      ) : (
        <div className="list">
          {runs.data.workflow_runs.map((run) => (
            <div className="list-item" key={run.id} style={{ alignItems: 'flex-start' }}>
              <div className="run-status" style={{ marginTop: 2 }}>
                {run.conclusion === 'success' ? (
                  <CheckCircle2 size={17} color="var(--green)" />
                ) : run.conclusion && run.conclusion !== 'success' ? (
                  <XCircle size={17} color="var(--red)" />
                ) : (
                  <span className="spinner" />
                )}
              </div>
              <div className="item-main">
                <div className="item-title">
                  {run.name}
                  <span className="muted" style={{ fontWeight: 500 }}>
                    {t('actions.runNumber', { n: run.run_number })}
                  </span>
                  <Badge tone={toneFor(run.conclusion, run.status)}>
                    {stateLabel(t, run.conclusion || run.status)}
                  </Badge>
                </div>
                <div className="item-meta">
                  <span>{run.head_branch || '—'}</span>
                  <span>{run.event}</span>
                  <span>
                    <TimeAgo iso={run.created_at} />
                  </span>
                  {run.actor ? <span>{run.actor.login}</span> : null}
                </div>
              </div>
              <div className="action-row">
                <button className="btn small ghost" onClick={() => setJobsRun(run)}>
                  {t('actions.jobs')}
                </button>
                <button className="icon-btn ghost" title={t('actions.logs')} onClick={() => setLogsRun(run)}>
                  <FileText size={14} />
                </button>
                <button
                  className="icon-btn ghost"
                  title={t('actions.artifacts')}
                  onClick={() => setArtifactsRun(run)}
                >
                  <Package size={14} />
                </button>
                {authenticated ? (
                  <button
                    className="icon-btn ghost"
                    title={t('actions.deployments')}
                    onClick={() => setDeploymentsRun(run)}
                  >
                    <ShieldCheck size={14} />
                  </button>
                ) : null}
                {authenticated && run.conclusion === 'failure' ? (
                  <button className="icon-btn ghost" title={t('actions.rerun')} onClick={() => void rerun(run)}>
                    <RotateCcw size={14} />
                  </button>
                ) : null}
                {authenticated && run.status === 'completed' ? (
                  <button className="icon-btn ghost" title={t('actions.rerunAll')} onClick={() => void rerunAll(run)}>
                    <RefreshCw size={14} />
                  </button>
                ) : null}
                {authenticated && ['in_progress', 'queued', 'waiting'].includes(run.status) ? (
                  <button className="icon-btn ghost" title={t('actions.cancel')} onClick={() => void cancelRun(run)}>
                    <Ban size={14} />
                  </button>
                ) : null}
                <button className="icon-btn ghost" title={t('actions.openLogs')} onClick={() => void openExternal(run.html_url)}>
                  <ExternalLink size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Pagination
        page={page}
        onPage={setPage}
        hasNext={(runs.data?.workflow_runs?.length || 0) === 20}
        loading={runs.loading}
      />

      {workflows.data?.workflows?.length ? (
        <div className="tag-strip">
          <ListChecks size={13} />
          {workflows.data.workflows.slice(0, 10).map((workflow) => (
            <span className="row" style={{ gap: 3 }} key={workflow.id}>
              <button className="badge" title={workflow.path} onClick={() => setWorkflowFile(workflow)}>
                {workflow.name}
              </button>
              {authenticated ? (
                <button
                  className="icon-btn ghost tiny"
                  title={workflow.state === 'active' ? L('Disable', '禁用') : L('Enable', '启用')}
                  onClick={() => void toggleWorkflow(workflow)}
                  disabled={togglingWorkflow !== null}
                >
                  {togglingWorkflow === workflow.id ? (
                    <span className="spinner" />
                  ) : workflow.state === 'active' ? (
                    <Pause size={12} />
                  ) : (
                    <Play size={12} />
                  )}
                </button>
              ) : null}
            </span>
          ))}
        </div>
      ) : null}

      <CachesCard owner={owner} repo={repo} />

      {jobsRun ? <JobsModal owner={owner} repo={repo} run={jobsRun} onClose={() => setJobsRun(null)} /> : null}
      {logsRun ? <LogsModal owner={owner} repo={repo} run={logsRun} onClose={() => setLogsRun(null)} /> : null}
      {artifactsRun ? (
        <ArtifactsModal owner={owner} repo={repo} run={artifactsRun} onClose={() => setArtifactsRun(null)} />
      ) : null}
      {deploymentsRun ? (
        <DeploymentsModal owner={owner} repo={repo} run={deploymentsRun} onClose={() => setDeploymentsRun(null)} />
      ) : null}
      {workflowFile ? (
        <WorkflowFileModal owner={owner} repo={repo} workflow={workflowFile} onClose={() => setWorkflowFile(null)} />
      ) : null}

      {dispatchOpen ? (
        <Modal
          title={t('actions.dispatchTitle')}
          onClose={() => setDispatchOpen(false)}
          footer={
            <>
              <button className="btn ghost" onClick={() => setDispatchOpen(false)}>
                {t('app.cancel')}
              </button>
              <button className="btn primary" onClick={() => void dispatch()} disabled={busy || !workflowId}>
                {busy ? <span className="spinner" /> : <Play size={14} />}
                {t('actions.dispatch')}
              </button>
            </>
          }
        >
          <div className="field" style={{ marginBottom: 12 }}>
            <label className="field-label">{t('actions.workflow')}</label>
            <select className="select" value={workflowId} onChange={(event) => setWorkflowId(event.target.value)}>
              {(workflows.data?.workflows || []).map((workflow) => (
                <option key={workflow.id} value={workflow.id}>
                  {workflow.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field-label">{t('actions.ref')}</label>
            <input className="input mono" value={ref} onChange={(event) => setRef(event.target.value)} />
          </div>
          <div className="field" style={{ marginTop: 12 }}>
            <label className="field-label">{t('actions.inputs')}</label>
            <textarea
              className="textarea mono"
              style={{ minHeight: 90, fontSize: 12 }}
              value={inputsText}
              onChange={(event) => setInputsText(event.target.value)}
              placeholder={t('actions.inputsPlaceholder')}
            />
            <div className="field-hint">{t('actions.inputsHint')}</div>
          </div>
          {error ? (
            <div style={{ marginTop: 12 }}>
              <ErrorBlock message={error} />
            </div>
          ) : null}
        </Modal>
      ) : null}
    </div>
  )
}

function LogsModal({ owner, repo, run, onClose }: { owner: string; repo: string; run: Run; onClose: () => void }) {
  const { t } = useApp()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [files, setFiles] = useState<{ name: string; content: string }[]>([])
  const [selected, setSelected] = useState(0)
  const [query, setQuery] = useState('')

  const content = files[selected]?.content || ''
  const needle = query.trim().toLowerCase()
  const matches = useMemo(() => {
    if (!needle) return []
    return content
      .split('\n')
      .map((text, index) => ({ text, index }))
      .filter((line) => line.text.toLowerCase().includes(needle))
  }, [content, needle])

  const groups = useMemo(() => {
    const map = new Map<string, { label: string; index: number }[]>()
    files.forEach((file, index) => {
      const slash = file.name.indexOf('/')
      const job = slash > 0 ? file.name.slice(0, slash) : ''
      const label = slash > 0 ? file.name.slice(slash + 1) : file.name
      if (!map.has(job)) map.set(job, [])
      map.get(job)!.push({ label, index })
    })
    return Array.from(map.entries())
  }, [files])

  useEffect(() => {
    const desktop = getDesktop()
    if (!desktop) {
      setError(t('actions.desktopOnly'))
      setLoading(false)
      return
    }
    let alive = true
    desktop.actions
      .logs({ owner, repo, runId: run.id })
      .then((res) => {
        if (!alive) return
        setLoading(false)
        if (res.ok && res.files) {
          setFiles(res.files)
          if (res.files.length === 0) setError(t('actions.logEmpty'))
        } else {
          setError(res.error || t('actions.logEmpty'))
        }
      })
      .catch((err) => {
        if (!alive) return
        setLoading(false)
        setError(err instanceof Error ? err.message : t('actions.logEmpty'))
      })
    return () => {
      alive = false
    }
  }, [owner, repo, run.id, t])

  return (
    <Modal
      wide
      title={t('actions.logsTitle')}
      subtitle={`${run.name} #${run.run_number}`}
      onClose={onClose}
    >
      {loading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorBlock message={error} />
      ) : (
        <>
          <div className="search-box log-search">
            <Search size={14} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('actions.logSearch')}
            />
            {needle ? (
              <span className="log-match-count">{t('actions.logMatches', { n: matches.length })}</span>
            ) : null}
          </div>
          <div className="logs-layout">
            <div className="log-files">
              {groups.map(([job, items]) => (
                <div className="log-group" key={job || 'root'}>
                  {job ? <div className="log-group-label">{job}</div> : null}
                  {items.map((item) => (
                    <button
                      className={item.index === selected ? 'log-file active' : 'log-file'}
                      key={item.index}
                      onClick={() => setSelected(item.index)}
                      title={files[item.index]?.name}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              ))}
            </div>
            {needle ? (
              <div className="log-content">
                {matches.length ? (
                  matches.map((line) => (
                    <div className="log-line" key={line.index}>
                      <span className="log-line-no">{line.index + 1}</span>
                      <span>{line.text || ' '}</span>
                    </div>
                  ))
                ) : (
                  <div className="readme-empty">{t('actions.logNoMatch')}</div>
                )}
              </div>
            ) : (
              <pre className="log-content">{content}</pre>
            )}
          </div>
        </>
      )}
      <div className="modal-foot" style={{ paddingLeft: 0, paddingRight: 0 }}>
        <button className="btn small" onClick={() => void openExternal(run.html_url)}>
          <ExternalLink size={13} />
          {t('actions.openLogs')}
        </button>
      </div>
    </Modal>
  )
}

type Artifact = {
  id: number
  name: string
  size_in_bytes: number
  expired: boolean
  expires_at: string | null
}

function ArtifactsModal({
  owner,
  repo,
  run,
  onClose,
}: {
  owner: string
  repo: string
  run: Run
  onClose: () => void
}) {
  const { t, lang, authenticated, toast } = useApp()
  const L = (en: string, zh: string) => (lang === 'zh' ? zh : en)
  const artifacts = useGh<{ artifacts: Artifact[] }>(
    `/repos/${owner}/${repo}/actions/runs/${run.id}/artifacts?per_page=100`,
  )
  const [busy, setBusy] = useState<number | null>(null)
  const [deleting, setDeleting] = useState<number | null>(null)

  const remove = async (artifact: Artifact) => {
    if (!window.confirm(L(`Delete artifact "${artifact.name}"?`, `删除产物“${artifact.name}”？`))) return
    setDeleting(artifact.id)
    const res = await gh(`/repos/${owner}/${repo}/actions/artifacts/${artifact.id}`, { method: 'DELETE' })
    setDeleting(null)
    if (res.ok || res.status === 204) {
      toast(L('Artifact deleted', '产物已删除'), 'success')
      artifacts.reload()
    } else {
      toast(apiErrorMessage(res.data, t('app.requestFailed', { status: res.status })), 'error')
    }
  }

  const download = async (artifact: Artifact) => {
    const desktop = getDesktop()
    if (!desktop) {
      toast(t('actions.desktopOnly'), 'error')
      return
    }
    setBusy(artifact.id)
    const res = await desktop.actions.downloadArtifact({
      owner,
      repo,
      artifactId: artifact.id,
      name: artifact.name,
    })
    setBusy(null)
    if (res.ok && res.path) {
      toast(t('actions.downloaded', { path: res.path }), 'success')
    } else if (!res.canceled) {
      toast(res.error || t('actions.downloadFailed'), 'error')
    }
  }

  return (
    <Modal
      wide
      title={t('actions.artifactsTitle')}
      subtitle={`${run.name} #${run.run_number}`}
      onClose={onClose}
    >
      {artifacts.loading ? (
        <LoadingBlock />
      ) : artifacts.error ? (
        <ErrorBlock message={artifacts.error} onRetry={artifacts.reload} />
      ) : !artifacts.data?.artifacts?.length ? (
        <div className="readme-empty">{t('actions.artifactEmpty')}</div>
      ) : (
        <div className="list" style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          {artifacts.data.artifacts.map((artifact) => (
            <div className="list-item" key={artifact.id}>
              <Package size={16} color="var(--muted)" />
              <div className="item-main">
                <div className="item-title">{artifact.name}</div>
                <div className="item-meta">
                  <span>{bytes(artifact.size_in_bytes)}</span>
                  {artifact.expired ? <Badge tone="red">{t('actions.artifactExpired')}</Badge> : null}
                  {artifact.expires_at ? <TimeAgo iso={artifact.expires_at} /> : null}
                </div>
              </div>
              <div className="action-row" style={{ flexWrap: 'nowrap' }}>
                <button
                  className="btn small"
                  onClick={() => void download(artifact)}
                  disabled={busy !== null || artifact.expired}
                >
                  {busy === artifact.id ? <span className="spinner" /> : null}
                  {t('actions.download')}
                </button>
                {authenticated ? (
                  <button
                    className="icon-btn ghost"
                    title={t('common.delete')}
                    onClick={() => void remove(artifact)}
                    disabled={deleting !== null}
                  >
                    {deleting === artifact.id ? <span className="spinner" /> : <Trash2 size={14} />}
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="modal-foot" style={{ paddingLeft: 0, paddingRight: 0 }}>
        <button className="btn small" onClick={() => void openExternal(run.html_url)}>
          <ExternalLink size={13} />
          {t('actions.openLogs')}
        </button>
      </div>
    </Modal>
  )
}

type PendingDeployment = {
  environment: { id: number; name: string }
  wait_timer: number
  current_user_can_approve: boolean
  reviewers: { type: string; reviewer: { login?: string; name?: string } }[]
}

type DeploymentItem = {
  id: number
  environment: string
  state: string
  ref: string
  created_at: string
  updated_at: string
  creator: { login: string } | null
}

function DeploymentsModal({
  owner,
  repo,
  run,
  onClose,
}: {
  owner: string
  repo: string
  run: Run
  onClose: () => void
}) {
  const { t, toast } = useApp()
  const pending = useGh<PendingDeployment[]>(`/repos/${owner}/${repo}/actions/runs/${run.id}/pending_deployments`)
  const history = useGh<DeploymentItem[]>(`/repos/${owner}/${repo}/actions/runs/${run.id}/deployments?per_page=100`)
  const [busy, setBusy] = useState<number | null>(null)

  const review = async (environmentId: number, state: 'approved' | 'rejected') => {
    setBusy(environmentId)
    const res = await gh(`/repos/${owner}/${repo}/actions/runs/${run.id}/pending_deployments`, {
      method: 'POST',
      body: { environment_ids: [environmentId], state },
    })
    setBusy(null)
    if (res.ok) {
      toast(t(state === 'approved' ? 'actions.approved' : 'actions.rejected'), 'success')
      pending.reload()
      history.reload()
    } else {
      toast(apiErrorMessage(res.data, t('app.requestFailed', { status: res.status })), 'error')
    }
  }

  return (
    <Modal wide title={t('actions.deploymentsTitle')} subtitle={`${run.name} #${run.run_number}`} onClose={onClose}>
      <div className="side-label" style={{ marginBottom: 8 }}>
        {t('actions.pendingApprovals')}
      </div>
      {pending.loading ? (
        <LoadingBlock />
      ) : pending.error ? (
        <ErrorBlock message={pending.error} onRetry={pending.reload} />
      ) : !pending.data?.length ? (
        <div className="readme-empty" style={{ marginBottom: 16 }}>
          {t('actions.noPendingApprovals')}
        </div>
      ) : (
        <div
          className="list"
          style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}
        >
          {pending.data.map((item) => (
            <div className="list-item" key={item.environment.id} style={{ alignItems: 'flex-start' }}>
              <ShieldCheck size={16} color="var(--muted)" style={{ marginTop: 2 }} />
              <div className="item-main">
                <div className="item-title">{item.environment.name}</div>
                <div className="item-meta">
                  {item.wait_timer ? <span>{t('actions.waitTimer', { n: item.wait_timer })}</span> : null}
                  {item.reviewers?.length ? (
                    <span>
                      {item.reviewers
                        .map((reviewer) => reviewer.reviewer?.login || reviewer.reviewer?.name || '')
                        .filter(Boolean)
                        .join(', ')}
                    </span>
                  ) : null}
                </div>
              </div>
              {item.current_user_can_approve ? (
                <div className="action-row">
                  <button
                    className="btn small primary"
                    onClick={() => void review(item.environment.id, 'approved')}
                    disabled={busy !== null}
                  >
                    {busy === item.environment.id ? <span className="spinner" /> : null}
                    {t('actions.approve')}
                  </button>
                  <button
                    className="btn small"
                    onClick={() => void review(item.environment.id, 'rejected')}
                    disabled={busy !== null}
                  >
                    {t('actions.reject')}
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      <div className="side-label" style={{ marginBottom: 8 }}>
        {t('actions.deploymentHistory')}
      </div>
      {history.loading ? (
        <LoadingBlock />
      ) : history.error ? (
        <ErrorBlock message={history.error} onRetry={history.reload} />
      ) : !history.data?.length ? (
        <div className="readme-empty">{t('actions.noDeployments')}</div>
      ) : (
        <div className="list" style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          {history.data.map((deployment) => (
            <div className="list-item" key={deployment.id}>
              <ShieldCheck size={16} color="var(--muted)" />
              <div className="item-main">
                <div className="item-title">{deployment.environment}</div>
                <div className="item-meta">
                  <span className="mono">{deployment.ref}</span>
                  {deployment.creator ? <span>{deployment.creator.login}</span> : null}
                  <span>
                    <TimeAgo iso={deployment.updated_at || deployment.created_at} />
                  </span>
                </div>
              </div>
              <Badge
                tone={
                  deployment.state === 'success'
                    ? 'green'
                    : deployment.state === 'failure' || deployment.state === 'error'
                      ? 'red'
                      : deployment.state === 'in_progress'
                        ? 'blue'
                        : 'default'
                }
              >
                {stateLabel(t, deployment.state)}
              </Badge>
            </div>
          ))}
        </div>
      )}
      <div className="modal-foot" style={{ paddingLeft: 0, paddingRight: 0 }}>
        <button className="btn small" onClick={() => void openExternal(run.html_url)}>
          <ExternalLink size={13} />
          {t('actions.openLogs')}
        </button>
      </div>
    </Modal>
  )
}

type Cache = {
  id: number
  key: string
  ref: string
  size_in_bytes: number
  created_at: string
  last_accessed_at: string | null
}

function CachesCard({ owner, repo }: { owner: string; repo: string }) {
  const { t, lang, authenticated, toast } = useApp()
  const L = (en: string, zh: string) => (lang === 'zh' ? zh : en)
  const caches = useGh<{ actions_caches: Cache[] }>(`/repos/${owner}/${repo}/actions/caches?per_page=100`)
  const [deleting, setDeleting] = useState<number | null>(null)

  const remove = async (cache: Cache) => {
    if (!window.confirm(L(`Delete cache "${cache.key}"?`, `删除缓存“${cache.key}”？`))) return
    setDeleting(cache.id)
    const res = await gh(`/repos/${owner}/${repo}/actions/caches/${cache.id}`, { method: 'DELETE' })
    setDeleting(null)
    if (res.ok || res.status === 204) {
      toast(L('Cache deleted', '缓存已删除'), 'success')
      caches.reload()
    } else {
      toast(apiErrorMessage(res.data, t('app.requestFailed', { status: res.status })), 'error')
    }
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-head" style={{ padding: '12px 16px' }}>
        <div className="card-title">
          <Database size={15} />
          {L('Caches', '缓存')}
        </div>
        <button className="btn small" onClick={caches.reload} disabled={caches.loading}>
          <RefreshCw size={13} />
        </button>
      </div>
      {caches.loading ? (
        <LoadingBlock />
      ) : caches.error ? (
        <div style={{ padding: 16 }}>
          <ErrorBlock message={caches.error} onRetry={caches.reload} />
        </div>
      ) : !caches.data?.actions_caches?.length ? (
        <div className="readme-empty">{L('No caches', '暂无缓存')}</div>
      ) : (
        <div>
          {caches.data.actions_caches.map((cache) => (
            <div className="list-item" key={cache.id}>
              <Database size={16} color="var(--muted)" />
              <div className="item-main">
                <div className="item-title mono">{cache.key}</div>
                <div className="item-meta">
                  <span>{bytes(cache.size_in_bytes)}</span>
                  <span className="mono">{cache.ref}</span>
                  <span>
                    {L('Last accessed', '最近访问')} <TimeAgo iso={cache.last_accessed_at} />
                  </span>
                </div>
              </div>
              {authenticated ? (
                <button
                  className="icon-btn ghost"
                  title={t('common.delete')}
                  onClick={() => void remove(cache)}
                  disabled={deleting !== null}
                >
                  {deleting === cache.id ? <span className="spinner" /> : <Trash2 size={14} />}
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function WorkflowFileModal({
  owner,
  repo,
  workflow,
  onClose,
}: {
  owner: string
  repo: string
  workflow: Workflow
  onClose: () => void
}) {
  const { t } = useApp()
  const file = useGh<{ content?: string; size?: number }>(`/repos/${owner}/${repo}/contents/${workflow.path}`)
  const content = file.data?.content ? decodeBase64(file.data.content) : ''

  return (
    <Modal wide title={t('actions.workflowFile')} subtitle={workflow.path} onClose={onClose}>
      {file.loading ? (
        <LoadingBlock />
      ) : file.error ? (
        <ErrorBlock message={file.error} onRetry={file.reload} />
      ) : (
        <pre className="log-content" style={{ maxHeight: '60vh' }}>
          {content}
        </pre>
      )}
      <div className="modal-foot" style={{ paddingLeft: 0, paddingRight: 0 }}>
        <button
          className="btn small"
          onClick={() =>
            void openExternal(
              workflow.html_url || `https://github.com/${owner}/${repo}/actions/workflows/${workflow.id}`,
            )
          }
        >
          <ExternalLink size={13} />
          {t('app.openInBrowser')}
        </button>
      </div>
    </Modal>
  )
}
