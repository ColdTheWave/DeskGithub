import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  AlertTriangle,
  ExternalLink,
  FilePlus2,
  FileText,
  Flag,
  GitBranch,
  GitPullRequest,
  Globe,
  KeyRound,
  Play,
  Plus,
  Save,
  Trash2,
  Webhook,
} from 'lucide-react'
import { useApp } from '../lib/store'
import { apiErrorMessage, encodeBase64, gh } from '../lib/api'
import { openExternal } from '../lib/desktop'
import { useGh } from '../lib/hooks'
import { Avatar, ErrorBlock, LoadingBlock, Modal } from './ui'
import { Markdown } from './Markdown'
import type { GhRepo } from '../lib/types'
import { decodeBase64 } from '../lib/format'

type TemplateOption = { name: string; path: string; format: 'md' | 'yml' }

function cleanScalar(value: string) {
  return value.replace(/^["']|["']$/g, '').trim()
}

function parseTemplate(raw: string) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!match) return { body: raw, title: '' }
  let title = ''
  for (const line of match[1].split(/\r?\n/)) {
    const field = line.match(/^(\w+):\s*(.*)$/)
    if (!field) continue
    if (field[1] === 'title') title = cleanScalar(field[2])
  }
  return { body: raw.slice(match[0].length), title }
}

function formToMarkdown(raw: string) {
  let title = ''
  const fields: string[] = []
  for (const line of raw.split(/\r?\n/)) {
    const titleMatch = line.match(/^title:\s*(.+?)\s*$/)
    if (titleMatch) title = cleanScalar(titleMatch[1])
    const labelMatch = line.match(/^\s+label:\s*(.+?)\s*$/)
    if (!labelMatch) continue
    const label = cleanScalar(labelMatch[1])
    if (label && !fields.includes(label)) fields.push(label)
  }
  return { title, body: fields.map((field) => `### ${field}\n`).join('\n') }
}

function useTemplates(owner: string, repo: string, kind: 'issue' | 'pull') {
  const [options, setOptions] = useState<TemplateOption[]>([])

  useEffect(() => {
    let alive = true
    const load = async () => {
      const found: TemplateOption[] = []
      if (kind === 'issue') {
        const dir = await gh(`/repos/${owner}/${repo}/contents/.github/ISSUE_TEMPLATE`)
        if (Array.isArray(dir.data)) {
          for (const item of dir.data) {
            if (item?.type !== 'file') continue
            if (/\.(md|markdown)$/i.test(item.name)) {
              found.push({ name: item.name.replace(/\.(md|markdown)$/i, ''), path: item.path, format: 'md' })
            } else if (/\.ya?ml$/i.test(item.name) && !/^config\.ya?ml$/i.test(item.name)) {
              found.push({ name: item.name.replace(/\.ya?ml$/i, ''), path: item.path, format: 'yml' })
            }
          }
        }
        if (found.length === 0) {
          for (const candidate of ['.github/ISSUE_TEMPLATE.md', 'ISSUE_TEMPLATE.md']) {
            const res = await gh(`/repos/${owner}/${repo}/contents/${candidate}`)
            if (res.ok) found.push({ name: candidate, path: candidate, format: 'md' })
          }
        }
      } else {
        for (const candidate of [
          '.github/PULL_REQUEST_TEMPLATE.md',
          'PULL_REQUEST_TEMPLATE.md',
          '.github/pull_request_template.md',
        ]) {
          const res = await gh(`/repos/${owner}/${repo}/contents/${candidate}`)
          if (res.ok) found.push({ name: candidate.split('/').pop() || candidate, path: candidate, format: 'md' })
        }
      }
      if (alive) setOptions(found)
    }
    void load()
    return () => {
      alive = false
    }
  }, [owner, repo, kind])

  return options
}

type FileEditorProps = {
  owner: string
  repo: string
  branch: string
  mode: 'new' | 'edit'
  path?: string
  initialContent?: string
  sha?: string
  onClose: () => void
  onSaved: () => void
}

export function FileEditorModal({
  owner,
  repo,
  branch,
  mode,
  path: initialPath,
  initialContent,
  sha,
  onClose,
  onSaved,
}: FileEditorProps) {
  const { t, toast } = useApp()
  const [filePath, setFilePath] = useState(initialPath || '')
  const [content, setContent] = useState(initialContent || '')
  const [message, setMessage] = useState(
    mode === 'edit' ? `Update ${initialPath}` : `Create ${initialPath || 'new file'}`,
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState(false)
  const isMarkdown = /\.(md|markdown)$/i.test(filePath)

  const save = async () => {
    const target = filePath.trim().replace(/^\/+/, '')
    if (!target) {
      setError(t('file.needPath'))
      return
    }
    setBusy(true)
    setError('')
    const encoded = target.split('/').map(encodeURIComponent).join('/')
    const body: Record<string, unknown> = {
      message: message.trim() || (mode === 'edit' ? `Update ${target}` : `Create ${target}`),
      content: encodeBase64(content),
      branch,
    }
    if (mode === 'edit' && sha) body.sha = sha
    const res = await gh(`/repos/${owner}/${repo}/contents/${encoded}`, { method: 'PUT', body })
    setBusy(false)
    if (res.ok) {
      toast(t('repo.fileSaved'), 'success')
      onSaved()
      onClose()
    } else {
      setError(apiErrorMessage(res.data, t('app.requestFailed', { status: res.status })))
    }
  }

  return (
    <Modal
      wide
      title={mode === 'edit' ? t('repo.editTitle', { path: initialPath || '' }) : t('repo.newFileTitle')}
      subtitle={t('repo.commitTo', { branch })}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            {t('app.cancel')}
          </button>
          <button className="btn primary" onClick={() => void save()} disabled={busy}>
            {busy ? <span className="spinner" /> : <Save size={14} />}
            {busy ? t('file.saving') : t('common.save')}
          </button>
        </>
      }
    >
      <div className="field" style={{ marginBottom: 12 }}>
        <label className="field-label">{t('repo.filePath')}</label>
        <input
          className="input mono"
          value={filePath}
          onChange={(event) => setFilePath(event.target.value)}
          placeholder="src/index.ts"
          disabled={mode === 'edit'}
          spellCheck={false}
        />
      </div>
      <div className="field" style={{ marginBottom: 12 }}>
        <div className="action-row" style={{ justifyContent: 'space-between' }}>
          <label className="field-label">{t('repo.fileContent')}</label>
          {isMarkdown ? (
            <div className="segmented">
              <button className={!preview ? 'active' : ''} onClick={() => setPreview(false)}>
                Edit
              </button>
              <button className={preview ? 'active' : ''} onClick={() => setPreview(true)}>
                Preview
              </button>
            </div>
          ) : null}
        </div>
        {isMarkdown && preview ? (
          <div className="wiki-body" style={{ minHeight: 300 }}>
            <Markdown markdown={content} owner={owner} repo={repo} branch={branch} />
          </div>
        ) : (
          <textarea
            className="textarea mono"
            style={{ minHeight: 300, fontSize: 12.5 }}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            spellCheck={false}
          />
        )}
      </div>
      <div className="field">
        <label className="field-label">{t('repo.commitMessage')}</label>
        <input
          className="input"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder={t('repo.commitMessageHint')}
        />
      </div>
      {error ? (
        <div style={{ marginTop: 12 }}>
          <ErrorBlock message={error} />
        </div>
      ) : null}
    </Modal>
  )
}

export function IssueComposerModal({
  owner,
  repo,
  onClose,
  onCreated,
}: {
  owner: string
  repo: string
  onClose: () => void
  onCreated: (number: number) => void
}) {
  const { t, toast } = useApp()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const templates = useTemplates(owner, repo, 'issue')
  const [applying, setApplying] = useState('')

  const applyTemplate = async (option: TemplateOption) => {
    setApplying(option.path)
    const res = await gh(`/repos/${owner}/${repo}/contents/${option.path}`)
    setApplying('')
    if (res.ok && typeof res.data?.content === 'string') {
      const raw = decodeBase64(res.data.content)
      const parsed = option.format === 'yml' ? formToMarkdown(raw) : parseTemplate(raw)
      setBody(parsed.body)
      if (!title.trim() && parsed.title) setTitle(parsed.title)
    } else {
      toast(apiErrorMessage(res.data, t('composer.templateFailed')), 'error')
    }
  }

  const submit = async () => {
    if (!title.trim()) {
      setError(t('issues.needTitle'))
      return
    }
    setBusy(true)
    setError('')
    const res = await gh(`/repos/${owner}/${repo}/issues`, {
      method: 'POST',
      body: { title: title.trim(), body },
    })
    setBusy(false)
    if (res.ok && res.data?.number) {
      toast(t('issues.createdToast'), 'success')
      onCreated(res.data.number)
      onClose()
    } else {
      setError(apiErrorMessage(res.data, t('app.requestFailed', { status: res.status })))
    }
  }

  return (
    <Modal
      wide
      title={t('issues.createTitle')}
      subtitle={t('issues.createHint')}
      icon={<FilePlus2 size={16} />}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            {t('app.cancel')}
          </button>
          <button className="btn primary" onClick={() => void submit()} disabled={busy}>
            {busy ? <span className="spinner" /> : <FilePlus2 size={14} />}
            {t('issues.createAction')}
          </button>
        </>
      }
    >
      <div className="field" style={{ marginBottom: 12 }}>
        <label className="field-label">{t('issues.titleField')}</label>
        <input
          className="input"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          autoFocus
        />
      </div>
      {templates.length ? (
        <div className="template-row">
          <span className="field-label" style={{ marginBottom: 0 }}>
            {t('composer.template')}
          </span>
          <div className="template-chips">
            {templates.map((option) => (
              <button
                key={option.path}
                className="template-chip"
                onClick={() => void applyTemplate(option)}
                disabled={applying !== ''}
              >
                {applying === option.path ? <span className="spinner" /> : <FileText size={11} />}
                {option.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <div className="field">
        <label className="field-label">{t('issues.bodyField')}</label>
        <textarea
          className="textarea"
          style={{ minHeight: 180 }}
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
      </div>
      {error ? (
        <div style={{ marginTop: 12 }}>
          <ErrorBlock message={error} />
        </div>
      ) : null}
    </Modal>
  )
}

export function PullComposerModal({
  owner,
  repo,
  branches,
  defaultBranch,
  onClose,
  onCreated,
}: {
  owner: string
  repo: string
  branches: string[]
  defaultBranch: string
  onClose: () => void
  onCreated: (number: number) => void
}) {
  const { t, toast } = useApp()
  const candidates = useMemo(() => branches.filter((branch) => branch !== defaultBranch), [branches, defaultBranch])
  const [head, setHead] = useState(candidates[0] || '')
  const [base, setBase] = useState(defaultBranch)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [draft, setDraft] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const templates = useTemplates(owner, repo, 'pull')
  const [applying, setApplying] = useState('')

  const applyTemplate = async (option: TemplateOption) => {
    setApplying(option.path)
    const res = await gh(`/repos/${owner}/${repo}/contents/${option.path}`)
    setApplying('')
    if (res.ok && typeof res.data?.content === 'string') {
      const raw = decodeBase64(res.data.content)
      const parsed = option.format === 'yml' ? formToMarkdown(raw) : parseTemplate(raw)
      setBody(parsed.body)
      if (!title.trim() && parsed.title) setTitle(parsed.title)
    } else {
      toast(apiErrorMessage(res.data, t('composer.templateFailed')), 'error')
    }
  }

  const submit = async () => {
    if (!head || !base || head === base) {
      setError(t('pulls.sameBranch'))
      return
    }
    if (!title.trim()) {
      setError(t('issues.needTitle'))
      return
    }
    setBusy(true)
    setError('')
    const res = await gh(`/repos/${owner}/${repo}/pulls`, {
      method: 'POST',
      body: { title: title.trim(), body, head, base, draft },
    })
    setBusy(false)
    if (res.ok && res.data?.number) {
      toast(t('pulls.createdToast'), 'success')
      onCreated(res.data.number)
      onClose()
    } else {
      setError(apiErrorMessage(res.data, t('app.requestFailed', { status: res.status })))
    }
  }

  return (
    <Modal
      wide
      title={t('pulls.createTitle')}
      subtitle={t('pulls.createHint')}
      icon={<GitPullRequest size={16} />}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            {t('app.cancel')}
          </button>
          <button className="btn primary" onClick={() => void submit()} disabled={busy}>
            {busy ? <span className="spinner" /> : <GitPullRequest size={14} />}
            {t('pulls.createAction')}
          </button>
        </>
      }
    >
      {candidates.length === 0 ? (
        <div className="note" style={{ marginBottom: 12 }}>
          <span>{t('pulls.noBranches')}</span>
        </div>
      ) : null}
      <div className="form-grid" style={{ marginBottom: 12 }}>
        <div className="field">
          <label className="field-label">{t('pulls.head')}</label>
          <select className="select" value={head} onChange={(event) => setHead(event.target.value)}>
            {candidates.map((branch) => (
              <option key={branch} value={branch}>
                {branch}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="field-label">{t('pulls.base')}</label>
          <select className="select" value={base} onChange={(event) => setBase(event.target.value)}>
            {branches.map((branch) => (
              <option key={branch} value={branch}>
                {branch}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="field" style={{ marginBottom: 12 }}>
        <label className="field-label">{t('issues.titleField')}</label>
        <input className="input" value={title} onChange={(event) => setTitle(event.target.value)} />
      </div>
      {templates.length ? (
        <div className="template-row">
          <span className="field-label" style={{ marginBottom: 0 }}>
            {t('composer.template')}
          </span>
          <div className="template-chips">
            {templates.map((option) => (
              <button
                key={option.path}
                className="template-chip"
                onClick={() => void applyTemplate(option)}
                disabled={applying !== ''}
              >
                {applying === option.path ? <span className="spinner" /> : <FileText size={11} />}
                {option.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <div className="field" style={{ marginBottom: 12 }}>
        <label className="field-label">{t('issues.bodyField')}</label>
        <textarea className="textarea" style={{ minHeight: 140 }} value={body} onChange={(event) => setBody(event.target.value)} />
      </div>
      <label className="row" style={{ gap: 8, fontSize: 12.5, cursor: 'pointer' }}>
        <input type="checkbox" checked={draft} onChange={(event) => setDraft(event.target.checked)} />
        {t('pulls.draft')}
      </label>
      {error ? (
        <div style={{ marginTop: 12 }}>
          <ErrorBlock message={error} />
        </div>
      ) : null}
    </Modal>
  )
}

type Milestone = {
  id: number
  number: number
  title: string
  state: string
  due_on: string | null
  open_issues: number
  closed_issues: number
  html_url: string
}

export function MilestonesModal({
  owner,
  repo,
  onClose,
}: {
  owner: string
  repo: string
  onClose: () => void
}) {
  const { t, toast } = useApp()
  const milestones = useGh<Milestone[]>(`/repos/${owner}/${repo}/milestones?state=all&per_page=50`)
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const create = async () => {
    if (!title.trim()) {
      setError(t('issues.needTitle'))
      return
    }
    setBusy(true)
    setError('')
    const res = await gh(`/repos/${owner}/${repo}/milestones`, {
      method: 'POST',
      body: { title: title.trim(), due_on: due ? `${due}T00:00:00Z` : undefined },
    })
    setBusy(false)
    if (res.ok) {
      toast(t('milestones.created'), 'success')
      setTitle('')
      setDue('')
      setCreating(false)
      milestones.reload()
    } else {
      setError(apiErrorMessage(res.data, t('app.requestFailed', { status: res.status })))
    }
  }

  return (
    <Modal
      wide
      title={t('milestones.title')}
      icon={<Flag size={16} />}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            {t('app.close')}
          </button>
          <button className="btn" onClick={() => setCreating((value) => !value)}>
            <Flag size={13} />
            {t('milestones.new')}
          </button>
        </>
      }
    >
      {creating ? (
        <div style={{ marginBottom: 16 }}>
          <div className="form-grid">
            <div className="field">
              <label className="field-label">{t('milestones.name')}</label>
              <input className="input" value={title} onChange={(event) => setTitle(event.target.value)} />
            </div>
            <div className="field">
              <label className="field-label">{t('milestones.due')}</label>
              <input
                className="input"
                type="date"
                value={due}
                onChange={(event) => setDue(event.target.value)}
              />
            </div>
          </div>
          <div className="action-row" style={{ marginTop: 10 }}>
            <button className="btn primary small" onClick={() => void create()} disabled={busy}>
              {t('common.create')}
            </button>
            <button className="btn small ghost" onClick={() => setCreating(false)}>
              {t('app.cancel')}
            </button>
          </div>
          {error ? (
            <div style={{ marginTop: 10 }}>
              <ErrorBlock message={error} />
            </div>
          ) : null}
        </div>
      ) : null}

      {milestones.loading ? (
        <LoadingBlock />
      ) : milestones.error ? (
        <ErrorBlock message={milestones.error} onRetry={milestones.reload} />
      ) : !milestones.data?.length ? (
        <div className="readme-empty">{t('milestones.empty')}</div>
      ) : (
        <div className="list" style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          {milestones.data.map((milestone) => (
            <div className="list-item" key={milestone.id} style={{ alignItems: 'flex-start' }}>
              <Flag size={16} color={milestone.state === 'open' ? 'var(--green)' : 'var(--purple)'} style={{ marginTop: 3 }} />
              <div className="item-main">
                <div className="item-title">{milestone.title}</div>
                <div className="item-meta">
                  <span>
                    {t('milestones.progress', {
                      open: milestone.open_issues,
                      closed: milestone.closed_issues,
                    })}
                  </span>
                  <span>{milestone.due_on ? new Date(milestone.due_on).toLocaleDateString() : t('milestones.noDue')}</span>
                </div>
              </div>
              <span className={milestone.state === 'open' ? 'badge green' : 'badge purple'}>{milestone.state}</span>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}

type Collaborator = {
  id: number
  login: string
  avatar_url: string
  role_name?: string
  permissions?: Record<string, boolean>
}

type RepoBranch = {
  name: string
  protected: boolean
  commit?: { sha: string }
}

type Webhook = {
  id: number
  active: boolean
  events: string[]
  config?: { url?: string; content_type?: string }
}

type ActionsSecret = {
  name: string
  created_at: string
  updated_at: string
}

type ActionsPermissions = {
  enabled: boolean
  allowed_actions?: string
}

type PagesInfo = {
  status?: string | null
  url?: string
  html_url?: string
  build_type?: string
  source?: { branch: string; path: string }
}

const COLLAB_PERMISSIONS = ['pull', 'triage', 'push', 'maintain', 'admin'] as const

function SettingsCard({
  title,
  subtitle,
  action,
  children,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="card-head">
        <div>
          <div className="card-title">{title}</div>
          {subtitle ? <div className="card-sub">{subtitle}</div> : null}
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

function SettingsFormRow({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
      {children}
    </div>
  )
}

function CollaboratorsSection({ owner, repo }: { owner: string; repo: string }) {
  const { lang, toast } = useApp()
  const L = (en: string, zh: string) => (lang === 'zh' ? zh : en)
  const collaborators = useGh<Collaborator[]>(`/repos/${owner}/${repo}/collaborators?per_page=100`)
  const [username, setUsername] = useState('')
  const [permission, setPermission] = useState<string>('push')
  const [busy, setBusy] = useState(false)

  const add = async () => {
    const login = username.trim()
    if (!login) {
      toast(L('Enter a GitHub username', '请输入 GitHub 用户名'), 'error')
      return
    }
    setBusy(true)
    const res = await gh(`/repos/${owner}/${repo}/collaborators/${encodeURIComponent(login)}`, {
      method: 'PUT',
      body: { permission },
    })
    setBusy(false)
    if (res.ok) {
      toast(L('Collaborator added', '已添加协作者'), 'success')
      setUsername('')
      collaborators.reload()
    } else {
      toast(apiErrorMessage(res.data, L('Failed to add collaborator', '添加协作者失败')), 'error')
    }
  }

  const remove = async (login: string) => {
    if (!window.confirm(L(`Remove ${login} from this repository?`, `确定将 ${login} 移出该仓库？`))) return
    const res = await gh(`/repos/${owner}/${repo}/collaborators/${encodeURIComponent(login)}`, { method: 'DELETE' })
    if (res.ok || res.status === 204) {
      toast(L('Collaborator removed', '已移除协作者'), 'success')
      collaborators.reload()
    } else {
      toast(apiErrorMessage(res.data, L('Failed to remove collaborator', '移除协作者失败')), 'error')
    }
  }

  const permissionOf = (item: Collaborator) =>
    item.role_name || COLLAB_PERMISSIONS.find((value) => item.permissions?.[value]) || 'read'

  return (
    <SettingsCard
      title={L('Collaborators', '协作者')}
      subtitle={L('People with access to this repository', '拥有此仓库访问权限的成员')}
    >
      <SettingsFormRow>
        <input
          className="input"
          style={{ flex: '1 1 160px', width: 'auto', minWidth: 0 }}
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder={L('GitHub username', 'GitHub 用户名')}
          spellCheck={false}
        />
        <select
          className="select"
          style={{ width: 120 }}
          value={permission}
          onChange={(event) => setPermission(event.target.value)}
        >
          {COLLAB_PERMISSIONS.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <button className="btn small primary" onClick={() => void add()} disabled={busy}>
          {busy ? <span className="spinner" /> : <Plus size={13} />}
          {L('Add', '添加')}
        </button>
      </SettingsFormRow>
      {collaborators.loading ? (
        <LoadingBlock />
      ) : collaborators.error ? (
        <ErrorBlock message={collaborators.error} onRetry={collaborators.reload} />
      ) : !collaborators.data?.length ? (
        <div className="readme-empty">{L('No collaborators yet', '暂无协作者')}</div>
      ) : (
        <div className="list">
          {collaborators.data.map((person) => (
            <div className="list-item" key={person.id}>
              <Avatar user={person} size={30} />
              <div className="item-main">
                <div className="item-title">{person.login}</div>
              </div>
              <span className="badge blue">{permissionOf(person)}</span>
              <button
                className="icon-btn ghost"
                title={L('Remove collaborator', '移除协作者')}
                onClick={() => void remove(person.login)}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </SettingsCard>
  )
}

function BranchesSection({
  owner,
  repo,
  defaultBranch,
  onDefaultChanged,
}: {
  owner: string
  repo: string
  defaultBranch: string
  onDefaultChanged: () => void
}) {
  const { lang, toast } = useApp()
  const L = (en: string, zh: string) => (lang === 'zh' ? zh : en)
  const branches = useGh<RepoBranch[]>(`/repos/${owner}/${repo}/branches?per_page=100`)

  const remove = async (name: string) => {
    if (
      !window.confirm(
        L(`Delete branch "${name}"? This cannot be undone.`, `确定删除分支「${name}」？此操作不可撤销。`),
      )
    )
      return
    const encoded = name.split('/').map(encodeURIComponent).join('/')
    const res = await gh(`/repos/${owner}/${repo}/git/refs/heads/${encoded}`, { method: 'DELETE' })
    if (res.ok || res.status === 204) {
      toast(L('Branch deleted', '分支已删除'), 'success')
      branches.reload()
    } else {
      toast(apiErrorMessage(res.data, L('Failed to delete branch', '删除分支失败')), 'error')
    }
  }

  const makeDefault = async (name: string) => {
    if (
      !window.confirm(
        L(`Set "${name}" as the default branch?`, `确定将「${name}」设为默认分支？`),
      )
    )
      return
    const res = await gh(`/repos/${owner}/${repo}`, { method: 'PATCH', body: { default_branch: name } })
    if (res.ok) {
      toast(L('Default branch updated', '默认分支已更新'), 'success')
      branches.reload()
      onDefaultChanged()
    } else {
      toast(apiErrorMessage(res.data, L('Failed to update default branch', '更新默认分支失败')), 'error')
    }
  }

  return (
    <SettingsCard
      title={L('Branches', '分支')}
      subtitle={L('Delete branches or change the default branch', '删除分支或更改默认分支')}
    >
      {branches.loading ? (
        <LoadingBlock />
      ) : branches.error ? (
        <ErrorBlock message={branches.error} onRetry={branches.reload} />
      ) : !branches.data?.length ? (
        <div className="readme-empty">{L('No branches', '暂无分支')}</div>
      ) : (
        <div className="list">
          {branches.data.map((branch) => (
            <div className="list-item" key={branch.name}>
              <GitBranch size={15} className="muted" />
              <div className="item-main">
                <div className="item-title">
                  <span className="mono truncate">{branch.name}</span>
                  {branch.name === defaultBranch ? <span className="badge green">{L('default', '默认')}</span> : null}
                  {branch.protected ? <span className="badge gold">{L('protected', '受保护')}</span> : null}
                </div>
              </div>
              {branch.name !== defaultBranch ? (
                <>
                  <button className="btn small ghost" onClick={() => void makeDefault(branch.name)}>
                    {L('Set default', '设为默认')}
                  </button>
                  <button
                    className="icon-btn ghost"
                    title={L('Delete branch', '删除分支')}
                    onClick={() => void remove(branch.name)}
                  >
                    <Trash2 size={14} />
                  </button>
                </>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </SettingsCard>
  )
}

function WebhooksSection({ owner, repo }: { owner: string; repo: string }) {
  const { lang, toast } = useApp()
  const L = (en: string, zh: string) => (lang === 'zh' ? zh : en)
  const hooks = useGh<Webhook[]>(`/repos/${owner}/${repo}/hooks?per_page=100`)
  const [creating, setCreating] = useState(false)
  const [url, setUrl] = useState('')
  const [contentType, setContentType] = useState('json')
  const [events, setEvents] = useState<string[]>(['push'])
  const [secret, setSecret] = useState('')
  const [busy, setBusy] = useState(false)
  const [pinging, setPinging] = useState<number | null>(null)

  const toggleEvent = (value: string) =>
    setEvents((current) => (current.includes(value) ? current.filter((item) => item !== value) : [...current, value]))

  const create = async () => {
    if (!url.trim()) {
      toast(L('Enter a payload URL', '请输入 Payload URL'), 'error')
      return
    }
    if (events.length === 0) {
      toast(L('Choose at least one event', '请至少选择一个事件'), 'error')
      return
    }
    setBusy(true)
    const res = await gh(`/repos/${owner}/${repo}/hooks`, {
      method: 'POST',
      body: {
        name: 'web',
        active: true,
        events,
        config: {
          url: url.trim(),
          content_type: contentType,
          ...(secret.trim() ? { secret: secret.trim() } : {}),
        },
      },
    })
    setBusy(false)
    if (res.ok) {
      toast(L('Webhook created', 'Webhook 已创建'), 'success')
      setUrl('')
      setSecret('')
      setEvents(['push'])
      setContentType('json')
      setCreating(false)
      hooks.reload()
    } else {
      toast(apiErrorMessage(res.data, L('Failed to create webhook', '创建 Webhook 失败')), 'error')
    }
  }

  const remove = async (id: number) => {
    if (!window.confirm(L('Delete this webhook?', '确定删除该 Webhook？'))) return
    const res = await gh(`/repos/${owner}/${repo}/hooks/${id}`, { method: 'DELETE' })
    if (res.ok || res.status === 204) {
      toast(L('Webhook deleted', 'Webhook 已删除'), 'success')
      hooks.reload()
    } else {
      toast(apiErrorMessage(res.data, L('Failed to delete webhook', '删除 Webhook 失败')), 'error')
    }
  }

  const ping = async (id: number) => {
    setPinging(id)
    const res = await gh(`/repos/${owner}/${repo}/hooks/${id}/pings`, { method: 'POST' })
    setPinging(null)
    if (res.ok || res.status === 204) {
      toast(L('Ping sent', 'Ping 已发送'), 'success')
    } else {
      toast(apiErrorMessage(res.data, L('Failed to send ping', '发送 Ping 失败')), 'error')
    }
  }

  return (
    <>
      <SettingsCard
        title={L('Webhooks', 'Webhooks')}
        subtitle={L('Send HTTP requests when events happen', '事件发生时发送 HTTP 请求')}
        action={
          <button className="btn small" onClick={() => setCreating((value) => !value)}>
            <Plus size={13} />
            {L('New webhook', '新建 Webhook')}
          </button>
        }
      >
        {creating ? (
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
            <div className="field" style={{ marginBottom: 10 }}>
              <label className="field-label">{L('Payload URL', 'Payload URL')}</label>
              <input
                className="input"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://example.com/webhook"
                spellCheck={false}
              />
            </div>
            <div className="form-grid" style={{ marginBottom: 10 }}>
              <div className="field">
                <label className="field-label">{L('Content type', '内容类型')}</label>
                <select className="select" value={contentType} onChange={(event) => setContentType(event.target.value)}>
                  <option value="json">application/json</option>
                  <option value="form">application/x-www-form-urlencoded</option>
                </select>
              </div>
              <div className="field">
                <label className="field-label">{L('Secret (optional)', 'Secret（可选）')}</label>
                <input
                  className="input"
                  value={secret}
                  onChange={(event) => setSecret(event.target.value)}
                  spellCheck={false}
                />
              </div>
            </div>
            <div className="field" style={{ marginBottom: 10 }}>
              <label className="field-label">{L('Events', '事件')}</label>
              <div className="row wrap" style={{ gap: 14 }}>
                {['push', 'pull_request', 'issues'].map((event) => (
                  <label key={event} className="row" style={{ gap: 6, fontSize: 12.5, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={events.includes(event)}
                      onChange={() => toggleEvent(event)}
                    />
                    {event}
                  </label>
                ))}
              </div>
            </div>
            <div className="action-row">
              <button className="btn primary small" onClick={() => void create()} disabled={busy}>
                {busy ? <span className="spinner" /> : <Plus size={13} />}
                {L('Create', '创建')}
              </button>
              <button className="btn small ghost" onClick={() => setCreating(false)}>
                {L('Cancel', '取消')}
              </button>
            </div>
          </div>
        ) : null}
        {hooks.loading ? (
          <LoadingBlock />
        ) : hooks.error ? (
          <ErrorBlock message={hooks.error} onRetry={hooks.reload} />
        ) : !hooks.data?.length ? (
          <div className="readme-empty">{L('No webhooks configured', '尚未配置 Webhook')}</div>
        ) : (
          <div className="list">
            {hooks.data.map((hook) => (
              <div className="list-item" key={hook.id} style={{ alignItems: 'flex-start' }}>
                <Webhook size={15} className="muted" style={{ marginTop: 3 }} />
                <div className="item-main">
                  <div className="item-title mono truncate">{hook.config?.url || '—'}</div>
                  <div className="item-desc">{hook.events.join(', ')}</div>
                </div>
                <span className={hook.active ? 'badge green' : 'badge'}>
                  {hook.active ? L('active', '启用') : L('inactive', '停用')}
                </span>
                <button
                  className="icon-btn ghost"
                  title={L('Send ping', '发送 Ping')}
                  onClick={() => void ping(hook.id)}
                  disabled={pinging === hook.id}
                >
                  {pinging === hook.id ? <span className="spinner" /> : <Play size={14} />}
                </button>
                <button
                  className="icon-btn ghost"
                  title={L('Delete webhook', '删除 Webhook')}
                  onClick={() => void remove(hook.id)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </SettingsCard>
    </>
  )
}

function ActionsSecretsSection({ owner, repo }: { owner: string; repo: string }) {
  const { lang, toast } = useApp()
  const L = (en: string, zh: string) => (lang === 'zh' ? zh : en)
  const secrets = useGh<{ total_count: number; secrets: ActionsSecret[] }>(
    `/repos/${owner}/${repo}/actions/secrets?per_page=100`,
  )
  const permissions = useGh<ActionsPermissions>(`/repos/${owner}/${repo}/actions/permissions`)
  const [busy, setBusy] = useState(false)
  const settingsUrl = `https://github.com/${owner}/${repo}/settings/secrets/actions`

  const remove = async (name: string) => {
    if (!window.confirm(L(`Delete secret "${name}"?`, `确定删除 Secret「${name}」？`))) return
    const res = await gh(`/repos/${owner}/${repo}/actions/secrets/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    })
    if (res.ok || res.status === 204) {
      toast(L('Secret deleted', 'Secret 已删除'), 'success')
      secrets.reload()
    } else {
      toast(apiErrorMessage(res.data, L('Failed to delete secret', '删除 Secret 失败')), 'error')
    }
  }

  const togglePermissions = async () => {
    const current = permissions.data
    if (!current) return
    setBusy(true)
    const res = await gh(`/repos/${owner}/${repo}/actions/permissions`, {
      method: 'PUT',
      body: { enabled: !current.enabled, allowed_actions: current.allowed_actions || 'all' },
    })
    setBusy(false)
    if (res.ok) {
      toast(L('Actions permissions updated', 'Actions 权限已更新'), 'success')
      permissions.reload()
    } else {
      toast(apiErrorMessage(res.data, L('Failed to update permissions', '更新权限失败')), 'error')
    }
  }

  return (
    <>
      <SettingsCard
        title={L('Actions secrets', 'Actions Secrets')}
        subtitle={L('Secrets available to GitHub Actions', 'GitHub Actions 可用的 Secrets')}
      >
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
          <div className="note">
            <KeyRound size={14} />
            <span style={{ flex: 1 }}>
              {L(
                'Creating a secret requires libsodium encryption. Create it on GitHub and it will appear here.',
                '创建 Secret 需要 libsodium 加密，请在 GitHub 上创建，之后会显示在此处。',
              )}
            </span>
            <button className="btn small" onClick={() => void openExternal(settingsUrl)}>
              <ExternalLink size={12} />
              {L('Open GitHub', '打开 GitHub')}
            </button>
          </div>
        </div>
        {secrets.loading ? (
          <LoadingBlock />
        ) : secrets.error ? (
          <ErrorBlock message={secrets.error} onRetry={secrets.reload} />
        ) : !secrets.data?.secrets?.length ? (
          <div className="readme-empty">{L('No secrets', '暂无 Secret')}</div>
        ) : (
          <div className="list">
            {secrets.data.secrets.map((item) => (
              <div className="list-item" key={item.name}>
                <KeyRound size={15} className="muted" />
                <div className="item-main">
                  <div className="item-title mono">{item.name}</div>
                  <div className="item-desc">
                    {L('Updated', '更新于')} {new Date(item.updated_at).toLocaleDateString()}
                  </div>
                </div>
                <button
                  className="icon-btn ghost"
                  title={L('Delete secret', '删除 Secret')}
                  onClick={() => void remove(item.name)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </SettingsCard>

      <SettingsCard
        title={L('Actions permissions', 'Actions 权限')}
        subtitle={L('Allow or block GitHub Actions for this repository', '允许或禁止此仓库使用 GitHub Actions')}
      >
        <div style={{ padding: '14px 16px' }}>
          {permissions.loading ? (
            <LoadingBlock />
          ) : permissions.error ? (
            <ErrorBlock message={permissions.error} onRetry={permissions.reload} />
          ) : permissions.data ? (
            <div className="row wrap" style={{ gap: 10 }}>
              <span className={permissions.data.enabled ? 'badge green' : 'badge red'}>
                {permissions.data.enabled ? L('enabled', '已启用') : L('disabled', '已禁用')}
              </span>
              <span className="badge">{permissions.data.allowed_actions || 'all'}</span>
              <button className="btn small" onClick={() => void togglePermissions()} disabled={busy}>
                {busy ? <span className="spinner" /> : null}
                {permissions.data.enabled ? L('Disable Actions', '禁用 Actions') : L('Enable Actions', '启用 Actions')}
              </button>
            </div>
          ) : null}
        </div>
      </SettingsCard>
    </>
  )
}

function PagesSection({ owner, repo, defaultBranch }: { owner: string; repo: string; defaultBranch: string }) {
  const { lang, toast } = useApp()
  const L = (en: string, zh: string) => (lang === 'zh' ? zh : en)
  const pages = useGh<PagesInfo>(`/repos/${owner}/${repo}/pages`)
  const [branch, setBranch] = useState(defaultBranch)
  const [busy, setBusy] = useState(false)

  const enable = async () => {
    if (!branch.trim()) {
      toast(L('Enter a branch', '请输入分支名'), 'error')
      return
    }
    setBusy(true)
    const res = await gh(`/repos/${owner}/${repo}/pages`, {
      method: 'POST',
      body: { source: { branch: branch.trim(), path: '/' } },
    })
    setBusy(false)
    if (res.ok) {
      toast(L('GitHub Pages enabled', 'GitHub Pages 已启用'), 'success')
      pages.reload()
    } else {
      toast(apiErrorMessage(res.data, L('Failed to enable Pages', '启用 Pages 失败')), 'error')
    }
  }

  const disable = async () => {
    if (!window.confirm(L('Turn off GitHub Pages for this repository?', '确定关闭此仓库的 GitHub Pages？'))) return
    setBusy(true)
    const res = await gh(`/repos/${owner}/${repo}/pages`, { method: 'DELETE' })
    setBusy(false)
    if (res.ok || res.status === 204) {
      toast(L('GitHub Pages disabled', 'GitHub Pages 已关闭'), 'success')
      pages.reload()
    } else {
      toast(apiErrorMessage(res.data, L('Failed to disable Pages', '关闭 Pages 失败')), 'error')
    }
  }

  const noPermission = pages.status === 403 || pages.status === 401

  return (
    <SettingsCard
      title={L('GitHub Pages', 'GitHub Pages')}
      subtitle={L('Publish a static site from a branch', '从分支发布静态站点')}
    >
      {pages.loading ? (
        <LoadingBlock />
      ) : pages.data ? (
        <div style={{ padding: '14px 16px' }}>
          <div className="row wrap" style={{ gap: 10, marginBottom: 12 }}>
            <span className={pages.data.status === 'built' ? 'badge green' : 'badge'}>
              {pages.data.status || L('configured', '已配置')}
            </span>
            {pages.data.source ? (
              <span className="badge blue">
                {pages.data.source.branch}:{pages.data.source.path}
              </span>
            ) : null}
            {pages.data.url || pages.data.html_url ? (
              <span className="mono truncate muted" style={{ fontSize: 12 }}>
                {pages.data.html_url || pages.data.url}
              </span>
            ) : null}
          </div>
          <div className="action-row">
            {pages.data.html_url || pages.data.url ? (
              <button
                className="btn small"
                onClick={() => void openExternal((pages.data?.html_url || pages.data?.url) as string)}
              >
                <ExternalLink size={13} />
                {L('Open site', '打开站点')}
              </button>
            ) : null}
            <button className="btn small danger" onClick={() => void disable()} disabled={busy}>
              {busy ? <span className="spinner" /> : <Trash2 size={13} />}
              {L('Disable Pages', '关闭 Pages')}
            </button>
          </div>
        </div>
      ) : noPermission ? (
        <div style={{ padding: '14px 16px' }}>
          <div className="note">
            <Globe size={14} />
            <span style={{ flex: 1 }}>
              {L(
                'You do not have permission to manage GitHub Pages for this repository.',
                '你没有权限管理此仓库的 GitHub Pages。',
              )}
            </span>
          </div>
        </div>
      ) : (
        <div style={{ padding: '14px 16px' }}>
          <div className="note" style={{ marginBottom: 12 }}>
            <Globe size={14} />
            <span style={{ flex: 1 }}>
              {pages.status === 404
                ? L('GitHub Pages is not enabled yet.', 'GitHub Pages 尚未启用。')
                : pages.error || L('GitHub Pages is not available.', 'GitHub Pages 不可用。')}
            </span>
          </div>
          <div className="form-grid" style={{ marginBottom: 10 }}>
            <div className="field">
              <label className="field-label">{L('Source branch', '源分支')}</label>
              <input className="input mono" value={branch} onChange={(event) => setBranch(event.target.value)} />
            </div>
            <div className="field">
              <label className="field-label">{L('Path', '路径')}</label>
              <input className="input mono" value="/" disabled />
            </div>
          </div>
          <div className="action-row">
            <button className="btn small primary" onClick={() => void enable()} disabled={busy}>
              {busy ? <span className="spinner" /> : <Globe size={13} />}
              {L('Enable Pages', '启用 Pages')}
            </button>
          </div>
        </div>
      )}
    </SettingsCard>
  )
}

type SettingsTab = 'general' | 'collaborators' | 'branches' | 'webhooks' | 'actions' | 'pages'

const SETTINGS_TABS: { key: SettingsTab; en: string; zh: string }[] = [
  { key: 'general', en: 'General', zh: '常规' },
  { key: 'collaborators', en: 'Collaborators', zh: '协作者' },
  { key: 'branches', en: 'Branches', zh: '分支' },
  { key: 'webhooks', en: 'Webhooks', zh: 'Webhooks' },
  { key: 'actions', en: 'Actions', zh: 'Actions' },
  { key: 'pages', en: 'Pages', zh: 'Pages' },
]

export function RepoSettingsModal({
  repo,
  onClose,
  onSaved,
  onDeleted,
}: {
  repo: GhRepo
  onClose: () => void
  onSaved: () => void
  onDeleted: () => void
}) {
  const { t, toast, lang } = useApp()
  const L = (en: string, zh: string) => (lang === 'zh' ? zh : en)
  const [tab, setTab] = useState<SettingsTab>('general')
  const [description, setDescription] = useState(repo.description || '')
  const [homepage, setHomepage] = useState((repo as any).homepage || '')
  const [topics, setTopics] = useState((repo.topics || []).join(', '))
  const [isPrivate, setIsPrivate] = useState(repo.private)
  const [archived, setArchived] = useState(Boolean(repo.archived))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmName, setConfirmName] = useState('')
  const [deleting, setDeleting] = useState(false)

  const save = async () => {
    setBusy(true)
    setError('')
    const res = await gh(`/repos/${repo.owner.login}/${repo.name}`, {
      method: 'PATCH',
      body: {
        description,
        homepage,
        private: isPrivate,
        archived,
        topics: topics
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
      },
    })
    setBusy(false)
    if (res.ok) {
      toast(t('repo.saved'), 'success')
      onSaved()
    } else {
      setError(apiErrorMessage(res.data, t('app.requestFailed', { status: res.status })))
    }
  }

  const remove = async () => {
    if (confirmName !== repo.full_name) return
    setDeleting(true)
    const res = await gh(`/repos/${repo.owner.login}/${repo.name}`, { method: 'DELETE' })
    setDeleting(false)
    if (res.ok || res.status === 204) {
      toast(t('repo.deletedRepo'), 'success')
      onDeleted()
      onClose()
    } else if (res.status === 403 || res.status === 404) {
      setError(
        L(
          'Deleting a repository requires the delete_repo authorization. Sign out and sign in again to grant it, and make sure you have admin permission on this repository.',
          '删除仓库需要 delete_repo 授权。请退出账号后重新登录以授予该权限，并确认你对该仓库有管理员权限。',
        ),
      )
    } else {
      setError(apiErrorMessage(res.data, t('app.requestFailed', { status: res.status })))
    }
  }

  return (
    <Modal
      title={t('repo.settingsTitle')}
      subtitle={t('repo.settingsHint')}
      onClose={onClose}
      footer={
        tab === 'general' ? (
          <>
            <button className="btn ghost" onClick={onClose}>
              {t('app.cancel')}
            </button>
            <button className="btn primary" onClick={() => void save()} disabled={busy}>
              {busy ? <span className="spinner" /> : <Save size={14} />}
              {t('common.save')}
            </button>
          </>
        ) : (
          <button className="btn ghost" onClick={onClose}>
            {t('app.close')}
          </button>
        )
      }
    >
      <div className="tabs" style={{ margin: '0 -8px 14px' }}>
        {SETTINGS_TABS.map((item) => (
          <button
            key={item.key}
            className={tab === item.key ? 'tab active' : 'tab'}
            style={{ padding: '0 10px', fontSize: 12.5 }}
            onClick={() => setTab(item.key)}
          >
            {L(item.en, item.zh)}
          </button>
        ))}
      </div>

      {tab === 'general' ? (
        <>
          <div className="field" style={{ marginBottom: 12 }}>
            <label className="field-label">{t('repos.desc')}</label>
            <textarea className="textarea" value={description} onChange={(event) => setDescription(event.target.value)} />
          </div>
          <div className="form-grid" style={{ marginBottom: 12 }}>
            <div className="field">
              <label className="field-label">{t('repo.homepage')}</label>
              <input className="input" value={homepage} onChange={(event) => setHomepage(event.target.value)} />
            </div>
            <div className="field">
              <label className="field-label">{t('repo.topics')}</label>
              <input className="input" value={topics} onChange={(event) => setTopics(event.target.value)} placeholder="react, electron" />
            </div>
          </div>
          <div className="row wrap" style={{ gap: 18, marginBottom: 8 }}>
            <label className="row" style={{ gap: 8, fontSize: 12.5, cursor: 'pointer' }}>
              <input type="checkbox" checked={isPrivate} onChange={(event) => setIsPrivate(event.target.checked)} />
              {t('repo.privateRepo')}
            </label>
            <label className="row" style={{ gap: 8, fontSize: 12.5, cursor: 'pointer' }}>
              <input type="checkbox" checked={archived} onChange={(event) => setArchived(event.target.checked)} />
              {t('repo.archived')}
            </label>
          </div>

          {error ? (
            <div style={{ marginTop: 12 }}>
              <ErrorBlock message={error} />
            </div>
          ) : null}

          <div className="danger-zone">
            <div className="row" style={{ gap: 8, color: 'var(--red)', fontWeight: 650, fontSize: 13 }}>
              <AlertTriangle size={15} />
              {t('repo.dangerZone')}
            </div>
            <p className="field-hint" style={{ margin: '6px 0 10px' }}>
              {t('repo.deleteRepoHint', { name: repo.full_name })}
            </p>
            <div className="row">
              <input
                className="input"
                value={confirmName}
                onChange={(event) => setConfirmName(event.target.value)}
                placeholder={repo.full_name}
              />
              <button
                className="btn danger"
                onClick={() => void remove()}
                disabled={confirmName !== repo.full_name || deleting}
              >
                {deleting ? <span className="spinner" /> : <Trash2 size={14} />}
                {t('repo.deleteRepo')}
              </button>
            </div>
          </div>
        </>
      ) : null}

      {tab === 'collaborators' ? <CollaboratorsSection owner={repo.owner.login} repo={repo.name} /> : null}
      {tab === 'branches' ? (
        <BranchesSection
          owner={repo.owner.login}
          repo={repo.name}
          defaultBranch={repo.default_branch}
          onDefaultChanged={onSaved}
        />
      ) : null}
      {tab === 'webhooks' ? <WebhooksSection owner={repo.owner.login} repo={repo.name} /> : null}
      {tab === 'actions' ? <ActionsSecretsSection owner={repo.owner.login} repo={repo.name} /> : null}
      {tab === 'pages' ? (
        <PagesSection owner={repo.owner.login} repo={repo.name} defaultBranch={repo.default_branch} />
      ) : null}
    </Modal>
  )
}
