import { useState } from 'react'
import { Pencil, Plus, Tag, Trash2 } from 'lucide-react'
import { useApp } from '../lib/store'
import { apiErrorMessage, gh } from '../lib/api'
import { useGh } from '../lib/hooks'
import { ErrorBlock, LoadingBlock, Modal } from './ui'

type Label = { id: number; name: string; color: string; description: string | null }

export function LabelsModal({ owner, repo, onClose }: { owner: string; repo: string; onClose: () => void }) {
  const { t, authenticated, openLogin, toast } = useApp()
  const labels = useGh<Label[]>(`/repos/${owner}/${repo}/labels?per_page=100`)
  const [editing, setEditing] = useState<Label | null>(null)
  const [composer, setComposer] = useState(false)
  const [name, setName] = useState('')
  const [color, setColor] = useState('0052cc')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const openCreate = () => {
    if (!authenticated) {
      openLogin()
      return
    }
    setEditing(null)
    setName('')
    setColor('0052cc')
    setDescription('')
    setComposer(true)
    setError('')
  }

  const openEdit = (label: Label) => {
    if (!authenticated) {
      openLogin()
      return
    }
    setEditing(label)
    setName(label.name)
    setColor(label.color)
    setDescription(label.description || '')
    setComposer(true)
    setError('')
  }

  const closeComposer = () => {
    setComposer(false)
    setEditing(null)
    setError('')
  }

  const save = async () => {
    const cleanColor = color.trim().replace(/^#/, '')
    if (!name.trim()) {
      setError(t('labels.needName'))
      return
    }
    if (!/^[0-9a-fA-F]{6}$/.test(cleanColor)) {
      setError(t('labels.badColor'))
      return
    }
    setBusy(true)
    setError('')
    const body = { name: name.trim(), color: cleanColor, description: description.trim() }
    const res = editing
      ? await gh(`/repos/${owner}/${repo}/labels/${encodeURIComponent(editing.name)}`, { method: 'PATCH', body })
      : await gh(`/repos/${owner}/${repo}/labels`, { method: 'POST', body })
    setBusy(false)
    if (res.ok) {
      toast(t(editing ? 'labels.updated' : 'labels.created'), 'success')
      closeComposer()
      labels.reload()
    } else {
      setError(apiErrorMessage(res.data, t('app.requestFailed', { status: res.status })))
    }
  }

  const remove = async (label: Label) => {
    if (!window.confirm(t('labels.deleteConfirm'))) return
    const res = await gh(`/repos/${owner}/${repo}/labels/${encodeURIComponent(label.name)}`, { method: 'DELETE' })
    if (res.ok || res.status === 204) {
      toast(t('labels.deleted'), 'success')
      labels.reload()
    } else {
      toast(apiErrorMessage(res.data, t('app.requestFailed', { status: res.status })), 'error')
    }
  }

  return (
    <Modal
      wide
      title={t('labels.title')}
      icon={<Tag size={16} />}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            {t('app.close')}
          </button>
          <button className="btn primary" onClick={openCreate}>
            <Plus size={13} />
            {t('labels.new')}
          </button>
        </>
      }
    >
      {composer ? (
        <div className="label-composer">
          <div className="form-grid" style={{ marginBottom: 10 }}>
            <div className="field">
              <label className="field-label">{t('labels.name')}</label>
              <input className="input" value={name} onChange={(event) => setName(event.target.value)} autoFocus />
            </div>
            <div className="field">
              <label className="field-label">{t('labels.color')}</label>
              <div className="row" style={{ gap: 8 }}>
                <span className="label-color-preview" style={{ background: `#${color.replace(/^#/, '') || '000000'}` }} />
                <input
                  className="input mono"
                  value={color}
                  onChange={(event) => setColor(event.target.value)}
                  placeholder="0052cc"
                />
              </div>
            </div>
          </div>
          <div className="field" style={{ marginBottom: 10 }}>
            <label className="field-label">{t('labels.description')}</label>
            <input
              className="input"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={t('labels.descriptionPlaceholder')}
            />
          </div>
          <div className="action-row">
            <button className="btn primary small" onClick={() => void save()} disabled={busy}>
              {busy ? <span className="spinner" /> : null}
              {t('common.save')}
            </button>
            <button className="btn small ghost" onClick={closeComposer}>
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

      {labels.loading ? (
        <LoadingBlock />
      ) : labels.error ? (
        <ErrorBlock message={labels.error} onRetry={labels.reload} />
      ) : !labels.data?.length ? (
        <div className="readme-empty">{t('labels.empty')}</div>
      ) : (
        <div className="label-list">
          {labels.data.map((label) => (
            <div className="label-row" key={label.id}>
              <span
                className="label-chip"
                style={{
                  background: `#${label.color}`,
                  color: '#fff',
                  textShadow: '0 1px 2px rgba(0,0,0,.35)',
                }}
              >
                {label.name}
              </span>
              <span className="label-row-desc">{label.description || ''}</span>
              <span className="mono muted" style={{ fontSize: 10.5 }}>
                #{label.color}
              </span>
              {authenticated ? (
                <div className="action-row">
                  <button className="icon-btn ghost tiny" title={t('common.edit')} onClick={() => openEdit(label)}>
                    <Pencil size={12} />
                  </button>
                  <button className="icon-btn ghost tiny" title={t('common.delete')} onClick={() => void remove(label)}>
                    <Trash2 size={12} />
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}
