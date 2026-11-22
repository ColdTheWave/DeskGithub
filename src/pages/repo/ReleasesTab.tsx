import { useState } from 'react'
import { Download, Check, Eye, GitCompare, Package, Pencil, Plus, Tag, Trash2, Upload, Wand2, X } from 'lucide-react'
import { useApp } from '../../lib/store'
import { apiErrorMessage, gh } from '../../lib/api'
import { useGh } from '../../lib/hooks'
import { Badge, EmptyState, ErrorBlock, LoadingBlock, Modal, TimeAgo } from '../../components/ui'
import { Markdown } from '../../components/Markdown'
import { Pagination } from '../../components/Pagination'
import { getDesktop, openExternal } from '../../lib/desktop'
import { bytes } from '../../lib/format'

type ReleaseAsset = { id: number; name: string; size: number; download_count: number; browser_download_url: string }
type Release = {
  id: number
  tag_name: string
  name: string | null
  body: string | null
  draft: boolean
  prerelease: boolean
  created_at: string
  published_at: string | null
  html_url: string
  author: { login: string; avatar_url: string } | null
  assets: ReleaseAsset[]
}

export function ReleasesTab({ owner, repo }: { owner: string; repo: string }) {
  const { t, lang, authenticated, openLogin, toast } = useApp()
  const L = (en: string, zh: string) => (lang === 'zh' ? zh : en)
  const [page, setPage] = useState(1)
  const releases = useGh<Release[]>(`/repos/${owner}/${repo}/releases?per_page=30&page=${page}`, [page])
  const tags = useGh<{ name: string; commit: { sha: string } }[]>(`/repos/${owner}/${repo}/tags?per_page=30`)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Release | null>(null)
  const [tag, setTag] = useState('')
  const [name, setName] = useState('')
  const [body, setBody] = useState('')
  const [draft, setDraft] = useState(false)
  const [prerelease, setPrerelease] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notesBusy, setNotesBusy] = useState(false)
  const [uploadingId, setUploadingId] = useState<number | null>(null)
  const [renaming, setRenaming] = useState<ReleaseAsset | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [renameBusy, setRenameBusy] = useState(false)
  const [viewing, setViewing] = useState<Release | null>(null)
  const [publishingId, setPublishingId] = useState<number | null>(null)
  const [error, setError] = useState('')

  const list = releases.data || []
  const latestId = list.find((item) => !item.draft && !item.prerelease)?.id ?? null
  const previousTagFor = (release: Release): string | null => {
    const index = list.findIndex((item) => item.id === release.id)
    if (index < 0) return null
    for (let cursor = index + 1; cursor < list.length; cursor += 1) {
      const candidate = list[cursor]
      if (!candidate.draft && candidate.tag_name !== release.tag_name) return candidate.tag_name
    }
    return null
  }
  const compareUrl = (release: Release, previous: string) =>
    `https://github.com/${owner}/${repo}/compare/${encodeURIComponent(previous)}...${encodeURIComponent(release.tag_name)}`
  const viewRelease = viewing ? list.find((item) => item.id === viewing.id) || viewing : null

  const closeComposer = () => {
    setCreating(false)
    setEditing(null)
    setError('')
  }

  const openCreate = () => {
    if (!authenticated) {
      openLogin()
      return
    }
    setEditing(null)
    setTag('')
    setName('')
    setBody('')
    setDraft(false)
    setPrerelease(false)
    setCreating(true)
    setError('')
  }

  const openEdit = (release: Release) => {
    setEditing(release)
    setTag(release.tag_name)
    setName(release.name || '')
    setBody(release.body || '')
    setDraft(release.draft)
    setPrerelease(release.prerelease)
    setCreating(true)
    setError('')
  }

  const save = async () => {
    if (!tag.trim()) {
      setError(t('releases.needTag'))
      return
    }
    setBusy(true)
    setError('')
    const payload = {
      tag_name: tag.trim(),
      name: name.trim() || tag.trim(),
      body,
      draft,
      prerelease,
    }
    const res = editing
      ? await gh(`/repos/${owner}/${repo}/releases/${editing.id}`, { method: 'PATCH', body: payload })
      : await gh(`/repos/${owner}/${repo}/releases`, { method: 'POST', body: payload })
    setBusy(false)
    if (res.ok) {
      toast(t(editing ? 'releases.updated' : 'releases.created'), 'success')
      closeComposer()
      releases.reload()
      tags.reload()
    } else {
      setError(apiErrorMessage(res.data, t('app.requestFailed', { status: res.status })))
    }
  }

  const generateNotes = async () => {
    if (!tag.trim()) {
      setError(t('releases.needTag'))
      return
    }
    setNotesBusy(true)
    setError('')
    const res = await gh(`/repos/${owner}/${repo}/releases/generate-notes`, {
      method: 'POST',
      body: { tag_name: tag.trim(), name: name.trim() || undefined, prerelease },
    })
    setNotesBusy(false)
    if (res.ok && typeof res.data?.body === 'string') {
      setBody(res.data.body)
    } else {
      setError(apiErrorMessage(res.data, t('releases.generateFailed')))
    }
  }

  const uploadAsset = async (release: Release) => {
    const desktop = getDesktop()
    if (!desktop) {
      toast(t('releases.uploadFailed'), 'error')
      return
    }
    setUploadingId(release.id)
    const res = await desktop.releases.uploadAsset({ owner, repo, releaseId: release.id })
    setUploadingId(null)
    if (res.ok) {
      toast(t('releases.assetUploaded'), 'success')
      releases.reload()
    } else if (!res.canceled) {
      toast(res.error || t('releases.uploadFailed'), 'error')
    }
  }

  const removeAsset = async (asset: ReleaseAsset) => {
    if (!window.confirm(t('releases.assetDeleteConfirm'))) return
    const res = await gh(`/repos/${owner}/${repo}/releases/assets/${asset.id}`, { method: 'DELETE' })
    if (res.ok || res.status === 204) {
      toast(t('releases.assetDeleted'), 'success')
      releases.reload()
    } else {
      toast(apiErrorMessage(res.data, t('app.requestFailed', { status: res.status })), 'error')
    }
  }

  const startRename = (asset: ReleaseAsset) => {
    setRenaming(asset)
    setRenameValue(asset.name)
  }

  const renameAsset = async () => {
    if (!renaming || !renameValue.trim()) return
    setRenameBusy(true)
    const res = await gh(`/repos/${owner}/${repo}/releases/assets/${renaming.id}`, {
      method: 'PATCH',
      body: { name: renameValue.trim() },
    })
    setRenameBusy(false)
    if (res.ok) {
      toast(t('releases.assetRenamed'), 'success')
      setRenaming(null)
      releases.reload()
    } else {
      toast(apiErrorMessage(res.data, t('releases.renameFailed')), 'error')
    }
  }

  const publishDraft = async (release: Release) => {
    setPublishingId(release.id)
    const res = await gh(`/repos/${owner}/${repo}/releases/${release.id}`, {
      method: 'PATCH',
      body: { draft: false },
    })
    setPublishingId(null)
    if (res.ok) {
      toast(L('Release published', '草稿已发布'), 'success')
      closeComposer()
      releases.reload()
    } else {
      toast(apiErrorMessage(res.data, t('releases.updated')), 'error')
    }
  }

  const remove = async (release: Release) => {
    if (!window.confirm(t('releases.deleteConfirm'))) return
    const res = await gh(`/repos/${owner}/${repo}/releases/${release.id}`, { method: 'DELETE' })
    if (res.ok || res.status === 204) {
      toast(t('releases.deleted'), 'success')
      if (viewing?.id === release.id) setViewing(null)
      releases.reload()
    }
  }

  return (
    <div>
      <div className="card-head" style={{ padding: '12px 16px' }}>
        <div className="card-title">
          <Package size={15} />
          {t('releases.title')}
        </div>
        <button className="btn small primary" onClick={openCreate}>
          <Plus size={13} />
          {t('releases.new')}
        </button>
      </div>

      {releases.loading ? (
        <LoadingBlock />
      ) : releases.error ? (
        <div style={{ padding: 16 }}>
          <ErrorBlock message={releases.error} onRetry={releases.reload} />
        </div>
      ) : !releases.data?.length ? (
        <EmptyState icon={<Package size={20} />} title={t('releases.empty')} />
      ) : (
        releases.data.map((release) => {
          const previous = previousTagFor(release)
          return (
          <div className="release-card" key={release.id}>
            <div className="release-head">
              <div style={{ minWidth: 0 }}>
                <div className="row wrap" style={{ gap: 7 }}>
                  <span className="badge blue mono">{release.tag_name}</span>
                  {release.draft ? <Badge tone="gold">{t('releases.draftBadge')}</Badge> : null}
                  {release.prerelease ? <Badge tone="purple">{t('releases.preBadge')}</Badge> : null}
                  {release.id === latestId ? <Badge tone="green">{L('Latest', '最新')}</Badge> : null}
                </div>
                <div className="release-title">{release.name || release.tag_name}</div>
                <div className="item-meta">
                  <span>
                    {release.author?.login} · <TimeAgo iso={release.published_at || release.created_at} />
                  </span>
                  <span>{t('releases.assets', { n: release.assets.length })}</span>
                  <span>
                    <Download size={11} style={{ verticalAlign: '-1px', marginRight: 3 }} />
                    {release.assets
                      .reduce((total, asset) => total + asset.download_count, 0)
                      .toLocaleString()}
                  </span>
                </div>
              </div>
              <div className="action-row">
                <button className="icon-btn ghost" title={L('View details', '查看详情')} onClick={() => setViewing(release)}>
                  <Eye size={14} />
                </button>
                {previous ? (
                  <button
                    className="icon-btn ghost"
                    title={L(`Compare with ${previous}`, `与 ${previous} 对比`)}
                    onClick={() => void openExternal(compareUrl(release, previous))}
                  >
                    <GitCompare size={14} />
                  </button>
                ) : null}
                <button className="btn small ghost" onClick={() => void openExternal(release.html_url)}>
                  {t('app.openInBrowser')}
                </button>
                {authenticated ? (
                  <>
                    <button className="icon-btn ghost" title={t('releases.uploadAsset')} onClick={() => void uploadAsset(release)} disabled={uploadingId !== null}>
                      {uploadingId === release.id ? <span className="spinner" /> : <Upload size={14} />}
                    </button>
                    <button className="icon-btn ghost" title={t('releases.edit')} onClick={() => openEdit(release)}>
                      <Pencil size={14} />
                    </button>
                    <button className="icon-btn ghost" title={t('common.delete')} onClick={() => void remove(release)}>
                      <Trash2 size={14} />
                    </button>
                  </>
                ) : null}
              </div>
            </div>
            {release.body ? (
              <details className="release-body">
                <summary>{t('releases.body')}</summary>
                <div style={{ padding: '4px 16px 14px' }}>
                  <Markdown markdown={release.body} owner={owner} repo={repo} />
                </div>
              </details>
            ) : null}
            {release.assets.length ? (
              <div className="release-assets">
                {release.assets.map((asset) =>
                  renaming?.id === asset.id ? (
                    <span className="release-asset-group" key={asset.id}>
                      <input
                        className="input"
                        style={{ height: 26, width: 180, fontSize: 11.5 }}
                        value={renameValue}
                        autoFocus
                        onChange={(event) => setRenameValue(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') void renameAsset()
                          if (event.key === 'Escape') setRenaming(null)
                        }}
                      />
                      <button
                        className="icon-btn ghost tiny"
                        title={t('common.save')}
                        onClick={() => void renameAsset()}
                        disabled={renameBusy || !renameValue.trim()}
                      >
                        {renameBusy ? <span className="spinner" /> : <Check size={12} />}
                      </button>
                      <button
                        className="icon-btn ghost tiny"
                        title={t('app.cancel')}
                        onClick={() => setRenaming(null)}
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ) : (
                    <span className="release-asset-group" key={asset.id}>
                      <button
                        className="release-asset"
                        onClick={() => void openExternal(asset.browser_download_url)}
                        title={asset.name}
                      >
                        <Download size={12} />
                        <span className="truncate">{asset.name}</span>
                        <span className="muted">{asset.download_count}</span>
                      </button>
                      {authenticated ? (
                        <>
                          <button
                            className="icon-btn ghost tiny"
                            title={t('releases.renameAsset')}
                            onClick={() => startRename(asset)}
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            className="icon-btn ghost tiny"
                            title={t('common.delete')}
                            onClick={() => void removeAsset(asset)}
                          >
                            <Trash2 size={12} />
                          </button>
                        </>
                      ) : null}
                    </span>
                  ),
                )}
              </div>
            ) : null}
          </div>
          )
        })
      )}

      <Pagination
        page={page}
        onPage={setPage}
        hasNext={(releases.data?.length || 0) === 30}
        loading={releases.loading}
      />

      {!releases.loading && tags.data?.length ? (
        <div className="tag-strip">
          <Tag size={13} />
          {tags.data.slice(0, 12).map((item) => (
            <button
              key={item.name}
              className="badge mono"
              onClick={() => void openExternal(`https://github.com/${owner}/${repo}/releases/tag/${item.name}`)}
            >
              {item.name}
            </button>
          ))}
        </div>
      ) : null}

      {creating ? (
        <Modal
          title={t(editing ? 'releases.editTitle' : 'releases.newTitle')}
          onClose={closeComposer}
          footer={
            <>
              <button className="btn ghost" onClick={closeComposer}>
                {t('app.cancel')}
              </button>
              <button className="btn primary" onClick={() => void save()} disabled={busy}>
                {busy ? <span className="spinner" /> : <Package size={14} />}
                {t(editing ? 'common.save' : 'releases.publish')}
              </button>
            </>
          }
        >
          <div className="form-grid" style={{ marginBottom: 12 }}>
            <div className="field">
              <label className="field-label">{t('releases.tag')}</label>
              <input
                className="input mono"
                value={tag}
                onChange={(event) => setTag(event.target.value)}
                placeholder="v1.0.0"
                list="release-tags"
              />
              <datalist id="release-tags">
                {(tags.data || []).map((item) => (
                  <option key={item.name} value={item.name} />
                ))}
              </datalist>
            </div>
            <div className="field">
              <label className="field-label">{t('releases.name')}</label>
              <input className="input" value={name} onChange={(event) => setName(event.target.value)} />
            </div>
          </div>
          <div className="field" style={{ marginBottom: 12 }}>
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
              <label className="field-label" style={{ marginBottom: 0 }}>
                {t('releases.body')}
              </label>
              <button className="btn small ghost" onClick={() => void generateNotes()} disabled={notesBusy}>
                {notesBusy ? <span className="spinner" /> : <Wand2 size={12} />}
                {t(notesBusy ? 'releases.generating' : 'releases.generateNotes')}
              </button>
            </div>
            <textarea className="textarea" style={{ minHeight: 140 }} value={body} onChange={(event) => setBody(event.target.value)} />
          </div>
          <div className="row wrap" style={{ gap: 18 }}>
            <label className="row" style={{ gap: 8, fontSize: 12.5, cursor: 'pointer' }}>
              <input type="checkbox" checked={draft} onChange={(event) => setDraft(event.target.checked)} />
              {t('releases.draft')}
            </label>
            <label className="row" style={{ gap: 8, fontSize: 12.5, cursor: 'pointer' }}>
              <input type="checkbox" checked={prerelease} onChange={(event) => setPrerelease(event.target.checked)} />
              {t('releases.prerelease')}
            </label>
          </div>
          <div className="row wrap" style={{ gap: 12, marginTop: 12, alignItems: 'center' }}>
            <span className="muted" style={{ fontSize: 11.5, flex: 1, minWidth: 200 }}>
              {L(
                'GitHub marks the most recent published release that is neither a draft nor a pre-release as Latest.',
                'GitHub 会把最近一个非草稿、非预发布的已发布版本标记为 Latest。',
              )}
            </span>
            {editing?.draft ? (
              <button
                className="btn small ghost"
                onClick={() => void publishDraft(editing)}
                disabled={publishingId !== null || busy}
              >
                {publishingId === editing.id ? <span className="spinner" /> : <Upload size={12} />}
                {L('Publish draft now', '立即发布草稿')}
              </button>
            ) : null}
          </div>
          {error ? (
            <div style={{ marginTop: 12 }}>
              <ErrorBlock message={error} />
            </div>
          ) : null}
        </Modal>
      ) : null}

      {viewRelease ? (
        <Modal
          wide
          title={viewRelease.name || viewRelease.tag_name}
          onClose={() => setViewing(null)}
          subtitle={
            <span className="row wrap" style={{ gap: 7 }}>
              <span className="badge blue mono">{viewRelease.tag_name}</span>
              <span>{viewRelease.author?.login || '—'}</span>
              <span>·</span>
              <TimeAgo iso={viewRelease.published_at || viewRelease.created_at} />
            </span>
          }
          footer={
            <>
              {viewRelease.draft && authenticated ? (
                <button
                  className="btn small ghost"
                  onClick={() => void publishDraft(viewRelease)}
                  disabled={publishingId !== null}
                >
                  {publishingId === viewRelease.id ? <span className="spinner" /> : <Upload size={12} />}
                  {L('Publish draft now', '立即发布草稿')}
                </button>
              ) : null}
              {previousTagFor(viewRelease) ? (
                <button
                  className="btn small ghost"
                  onClick={() =>
                    void openExternal(compareUrl(viewRelease, previousTagFor(viewRelease) as string))
                  }
                >
                  <GitCompare size={12} />
                  {L('Compare', '版本对比')}
                </button>
              ) : null}
              <button className="btn small ghost" onClick={() => void openExternal(viewRelease.html_url)}>
                {t('app.openInBrowser')}
              </button>
              <button className="btn" onClick={() => setViewing(null)}>
                {t('app.close')}
              </button>
            </>
          }
        >
          <div className="row wrap" style={{ gap: 6, marginBottom: 14 }}>
            {viewRelease.draft ? <Badge tone="gold">{t('releases.draftBadge')}</Badge> : null}
            {viewRelease.prerelease ? <Badge tone="purple">{t('releases.preBadge')}</Badge> : null}
            {viewRelease.id === latestId ? <Badge tone="green">{L('Latest', '最新')}</Badge> : null}
          </div>
          {viewRelease.body ? (
            <Markdown markdown={viewRelease.body} owner={owner} repo={repo} />
          ) : (
            <div className="muted" style={{ fontSize: 12.5 }}>
              {L('No release notes', '暂无发布说明')}
            </div>
          )}
          <div style={{ marginTop: 18 }}>
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
              <span className="field-label" style={{ marginBottom: 0 }}>
                {t('releases.assets', { n: viewRelease.assets.length })}
              </span>
              {viewRelease.assets.length ? (
                <span className="muted" style={{ fontSize: 11.5 }}>
                  {viewRelease.assets
                    .reduce((total, asset) => total + asset.download_count, 0)
                    .toLocaleString()}{' '}
                  {L('downloads', '次下载')}
                </span>
              ) : null}
            </div>
            {viewRelease.assets.length ? (
              <div className="release-assets" style={{ padding: 0 }}>
                {viewRelease.assets.map((asset) => (
                  <button
                    key={asset.id}
                    className="release-asset"
                    onClick={() => void openExternal(asset.browser_download_url)}
                    title={asset.name}
                  >
                    <Download size={12} />
                    <span className="truncate">{asset.name}</span>
                    <span className="muted">{bytes(asset.size)}</span>
                    <span className="muted">
                      {asset.download_count.toLocaleString()} {L('downloads', '次下载')}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="muted" style={{ fontSize: 12 }}>
                {L('No assets', '无附件')}
              </div>
            )}
          </div>
        </Modal>
      ) : null}
    </div>
  )
}
