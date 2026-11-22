import { useEffect, useState } from 'react'
import { BookOpen, ExternalLink, Pencil, RefreshCw, Save, Trash2, X } from 'lucide-react'
import { useApp } from '../lib/store'
import { getDesktop, openExternal } from '../lib/desktop'
import { ErrorBlock, LoadingBlock, Modal } from './ui'
import { Markdown } from './Markdown'

export function WikiModal({ owner, repo, onClose }: { owner: string; repo: string; onClose: () => void }) {
  const { t, lang, authenticated, toast } = useApp()
  const L = (en: string, zh: string) => (lang === 'zh' ? zh : en)
  const [page, setPage] = useState('Home')
  const [input, setInput] = useState('Home')
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [pages, setPages] = useState<string[]>([])

  const load = async (name: string) => {
    const desktop = getDesktop()
    if (!desktop) {
      setLoading(false)
      setError(t('wiki.desktopOnly'))
      return
    }
    setLoading(true)
    setError('')
    setEditing(false)
    const res = await desktop.wiki.page({ owner, repo, page: name })
    setLoading(false)
    if (res.ok && typeof res.content === 'string') {
      setContent(res.content)
      setDraft(res.content)
      setPage(res.page || name)
      setInput(res.page || name)
    } else {
      setContent('')
      setDraft('')
      setError(res.status === 404 ? t('wiki.notFound') : res.error || t('wiki.notFound'))
      setPage(name)
      setInput(name)
    }
  }

  useEffect(() => {
    void load('Home')
    void loadPages()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, repo])

  const loadPages = async () => {
    const desktop = getDesktop()
    if (!desktop) return
    const res = await desktop.wiki.pages({ owner, repo })
    if (res.ok && Array.isArray(res.pages)) setPages(res.pages)
  }

  const removePage = async () => {
    const desktop = getDesktop()
    if (!desktop) return
    if (!window.confirm(L(`Delete wiki page “${page}”?`, `删除 Wiki 页面「${page}」？`))) return
    const res = await desktop.wiki.delete({ owner, repo, page })
    if (res.ok) {
      toast(L('Wiki page deleted', 'Wiki 页面已删除'), 'success')
      await loadPages()
      await load('Home')
    } else {
      toast(res.error || L('Failed to delete wiki page', '删除 Wiki 页面失败'), 'error')
    }
  }

  const save = async () => {
    const desktop = getDesktop()
    if (!desktop) return
    setSaving(true)
    const res = await desktop.wiki.save({
      owner,
      repo,
      page: input.trim() || page,
      content: draft,
      message: `Update ${input.trim() || page}`,
    })
    setSaving(false)
    if (res.ok) {
      toast(L('Wiki page saved', 'Wiki 页面已保存'), 'success')
      setContent(draft)
      setPage(res.page || page)
      setEditing(false)
      void loadPages()
    } else {
      toast(res.error || L('Failed to save wiki page', '保存 Wiki 失败'), 'error')
    }
  }

  return (
    <Modal
      wide
      title={t('wiki.title')}
      subtitle={`${owner}/${repo}`}
      icon={<BookOpen size={16} />}
      onClose={onClose}
      footer={
        editing ? (
          <>
            <button className="btn ghost" onClick={() => setEditing(false)} disabled={saving}>
              <X size={13} />
              {t('app.cancel')}
            </button>
            <button className="btn primary" onClick={() => void save()} disabled={saving}>
              {saving ? <span className="spinner" /> : <Save size={13} />}
              {L('Save page', '保存页面')}
            </button>
          </>
        ) : (
          <>
            <button className="btn ghost" onClick={onClose}>
              {t('app.close')}
            </button>
            <button className="btn" onClick={() => void load(page)} disabled={loading}>
              <RefreshCw size={13} />
              {t('wiki.reload')}
            </button>
            {authenticated ? (
              <button
                className="btn"
                onClick={() => {
                  setDraft(content)
                  setEditing(true)
                }}
                disabled={loading}
              >
                <Pencil size={13} />
                {L('Edit', '编辑')}
              </button>
            ) : null}
            {authenticated && !error ? (
              <button className="btn" onClick={() => void removePage()}>
                <Trash2 size={13} />
                {L('Delete', '删除')}
              </button>
            ) : null}
            <button
              className="btn"
              onClick={() => void openExternal(`https://github.com/${owner}/${repo}/wiki/${page}/_history`)}
            >
              <ExternalLink size={13} />
              {L('History', '历史')}
            </button>
            <button
              className="btn primary"
              onClick={() => void openExternal(`https://github.com/${owner}/${repo}/wiki/${page}`)}
            >
              <ExternalLink size={13} />
              {t('app.openInBrowser')}
            </button>
          </>
        )
      }
    >
      <form
        className="row"
        style={{ marginBottom: 12 }}
        onSubmit={(event) => {
          event.preventDefault()
          void load(input)
        }}
      >
        <input
          className="input mono"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={t('wiki.pagePlaceholder')}
        />
        {pages.length ? (
          <select
            className="select"
            style={{ width: 180 }}
            value={page}
            onChange={(event) => {
              setInput(event.target.value)
              void load(event.target.value)
            }}
            aria-label={L('Wiki pages', 'Wiki 页面')}
          >
            {pages.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        ) : null}
        <button className="btn" type="submit" disabled={loading}>
          {t('wiki.load')}
        </button>
      </form>

      {loading ? (
        <LoadingBlock />
      ) : editing ? (
        <textarea
          className="textarea mono"
          style={{ minHeight: 360, fontFamily: 'var(--mono)', fontSize: 12.5 }}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          spellCheck={false}
        />
      ) : error ? (
        <div>
          <ErrorBlock message={error} onRetry={() => void load(page)} />
          {authenticated ? (
            <div className="action-row" style={{ marginTop: 12 }}>
              <button
                className="btn"
                onClick={() => {
                  setDraft(`# ${input || page}\n`)
                  setEditing(true)
                }}
              >
                <Pencil size={13} />
                {L('Create this page', '创建此页面')}
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="wiki-body">
          <Markdown markdown={content} owner={owner} repo={repo} />
        </div>
      )}
    </Modal>
  )
}
