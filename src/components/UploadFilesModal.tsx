import { useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  CloudUpload,
  File as FileIcon,
  FilePlus2,
  FolderOpen,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { useApp } from '../lib/store'
import { apiErrorMessage, gh } from '../lib/api'
import { bytes } from '../lib/format'
import { Modal } from './ui'

const MAX_FILE_SIZE = 50 * 1024 * 1024

type UploadStatus = 'pending' | 'uploading' | 'done' | 'error'

type UploadItem = {
  id: string
  file: File
  path: string
  status: UploadStatus
  error?: string
}

type PickedFile = { file: File; path: string }

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || '')
      resolve(result.includes(',') ? result.split(',')[1] : result)
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function encodeRef(ref: string) {
  return ref.split('/').map(encodeURIComponent).join('/')
}

function fromFileList(list: FileList | null): PickedFile[] {
  return Array.from(list || []).map((file) => ({
    file,
    path: file.webkitRelativePath || file.name,
  }))
}

async function collectEntry(entry: any, prefix = ''): Promise<PickedFile[]> {
  if (!entry) return []
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => entry.file(resolve, reject))
    return [{ file, path: `${prefix}${file.name}` }]
  }
  if (entry.isDirectory) {
    const reader = entry.createReader()
    const out: PickedFile[] = []
    const dirPrefix = `${prefix}${entry.name}/`
    let batch: any[] = []
    do {
      batch = await new Promise<any[]>((resolve, reject) => reader.readEntries(resolve, reject))
      for (const child of batch) out.push(...(await collectEntry(child, dirPrefix)))
    } while (batch.length)
    return out
  }
  return []
}

export function UploadFilesModal({
  owner,
  repo,
  branch,
  dirPath,
  onClose,
  onUploaded,
}: {
  owner: string
  repo: string
  branch: string
  dirPath: string
  onClose: () => void
  onUploaded: () => void
}) {
  const { t, lang, toast } = useApp()
  const L = (en: string, zh: string) => (lang === 'zh' ? zh : en)
  const [items, setItems] = useState<UploadItem[]>([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const fileInput = useRef<HTMLInputElement>(null)
  const folderInput = useRef<HTMLInputElement>(null)
  const dragDepth = useRef(0)

  useEffect(() => {
    folderInput.current?.setAttribute('webkitdirectory', '')
    folderInput.current?.setAttribute('directory', '')
  }, [])

  const totalSize = useMemo(() => items.reduce((sum, item) => sum + item.file.size, 0), [items])
  const pendingCount = items.filter((item) => item.status === 'pending' || item.status === 'error').length
  const percent = progress.total ? Math.round((progress.done / progress.total) * 100) : 0

  const addFiles = (incoming: PickedFile[]) => {
    if (!incoming.length) return
    const accepted: PickedFile[] = []
    let oversized = 0
    for (const picked of incoming) {
      const path = picked.path.replace(/^\/+/, '').replace(/\/+$/, '')
      if (!path) continue
      if (path.split('/').some((segment) => segment === '.git')) continue
      if (picked.file.size > MAX_FILE_SIZE) {
        oversized += 1
        continue
      }
      accepted.push({ file: picked.file, path })
    }
    if (oversized) {
      toast(
        L(
          `${oversized} file${oversized === 1 ? '' : 's'} skipped (max ${MAX_FILE_SIZE / 1024 / 1024} MB each)`,
          `已跳过 ${oversized} 个超过 ${MAX_FILE_SIZE / 1024 / 1024} MB 的文件`,
        ),
        'error',
      )
    }
    if (!accepted.length) return
    setItems((prev) => {
      const next = [...prev]
      for (const picked of accepted) {
        const item: UploadItem = {
          id: `${picked.path}-${picked.file.size}-${picked.file.lastModified}`,
          file: picked.file,
          path: picked.path,
          status: 'pending',
        }
        const index = next.findIndex((existing) => existing.path === picked.path)
        if (index >= 0) next[index] = item
        else next.push(item)
      }
      return next
    })
  }

  const onDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    dragDepth.current = 0
    setDragging(false)
    if (busy) return
    const entries = Array.from(event.dataTransfer.items || [])
      .map((entry) => (entry.webkitGetAsEntry ? entry.webkitGetAsEntry() : null))
      .filter(Boolean)
    if (entries.length) {
      const collected: PickedFile[] = []
      for (const entry of entries) collected.push(...(await collectEntry(entry)))
      addFiles(collected)
      return
    }
    addFiles(Array.from(event.dataTransfer.files || []).map((file) => ({ file, path: file.name })))
  }

  const updateStatus = (id: string, status: UploadStatus, error?: string) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, status, error } : item)))
  }

  const upload = async () => {
    const valid = items.filter((item) => item.status === 'pending' || item.status === 'error')
    if (!valid.length) return
    setBusy(true)
    setProgress({ done: 0, total: valid.length })
    try {
      const refPath = encodeRef(branch)
      const head = await gh<{ object?: { sha?: string } }>(
        `/repos/${owner}/${repo}/git/ref/heads/${refPath}`,
      )
      if (!head.ok || !head.data?.object?.sha) {
        throw new Error(apiErrorMessage(head.data, t('app.requestFailed', { status: head.status })))
      }
      const headSha = head.data.object.sha
      const base = await gh<{ tree?: { sha?: string } }>(
        `/repos/${owner}/${repo}/git/commits/${headSha}`,
      )
      if (!base.ok || !base.data?.tree?.sha) {
        throw new Error(apiErrorMessage(base.data, t('app.requestFailed', { status: base.status })))
      }

      const tree: { path: string; mode: string; type: string; sha: string }[] = []
      let done = 0
      for (const item of valid) {
        updateStatus(item.id, 'uploading')
        const content = await fileToBase64(item.file)
        const blob = await gh<{ sha?: string }>(`/repos/${owner}/${repo}/git/blobs`, {
          method: 'POST',
          body: { content, encoding: 'base64' },
        })
        if (!blob.ok || !blob.data?.sha) {
          const text = apiErrorMessage(blob.data, t('app.requestFailed', { status: blob.status }))
          updateStatus(item.id, 'error', text)
          throw new Error(text)
        }
        tree.push({
          path: `${dirPath ? dirPath + '/' : ''}${item.path}`,
          mode: '100644',
          type: 'blob',
          sha: blob.data.sha,
        })
        updateStatus(item.id, 'done')
        done += 1
        setProgress({ done, total: valid.length })
      }

      const newTree = await gh<{ sha?: string }>(`/repos/${owner}/${repo}/git/trees`, {
        method: 'POST',
        body: { base_tree: base.data.tree.sha, tree },
      })
      if (!newTree.ok || !newTree.data?.sha) {
        throw new Error(apiErrorMessage(newTree.data, t('app.requestFailed', { status: newTree.status })))
      }

      const commitMessage =
        message.trim() ||
        (valid.length === 1
          ? L(`Upload ${valid[0].path}`, `上传 ${valid[0].path}`)
          : L(`Upload ${valid.length} files`, `上传 ${valid.length} 个文件`))
      const commit = await gh<{ sha?: string }>(`/repos/${owner}/${repo}/git/commits`, {
        method: 'POST',
        body: { message: commitMessage, tree: newTree.data.sha, parents: [headSha] },
      })
      if (!commit.ok || !commit.data?.sha) {
        throw new Error(apiErrorMessage(commit.data, t('app.requestFailed', { status: commit.status })))
      }

      const moved = await gh(`/repos/${owner}/${repo}/git/refs/heads/${refPath}`, {
        method: 'PATCH',
        body: { sha: commit.data.sha },
      })
      if (!moved.ok) {
        throw new Error(apiErrorMessage(moved.data, t('app.requestFailed', { status: moved.status })))
      }

      toast(
        valid.length === 1
          ? L('File uploaded', '文件已上传')
          : L(`${valid.length} files uploaded in one commit`, `${valid.length} 个文件已批量上传（单次提交）`),
        'success',
      )
      onUploaded()
      onClose()
    } catch (err) {
      setItems((prev) =>
        prev.map((item) =>
          item.status === 'done'
            ? { ...item, status: 'pending' }
            : item.status === 'uploading'
              ? { ...item, status: 'error', error: err instanceof Error ? err.message : undefined }
              : item,
        ),
      )
      toast(err instanceof Error ? err.message : t('app.error'), 'error')
    }
    setBusy(false)
  }

  const statusLabel = (status: UploadStatus) => {
    if (status === 'uploading') return L('Uploading', '上传中')
    if (status === 'done') return L('Uploaded', '已上传')
    if (status === 'error') return L('Failed', '失败')
    return L('Ready', '待上传')
  }

  return (
    <Modal
      wide
      title={L('Upload files', '批量上传文件')}
      subtitle={dirPath ? `${owner}/${repo}/${dirPath}` : `${owner}/${repo}`}
      icon={<Upload size={16} />}
      onClose={onClose}
      footer={
        <>
          <span className="muted upload-foot-hint">
            {items.length ? L(`${pendingCount} queued · ${bytes(totalSize)}`, `${pendingCount} 个待上传 · ${bytes(totalSize)}`) : null}
          </span>
          <button className="btn ghost" onClick={onClose} disabled={busy}>
            {t('app.cancel')}
          </button>
          <button className="btn primary" onClick={() => void upload()} disabled={busy || !pendingCount}>
            {busy ? <span className="spinner" /> : <Upload size={14} />}
            {busy
              ? L('Uploading…', '上传中…')
              : items.length
                ? L(`Commit ${pendingCount} file${pendingCount === 1 ? '' : 's'}`, `提交 ${pendingCount} 个文件`)
                : L('Commit changes', '提交变更')}
          </button>
        </>
      }
    >
      <input
        ref={fileInput}
        type="file"
        multiple
        className="upload-hidden"
        onChange={(event) => {
          addFiles(fromFileList(event.target.files))
          event.target.value = ''
        }}
      />
      <input
        ref={folderInput}
        type="file"
        multiple
        className="upload-hidden"
        onChange={(event) => {
          addFiles(fromFileList(event.target.files))
          event.target.value = ''
        }}
      />

      <div
        className={dragging ? 'upload-drop drag' : 'upload-drop'}
        role="button"
        tabIndex={0}
        onClick={() => !busy && fileInput.current?.click()}
        onKeyDown={(event) => {
          if ((event.key === 'Enter' || event.key === ' ') && !busy) fileInput.current?.click()
        }}
        onDragEnter={(event) => {
          event.preventDefault()
          dragDepth.current += 1
          if (!busy) setDragging(true)
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          event.preventDefault()
          dragDepth.current = Math.max(0, dragDepth.current - 1)
          if (dragDepth.current === 0) setDragging(false)
        }}
        onDrop={(event) => void onDrop(event)}
      >
        <div className="upload-drop-icon">
          <CloudUpload size={26} />
        </div>
        <div className="upload-drop-title">
          {dragging ? L('Drop to add files', '松开即可添加文件') : L('Drag files or folders here', '拖拽文件或文件夹到此处')}
        </div>
        <div className="upload-drop-hint">
          {L('Multiple files and nested folders are supported', '支持多文件与多级文件夹，上传将合并为一次提交')}
        </div>
        <div className="upload-drop-actions" onClick={(event) => event.stopPropagation()}>
          <button className="btn small" onClick={() => fileInput.current?.click()} disabled={busy}>
            <FilePlus2 size={13} />
            {L('Choose files', '选择文件')}
          </button>
          <button className="btn small" onClick={() => folderInput.current?.click()} disabled={busy}>
            <FolderOpen size={13} />
            {L('Choose folder', '选择文件夹')}
          </button>
        </div>
      </div>

      {items.length ? (
        <div className="upload-section">
          <div className="upload-list-head">
            <strong>{L('Files to upload', '待上传文件')}</strong>
            <span className="badge">{items.length}</span>
            <span className="spacer" />
            <span className="muted">{bytes(totalSize)}</span>
            <button
              className="btn small ghost"
              onClick={() => setItems([])}
              disabled={busy}
            >
              <Trash2 size={12} />
              {L('Clear', '清空')}
            </button>
          </div>
          <div className="upload-list">
            {items.map((item) => (
              <div className={`upload-row ${item.status}`} key={item.id}>
                <span className="upload-file-icon">
                  <FileIcon size={15} />
                </span>
                <div className="upload-file-main">
                  <div className="upload-file-name truncate" title={item.path}>
                    {item.path}
                  </div>
                  <div className="upload-file-meta">
                    {bytes(item.file.size)}
                    {item.error ? ` · ${item.error}` : ''}
                  </div>
                </div>
                <span className={`upload-status ${item.status}`}>
                  {item.status === 'uploading' ? (
                    <span className="spinner" />
                  ) : item.status === 'done' ? (
                    <CheckCircle2 size={13} />
                  ) : item.status === 'error' ? (
                    <AlertCircle size={13} />
                  ) : null}
                  {statusLabel(item.status)}
                </span>
                <button
                  className="icon-btn ghost upload-remove"
                  onClick={() => setItems((prev) => prev.filter((entry) => entry.id !== item.id))}
                  disabled={busy}
                  aria-label={L('Remove', '移除')}
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {busy ? (
        <div className="upload-progress">
          <div className="upload-progress-head">
            <span>
              {L('Uploading', '正在上传')} {progress.done}/{progress.total}
            </span>
            <span className="muted">{percent}%</span>
          </div>
          <div className="upload-progress-track">
            <div className="upload-progress-bar" style={{ width: `${percent}%` }} />
          </div>
        </div>
      ) : null}

      <div className="field" style={{ marginTop: items.length ? 16 : 14 }}>
        <label className="field-label">{L('Commit message', '提交信息')}</label>
        <input
          className="input"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder={
            items.length > 1
              ? L(`Upload ${items.length} files`, `上传 ${items.length} 个文件`)
              : L('Upload files', '上传文件')
          }
          disabled={busy}
        />
        <span className="field-hint">
          {L(
            'Leave empty to use a generated message. All files are committed together.',
            '留空将自动生成提交信息；所有文件将合并为一次提交。',
          )}
        </span>
      </div>
    </Modal>
  )
}
