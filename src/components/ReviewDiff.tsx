import { Fragment, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, MessageSquare, Plus, Search } from 'lucide-react'
import { useApp } from '../lib/store'
import { apiErrorMessage, gh, gql } from '../lib/api'
import { Avatar, TimeAgo } from './ui'
import { Markdown } from './Markdown'
import type { GhComment, GhFileDiff } from '../lib/types'

type Row = {
  kind: 'hunk' | 'add' | 'del' | 'ctx' | 'meta'
  oldNo: number | null
  newNo: number | null
  text: string
}

type Composing = { path: string; line: number; side: 'LEFT' | 'RIGHT'; key: string }

function parsePatch(patch: string): Row[] {
  const rows: Row[] = []
  let oldLine = 0
  let newLine = 0
  for (const line of patch.split('\n')) {
    const header = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
    if (header) {
      oldLine = Number(header[1])
      newLine = Number(header[2])
      rows.push({ kind: 'hunk', oldNo: null, newNo: null, text: line })
      continue
    }
    if (line.startsWith('\\')) {
      rows.push({ kind: 'meta', oldNo: null, newNo: null, text: line })
      continue
    }
    if (line.startsWith('+')) {
      rows.push({ kind: 'add', oldNo: null, newNo: newLine, text: line.slice(1) })
      newLine += 1
      continue
    }
    if (line.startsWith('-')) {
      rows.push({ kind: 'del', oldNo: oldLine, newNo: null, text: line.slice(1) })
      oldLine += 1
      continue
    }
    rows.push({ kind: 'ctx', oldNo: oldLine, newNo: newLine, text: line.slice(1) })
    oldLine += 1
    newLine += 1
  }
  return rows
}

function commentKey(comment: GhComment) {
  const side = comment.side || 'RIGHT'
  const line = comment.line ?? comment.original_line
  return `${side}:${line}`
}

export function ReviewDiff({
  owner,
  repo,
  prNumber,
  commitId,
  files,
  comments,
  threads,
  onChanged,
  onThreadsChanged,
}: {
  owner: string
  repo: string
  prNumber: number
  commitId: string
  files: GhFileDiff[]
  comments: GhComment[]
  threads?: Map<number, { id: string; isResolved: boolean }>
  onChanged: () => void
  onThreadsChanged?: () => void
}) {
  const { t, toast, authenticated, openLogin } = useApp()
  const [composing, setComposing] = useState<Composing | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [openFiles, setOpenFiles] = useState<Set<string>>(
    () => new Set(files.length ? [files[0].filename] : []),
  )
  const [viewedFiles, setViewedFiles] = useState<Set<string>>(new Set())
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [replyBusy, setReplyBusy] = useState(false)
  const [resolveBusy, setResolveBusy] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [groupByDir, setGroupByDir] = useState(false)
  const visibleFiles = filter.trim()
    ? files.filter((file) => file.filename.toLowerCase().includes(filter.trim().toLowerCase()))
    : files
  const dirOf = (name: string) => (name.includes('/') ? name.slice(0, name.lastIndexOf('/')) : '')
  const displayedFiles = groupByDir
    ? [...visibleFiles].sort(
        (a, b) => dirOf(a.filename).localeCompare(dirOf(b.filename)) || a.filename.localeCompare(b.filename),
      )
    : visibleFiles

  const toggleOpen = (name: string) => {
    setOpenFiles((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const toggleViewed = (name: string, viewed: boolean) => {
    setViewedFiles((prev) => {
      const next = new Set(prev)
      if (viewed) next.add(name)
      else next.delete(name)
      return next
    })
  }

  const grouped = useMemo(() => {
    const map = new Map<string, GhComment[]>()
    comments.forEach((comment) => {
      const key = `${comment.path || ''}|${commentKey(comment)}`
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(comment)
    })
    return map
  }, [comments])

  const submit = async () => {
    if (!composing || !text.trim()) return
    setBusy(true)
    const res = await gh(`/repos/${owner}/${repo}/pulls/${prNumber}/comments`, {
      method: 'POST',
      body: {
        body: text.trim(),
        commit_id: commitId,
        path: composing.path,
        line: composing.line,
        side: composing.side,
      },
    })
    setBusy(false)
    if (res.ok) {
      setText('')
      setComposing(null)
      onChanged()
      toast(t('pulls.commentAdded'), 'success')
    } else {
      toast(apiErrorMessage(res.data, t('app.requestFailed', { status: res.status })), 'error')
    }
  }

  const commentsFor = (path: string, key: string) => grouped.get(`${path}|${key}`) || []

  const submitReply = async (rootId: number) => {
    if (!replyText.trim()) return
    setReplyBusy(true)
    const res = await gh(`/repos/${owner}/${repo}/pulls/${prNumber}/comments`, {
      method: 'POST',
      body: { body: replyText.trim(), in_reply_to_id: rootId },
    })
    setReplyBusy(false)
    if (res.ok) {
      setReplyText('')
      setReplyTo(null)
      onChanged()
      toast(t('pulls.replied'), 'success')
    } else {
      toast(apiErrorMessage(res.data, t('app.requestFailed', { status: res.status })), 'error')
    }
  }

  const toggleResolve = async (threadId: string, resolved: boolean) => {
    setResolveBusy(threadId)
    const mutation = resolved
      ? 'mutation($threadId:ID!){ unresolveReviewThread(input:{threadId:$threadId}){ thread { isResolved } } }'
      : 'mutation($threadId:ID!){ resolveReviewThread(input:{threadId:$threadId}){ thread { isResolved } } }'
    const res = await gql(mutation, { threadId })
    setResolveBusy(null)
    if (res.ok) {
      toast(t(resolved ? 'pulls.unresolved' : 'pulls.resolved'), 'success')
      onThreadsChanged?.()
    } else {
      toast(res.error || t('pulls.threadUpdateFailed'), 'error')
    }
  }

  const threadGroups = (list: GhComment[]) => {
    const groups: { root: GhComment; items: GhComment[] }[] = []
    const ownerOf = new Map<number, { root: GhComment; items: GhComment[] }>()
    for (const comment of list) {
      if (!comment.in_reply_to_id) {
        const group = { root: comment, items: [comment] }
        groups.push(group)
        ownerOf.set(comment.id, group)
        continue
      }
      const parent = ownerOf.get(comment.in_reply_to_id)
      if (parent) {
        parent.items.push(comment)
        ownerOf.set(comment.id, parent)
      } else {
        const group = { root: comment, items: [comment] }
        groups.push(group)
        ownerOf.set(comment.id, group)
      }
    }
    return groups
  }

  return (
    <div>
      <div className="diff-toolbar">
        <div className="search-box">
          <Search size={14} />
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder={t('pulls.filterFiles')}
          />
        </div>
        <span className="muted" style={{ fontSize: 11 }}>
          {t('pulls.viewedCount', { viewed: viewedFiles.size, total: files.length })}
        </span>
        <button
          className={groupByDir ? 'btn small' : 'btn small ghost'}
          onClick={() => setGroupByDir((value) => !value)}
        >
          {t('pulls.groupByDir')}
        </button>
        {viewedFiles.size ? (
          <button className="btn small ghost" onClick={() => setViewedFiles(new Set())}>
            {t('pulls.resetViewed')}
          </button>
        ) : null}
      </div>
      {!visibleFiles.length ? (
        <div className="readme-empty">{t('pulls.noMatchingFiles')}</div>
      ) : null}
      {displayedFiles.map((file, fileIndex) => {
        const rows = parsePatch(file.patch || '')
        const outdated = comments.filter(
          (comment) => comment.path === file.filename && comment.line == null && comment.original_line == null,
        )
        const expanded = openFiles.has(file.filename) && !viewedFiles.has(file.filename)
        const dir = dirOf(file.filename)
        const showDir = groupByDir && (fileIndex === 0 || dirOf(displayedFiles[fileIndex - 1].filename) !== dir)
        return (
          <Fragment key={file.filename}>
            {showDir ? <div className="diff-group-label">{dir || '/'}</div> : null}
          <div className="diff-file" key={file.filename} id={`diff-file-${file.filename}`}>
            <div
              className="diff-file-head"
              role="button"
              tabIndex={0}
              onClick={() => toggleOpen(file.filename)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  toggleOpen(file.filename)
                }
              }}
            >
              {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              <span className="mono" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {file.filename}
              </span>
              <span className="diff-stat">
                <span className="plus">+{file.additions}</span>
                <span className="minus">-{file.deletions}</span>
              </span>
              <label className="viewed-toggle" onClick={(event) => event.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={viewedFiles.has(file.filename)}
                  onChange={(event) => toggleViewed(file.filename, event.target.checked)}
                />
                {t('pulls.viewed')}
              </label>
            </div>
            {expanded ? (
              <>
            {file.patch ? (
              <div className="review-lines">
                {rows.slice(0, 1200).map((row, rowIndex) => {
                  if (row.kind === 'hunk' || row.kind === 'meta') {
                    return (
                      <div className={`review-line ${row.kind}`} key={`${file.filename}-h-${rowIndex}`}>
                        <span className="review-code">{row.text}</span>
                      </div>
                    )
                  }
                  const side: 'LEFT' | 'RIGHT' = row.kind === 'del' ? 'LEFT' : 'RIGHT'
                  const line = row.kind === 'del' ? row.oldNo : row.newNo
                  if (line == null) return null
                  const key = `${side}:${line}`
                  const lineComments = commentsFor(file.filename, key)
                  return (
                    <div key={`${file.filename}-${rowIndex}`}>
                      <div className={`review-line ${row.kind}`}>
                        <span className="review-no">{row.oldNo ?? ''}</span>
                        <span className="review-no">{row.newNo ?? ''}</span>
                        <span className="review-code">{row.text || ' '}</span>
                        <button
                          className="line-add"
                          title={t('pulls.addLineComment')}
                          onClick={() => {
                            if (!authenticated) {
                              openLogin()
                              return
                            }
                            setComposing({ path: file.filename, line, side, key })
                            setText('')
                          }}
                        >
                          <Plus size={12} />
                        </button>
                      </div>
                      {threadGroups(lineComments).map((group) => {
                        const thread = threads?.get(group.root.id)
                        const threadKey = `${file.filename}|${key}|${group.root.id}`
                        return (
                          <div
                            className={thread?.isResolved ? 'review-thread resolved' : 'review-thread'}
                            key={group.root.id}
                          >
                            {group.items.map((comment, itemIndex) => (
                              <div className={itemIndex > 0 ? 'review-comment reply' : 'review-comment'} key={comment.id}>
                                <div className="row" style={{ gap: 6, marginBottom: 5 }}>
                                  {comment.user ? <Avatar user={comment.user} size={16} /> : null}
                                  <strong style={{ fontSize: 11.5 }}>{comment.user?.login}</strong>
                                  <span className="muted" style={{ fontSize: 10.5 }}>
                                    <TimeAgo iso={comment.created_at} />
                                  </span>
                                  {itemIndex === 0 && thread?.isResolved ? (
                                    <span className="badge purple">{t('pulls.resolvedBadge')}</span>
                                  ) : null}
                                </div>
                                <Markdown markdown={comment.body || ''} owner={owner} repo={repo} />
                              </div>
                            ))}
                            {thread && authenticated ? (
                              <div className="thread-actions">
                                <button
                                  className="btn small ghost"
                                  onClick={() => {
                                    setReplyTo(replyTo === threadKey ? null : threadKey)
                                    setReplyText('')
                                  }}
                                >
                                  {t('pulls.reply')}
                                </button>
                                <button
                                  className="btn small ghost"
                                  onClick={() => void toggleResolve(thread.id, thread.isResolved)}
                                  disabled={resolveBusy === thread.id}
                                >
                                  {resolveBusy === thread.id ? <span className="spinner" /> : null}
                                  {thread.isResolved ? t('pulls.unresolve') : t('pulls.resolve')}
                                </button>
                              </div>
                            ) : null}
                            {replyTo === threadKey ? (
                              <div className="review-composer">
                                <textarea
                                  className="textarea"
                                  style={{ minHeight: 60 }}
                                  value={replyText}
                                  onChange={(event) => setReplyText(event.target.value)}
                                  placeholder={t('pulls.replyPlaceholder')}
                                />
                                <div className="action-row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
                                  <button className="btn small ghost" onClick={() => setReplyTo(null)}>
                                    {t('app.cancel')}
                                  </button>
                                  <button
                                    className="btn small primary"
                                    disabled={replyBusy || !replyText.trim()}
                                    onClick={() => void submitReply(group.root.id)}
                                  >
                                    {replyBusy ? <span className="spinner" /> : null}
                                    {t('pulls.reply')}
                                  </button>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        )
                      })}
                      {composing &&
                      composing.path === file.filename &&
                      composing.key === key ? (
                        <div className="review-composer">
                          <div className="row" style={{ gap: 6, marginBottom: 6 }}>
                            <MessageSquare size={13} />
                            <span className="mono" style={{ fontSize: 11 }}>
                              {file.filename}:{line} ({side})
                            </span>
                          </div>
                          <textarea
                            className="textarea"
                            style={{ minHeight: 70 }}
                            value={text}
                            onChange={(event) => setText(event.target.value)}
                            placeholder={t('pulls.lineCommentPlaceholder')}
                          />
                          {text ? (
                            <div className="review-comment">
                              <Markdown markdown={text} owner={owner} repo={repo} />
                            </div>
                          ) : null}
                          <div className="action-row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
                            <button className="btn small ghost" onClick={() => setComposing(null)}>
                              {t('app.cancel')}
                            </button>
                            <button
                              className="btn small primary"
                              disabled={busy || !text.trim()}
                              onClick={() => void submit()}
                            >
                              {busy ? <span className="spinner" /> : null}
                              {t('pulls.addLineComment')}
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )
                })}
                {rows.length > 1200 ? <div className="readme-empty">{t('pulls.diffTooLarge')}</div> : null}
              </div>
            ) : (
              <div className="readme-empty" style={{ padding: 12 }}>
                {t('pulls.noPatch')}
              </div>
            )}
            {outdated.length ? (
              <div style={{ padding: '4px 12px 10px' }}>
                {outdated.map((comment) => (
                  <div className="review-comment" key={comment.id}>
                    <div className="row" style={{ gap: 6, marginBottom: 5 }}>
                      {comment.user ? <Avatar user={comment.user} size={16} /> : null}
                      <strong style={{ fontSize: 11.5 }}>{comment.user?.login}</strong>
                      <span className="muted" style={{ fontSize: 10.5 }}>
                        <TimeAgo iso={comment.created_at} />
                      </span>
                    </div>
                    <Markdown markdown={comment.body || ''} owner={owner} repo={repo} />
                  </div>
                ))}
              </div>
            ) : null}
              </>
            ) : null}
          </div>
          </Fragment>
        )
      })}
    </div>
  )
}
