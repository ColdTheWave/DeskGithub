import { useEffect, useState } from 'react'
import {
  Code2,
  ExternalLink,
  FileCode2,
  GitFork,
  Globe,
  Lock,
  MessageSquare,
  Pencil,
  Plus,
  Send,
  Star,
  Trash2,
  X,
} from 'lucide-react'
import { useApp } from '../lib/store'
import { apiErrorMessage, gh } from '../lib/api'
import { useGh } from '../lib/hooks'
import {
  Avatar,
  Badge,
  EmptyState,
  ErrorBlock,
  LoadingBlock,
  LockGate,
  Modal,
  PageHeader,
  TimeAgo,
} from '../components/ui'
import { Markdown } from '../components/Markdown'
import { Pagination } from '../components/Pagination'
import { openExternal } from '../lib/desktop'

type GistFile = { filename: string; size: number; type: string; raw_url: string; content?: string }
type Gist = {
  id: string
  description: string | null
  public: boolean
  updated_at: string
  created_at: string
  html_url: string
  files: Record<string, GistFile>
  owner?: { login: string; avatar_url: string }
}

type GistComment = {
  id: number
  user: { login: string; avatar_url: string } | null
  body: string
  created_at: string
}

type GistView = 'mine' | 'public' | 'starred'

const GIST_ENDPOINTS: Record<GistView, string> = {
  mine: '/gists',
  public: '/gists/public',
  starred: '/gists/starred',
}

export function GistsPage() {
  const { t, lang, authenticated, openLogin, toast } = useApp()
  const L = (en: string, zh: string) => (lang === 'zh' ? zh : en)
  const [view, setView] = useState<GistView>('mine')
  const [page, setPage] = useState(1)
  const gists = useGh<Gist[]>(
    authenticated ? `${GIST_ENDPOINTS[view]}?per_page=30&page=${page}` : null,
    [view, page],
  )
  const [creating, setCreating] = useState(false)
  const [selected, setSelected] = useState<Gist | null>(null)

  const switchView = (next: GistView) => {
    setView(next)
    setPage(1)
  }

  if (!authenticated) {
    return (
      <div className="page">
        <PageHeader title={t('gists.title')} subtitle={t('gists.subtitle')} />
        <LockGate title={t('gists.loginTitle')} text={t('gists.loginText')} onSignIn={openLogin} />
      </div>
    )
  }

  return (
    <div className="page">
      <PageHeader
        title={t('gists.title')}
        subtitle={t('gists.subtitle')}
        actions={
          <button className="btn primary" onClick={() => setCreating(true)}>
            <Plus size={14} />
            {t('gists.new')}
          </button>
        }
      />

      <section className="card">
        <div className="tabs">
          <button className={view === 'mine' ? 'tab active' : 'tab'} onClick={() => switchView('mine')}>
            <Code2 size={14} />
            {L('My gists', '我的 Gist')}
          </button>
          <button className={view === 'public' ? 'tab active' : 'tab'} onClick={() => switchView('public')}>
            <Globe size={14} />
            {L('Public', '公开')}
          </button>
          <button className={view === 'starred' ? 'tab active' : 'tab'} onClick={() => switchView('starred')}>
            <Star size={14} />
            {L('Starred', '已收藏')}
          </button>
        </div>

        {gists.loading ? (
          <LoadingBlock />
        ) : gists.error ? (
          <div style={{ padding: 16 }}>
            <ErrorBlock message={gists.error} onRetry={gists.reload} />
          </div>
        ) : !gists.data?.length ? (
          <EmptyState
            icon={<Code2 size={20} />}
            title={t('gists.empty')}
            text={t('gists.emptyText')}
            action={
              <button className="btn primary" onClick={() => setCreating(true)}>
                <Plus size={14} />
                {t('gists.new')}
              </button>
            }
          />
        ) : (
          <div className="list">
            {gists.data.map((gist) => {
              const files = Object.values(gist.files || {})
              return (
                <button className="list-item" key={gist.id} onClick={() => setSelected(gist)}>
                  <span className="repo-avatar" style={{ borderRadius: 9 }}>
                    <Code2 size={17} color="var(--accent)" />
                  </span>
                  <div className="item-main">
                    <div className="item-title">
                      <span className="truncate">{gist.description || files[0]?.filename || gist.id}</span>
                      <Badge tone={gist.public ? 'green' : 'gold'}>
                        {!gist.public ? <Lock size={10} /> : null}
                        {gist.public ? t('gists.public') : t('gists.secret')}
                      </Badge>
                    </div>
                    <div className="item-meta">
                      <span>{t('gists.files', { n: files.length })}</span>
                      {gist.owner?.login ? <span className="mono">{gist.owner.login}</span> : null}
                      <span>
                        {t('gists.updated')} <TimeAgo iso={gist.updated_at} />
                      </span>
                      <span className="mono truncate">{files.slice(0, 3).map((file) => file.filename).join(' · ')}</span>
                    </div>
                  </div>
                  <ExternalLink size={14} color="var(--muted)" />
                </button>
              )
            })}
          </div>
        )}
        <Pagination
          page={page}
          onPage={setPage}
          hasNext={(gists.data?.length || 0) === 30}
          loading={gists.loading}
        />
      </section>

      {creating ? (
        <GistForm
          onClose={() => setCreating(false)}
          onSaved={() => {
            gists.reload()
            toast(t('gists.created'), 'success')
          }}
        />
      ) : null}

      {selected ? (
        <GistDetail
          id={selected.id}
          onClose={() => setSelected(null)}
          onChanged={() => gists.reload()}
        />
      ) : null}
    </div>
  )
}

function GistForm({ gist, onClose, onSaved }: { gist?: Gist; onClose: () => void; onSaved: () => void }) {
  const { t, lang, toast } = useApp()
  const L = (en: string, zh: string) => (lang === 'zh' ? zh : en)
  const [description, setDescription] = useState(gist?.description || '')
  const [isPublic, setIsPublic] = useState(gist?.public || false)
  const [rows, setRows] = useState<{ key: number; original: string; filename: string; content: string }[]>(() => {
    const files = Object.values(gist?.files || {})
    if (!files.length) return [{ key: 1, original: '', filename: 'snippet.ts', content: '' }]
    return files.map((file, index) => ({
      key: index + 1,
      original: file.filename,
      filename: file.filename,
      content: file.content || '',
    }))
  })
  const [nextKey, setNextKey] = useState(rows.length + 1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const addRow = () => {
    setRows((prev) => [...prev, { key: nextKey, original: '', filename: '', content: '' }])
    setNextKey((value) => value + 1)
  }

  const removeRow = (key: number) => {
    setRows((prev) => (prev.length > 1 ? prev.filter((row) => row.key !== key) : prev))
  }

  const updateRow = (key: number, patch: { filename?: string; content?: string }) => {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  }

  const save = async () => {
    const files: Record<string, { content: string; filename?: string } | null> = {}
    for (const row of rows) {
      const name = row.filename.trim()
      if (!name) continue
      if (gist && row.original && row.original !== name) {
        files[row.original] = { filename: name, content: row.content }
      } else {
        files[name] = { content: row.content }
      }
    }
    if (!Object.keys(files).length) {
      setError(L('Add at least one file', '至少添加一个文件'))
      return
    }
    if (gist) {
      for (const name of Object.keys(gist.files || {})) {
        const kept = rows.some((row) => row.filename.trim() === name || row.original === name)
        if (!kept) files[name] = null
      }
    }
    setBusy(true)
    setError('')
    const res = gist
      ? await gh(`/gists/${gist.id}`, { method: 'PATCH', body: { description, files } })
      : await gh('/gists', { method: 'POST', body: { description, public: isPublic, files } })
    setBusy(false)
    if (res.ok) {
      toast(gist ? t('gists.saved') : t('gists.created'), 'success')
      onSaved()
      onClose()
    } else {
      setError(apiErrorMessage(res.data, t('app.requestFailed', { status: res.status })))
    }
  }

  return (
    <Modal
      wide
      title={gist ? L('Edit gist', '编辑 Gist') : t('gists.createTitle')}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            {t('app.cancel')}
          </button>
          <button className="btn primary" onClick={() => void save()} disabled={busy}>
            {busy ? <span className="spinner" /> : gist ? <Pencil size={14} /> : <Plus size={14} />}
            {gist ? t('common.save') : t('common.create')}
          </button>
        </>
      }
    >
      <div className="field" style={{ marginBottom: 12 }}>
        <label className="field-label">{t('gists.description')}</label>
        <input className="input" value={description} onChange={(event) => setDescription(event.target.value)} />
      </div>

      <div className="field" style={{ marginBottom: 12 }}>
        <label className="field-label">{t('gists.files', { n: rows.length })}</label>
        {rows.map((row) => (
          <div className="gist-file" key={row.key} style={{ marginBottom: 10 }}>
            <div className="gist-file-head">
              <FileCode2 size={14} />
              <input
                className="input mono"
                style={{ flex: 1, minWidth: 0 }}
                value={row.filename}
                onChange={(event) => updateRow(row.key, { filename: event.target.value })}
                placeholder={t('gists.filename')}
                spellCheck={false}
              />
              <button
                className="icon-btn ghost"
                title={L('Remove file', '移除文件')}
                onClick={() => removeRow(row.key)}
                disabled={rows.length === 1}
              >
                <X size={14} />
              </button>
            </div>
            <textarea
              className="textarea mono"
              style={{ minHeight: 150, borderRadius: 0, border: 0, fontSize: 12.5 }}
              value={row.content}
              onChange={(event) => updateRow(row.key, { content: event.target.value })}
              spellCheck={false}
            />
          </div>
        ))}
        <div className="action-row">
          <button className="btn small" onClick={addRow}>
            <Plus size={13} />
            {L('Add file', '添加文件')}
          </button>
        </div>
      </div>

      {!gist ? (
        <>
          <label className="row" style={{ gap: 8, fontSize: 12.5, cursor: 'pointer' }}>
            <input type="checkbox" checked={isPublic} onChange={(event) => setIsPublic(event.target.checked)} />
            {t('gists.public')}
          </label>
          <div className="field-hint" style={{ marginTop: 4 }}>
            {t('gists.publicHint')}
          </div>
        </>
      ) : null}

      {error ? (
        <div style={{ marginTop: 12 }}>
          <ErrorBlock message={error} />
        </div>
      ) : null}
    </Modal>
  )
}

function GistDetail({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { t, lang, user, toast } = useApp()
  const L = (en: string, zh: string) => (lang === 'zh' ? zh : en)
  const detail = useGh<Gist>(`/gists/${id}`)
  const comments = useGh<GistComment[]>(`/gists/${id}/comments?per_page=100`)
  const [busy, setBusy] = useState<string | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [starred, setStarred] = useState(false)

  const gist = detail.data

  useEffect(() => {
    let alive = true
    void gh(`/gists/${id}/star`).then((res) => {
      if (alive) setStarred(res.ok && res.status === 204)
    })
    return () => {
      alive = false
    }
  }, [id])

  const toggleStar = async () => {
    setBusy('star')
    const res = await gh(`/gists/${id}/star`, { method: starred ? 'DELETE' : 'PUT' })
    setBusy(null)
    if (res.ok || res.status === 204) {
      setStarred(!starred)
      toast(starred ? L('Removed from starred gists', '已取消收藏') : L('Gist starred', '已收藏 Gist'), 'success')
    } else {
      toast(apiErrorMessage(res.data, t('app.requestFailed', { status: res.status })), 'error')
    }
  }

  const forkGist = async () => {
    setBusy('fork')
    const res = await gh(`/gists/${id}/forks`, { method: 'POST' })
    setBusy(null)
    if (res.ok) {
      toast(L('Gist forked', '已 Fork Gist'), 'success')
      onChanged()
    } else {
      toast(apiErrorMessage(res.data, t('app.requestFailed', { status: res.status })), 'error')
    }
  }

  const postComment = async () => {
    if (!commentText.trim()) return
    setBusy('comment')
    const res = await gh(`/gists/${id}/comments`, { method: 'POST', body: { body: commentText.trim() } })
    setBusy(null)
    if (res.ok) {
      setCommentText('')
      toast(L('Comment posted', '评论已发布'), 'success')
      comments.reload()
    } else {
      toast(apiErrorMessage(res.data, t('app.requestFailed', { status: res.status })), 'error')
    }
  }

  const deleteComment = async (comment: GistComment) => {
    if (!window.confirm(L('Delete this comment?', '删除这条评论？'))) return
    setBusy(`delete-${comment.id}`)
    const res = await gh(`/gists/${id}/comments/${comment.id}`, { method: 'DELETE' })
    setBusy(null)
    if (res.ok || res.status === 204) {
      toast(L('Comment deleted', '评论已删除'), 'success')
      comments.reload()
    } else {
      toast(apiErrorMessage(res.data, t('app.requestFailed', { status: res.status })), 'error')
    }
  }

  const remove = async () => {
    if (!window.confirm(t('gists.deleteConfirm'))) return
    setBusy('delete')
    const res = await gh(`/gists/${id}`, { method: 'DELETE' })
    setBusy(null)
    if (res.ok || res.status === 204) {
      toast(t('gists.deleted'), 'success')
      onChanged()
      onClose()
    }
  }

  return (
    <>
      <Modal
        wide
        title={gist?.description || t('gists.title')}
        subtitle={gist ? (gist.public ? t('gists.public') : t('gists.secret')) : undefined}
        onClose={onClose}
        footer={
          <>
            <button className="btn ghost" onClick={onClose}>
              {t('app.close')}
            </button>
            {gist ? (
              <>
                <button
                  className="icon-btn"
                  title={starred ? L('Unstar gist', '取消收藏') : L('Star gist', '收藏 Gist')}
                  onClick={() => void toggleStar()}
                  disabled={busy !== null}
                >
                  <Star size={15} fill={starred ? 'currentColor' : 'none'} />
                </button>
                <button
                  className="icon-btn"
                  title={L('Fork gist', 'Fork Gist')}
                  onClick={() => void forkGist()}
                  disabled={busy !== null}
                >
                  <GitFork size={15} />
                </button>
                <button className="btn" onClick={() => setEditOpen(true)}>
                  <Pencil size={14} />
                  {t('common.edit')}
                </button>
                <button className="btn" onClick={() => void openExternal(gist.html_url)}>
                  <ExternalLink size={14} />
                  {t('gists.open')}
                </button>
                <button className="btn danger" onClick={() => void remove()} disabled={busy !== null}>
                  <Trash2 size={14} />
                  {t('gists.delete')}
                </button>
              </>
            ) : null}
          </>
        }
      >
        {detail.loading ? (
          <LoadingBlock label={t('gists.loading')} />
        ) : detail.error ? (
          <ErrorBlock message={detail.error} onRetry={detail.reload} />
        ) : !gist ? (
          <div className="readme-empty">{t('gists.empty')}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {Object.values(gist.files || {}).map((file) => (
              <div className="gist-file" key={file.filename}>
                <div className="gist-file-head">
                  <FileCode2 size={14} />
                  <span className="mono truncate">{file.filename}</span>
                  <span className="spacer" />
                  <span className="muted" style={{ fontSize: 11 }}>
                    {file.size} B
                  </span>
                </div>
                <pre className="gist-code">{file.content || ''}</pre>
              </div>
            ))}

            <div className="section-title" style={{ marginTop: 4 }}>
              {L('Comments', '评论')} · {comments.data?.length || 0}
            </div>

            {comments.loading ? (
              <LoadingBlock />
            ) : comments.error ? (
              <ErrorBlock message={comments.error} onRetry={comments.reload} />
            ) : !comments.data?.length ? (
              <div className="muted" style={{ fontSize: 12.5 }}>
                {L('No comments yet', '还没有评论')}
              </div>
            ) : (
              comments.data.map((comment) => (
                <section className="card comment" key={comment.id} style={{ marginTop: 0 }}>
                  <div className="comment-head">
                    {comment.user ? <Avatar user={comment.user} size={20} /> : null}
                    <strong>{comment.user?.login}</strong>
                    <span>
                      <TimeAgo iso={comment.created_at} />
                    </span>
                    {user && comment.user?.login === user.login ? (
                      <button
                        className="icon-btn ghost"
                        style={{ marginLeft: 'auto' }}
                        title={L('Delete comment', '删除评论')}
                        onClick={() => void deleteComment(comment)}
                        disabled={busy === `delete-${comment.id}`}
                      >
                        <Trash2 size={13} />
                      </button>
                    ) : null}
                  </div>
                  <div className="comment-body">
                    <Markdown markdown={comment.body || ''} />
                  </div>
                </section>
              ))
            )}

            <section className="card card-body">
              <div className="card-title" style={{ marginBottom: 10 }}>
                <MessageSquare size={15} />
                {L('Add a comment', '发表评论')}
              </div>
              <textarea
                className="textarea"
                value={commentText}
                onChange={(event) => setCommentText(event.target.value)}
                placeholder={L('Leave a comment', '写下评论')}
              />
              <div className="action-row" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
                <button
                  className="btn primary"
                  onClick={() => void postComment()}
                  disabled={busy === 'comment' || !commentText.trim()}
                >
                  {busy === 'comment' ? <span className="spinner" /> : <Send size={14} />}
                  {L('Comment', '评论')}
                </button>
              </div>
            </section>
          </div>
        )}
      </Modal>

      {editOpen && gist ? (
        <GistForm
          gist={gist}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            detail.reload()
            onChanged()
          }}
        />
      ) : null}
    </>
  )
}
