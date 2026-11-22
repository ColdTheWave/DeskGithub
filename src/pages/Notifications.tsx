import { useEffect, useMemo, useState } from 'react'
import { Bell, BellOff, Bookmark, BookmarkCheck, CalendarDays, Check, CheckCheck, ExternalLink, Inbox, Lock, Send } from 'lucide-react'
import { useApp } from '../lib/store'
import { gh, apiErrorMessage } from '../lib/api'
import { useGh } from '../lib/hooks'
import { Avatar, Badge, EmptyState, ErrorBlock, LoadingBlock, LockGate, Modal, PageHeader, TimeAgo } from '../components/ui'
import { Pagination } from '../components/Pagination'
import { Markdown } from '../components/Markdown'
import type { GhNotification } from '../lib/types'
import { openExternal } from '../lib/desktop'

function githubUrl(item: GhNotification) {
  if (item.subject.url) return item.subject.url.replace('https://api.github.com/repos/', 'https://github.com/')
  return item.repository.html_url
}

function parseIssueSubject(item: GhNotification) {
  const url = item.subject?.url || ''
  const issue = url.match(/\/repos\/([^/]+)\/([^/]+)\/issues\/(\d+)$/)
  if (issue) return { owner: issue[1], repo: issue[2], number: Number(issue[3]) }
  const pull = url.match(/\/repos\/([^/]+)\/([^/]+)\/pulls\/(\d+)$/)
  if (pull) return { owner: pull[1], repo: pull[2], number: Number(pull[3]) }
  return null
}

type NotifView = 'inbox' | 'saved' | 'done'

function readSaved(): string[] {
  try {
    const raw = localStorage.getItem('dg.notifSaved')
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

export function NotificationsPage() {
  const { t, lang, authenticated, sessionVersion, toast } = useApp()
  const L = (en: string, zh: string) => (lang === 'zh' ? zh : en)
  const [busy, setBusy] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [view, setView] = useState<NotifView>('inbox')
  const [groupBy, setGroupBy] = useState<'repo' | 'date'>('repo')
  const [saved, setSaved] = useState<string[]>(readSaved)
  const [thread, setThread] = useState<GhNotification | null>(null)
  const [threadIssue, setThreadIssue] = useState<any>(null)
  const [threadComments, setThreadComments] = useState<any[]>([])
  const [threadLoading, setThreadLoading] = useState(false)
  const [threadText, setThreadText] = useState('')
  const [threadBusy, setThreadBusy] = useState(false)

  const notifications = useGh<GhNotification[]>(
    authenticated
      ? view === 'inbox'
        ? `/notifications?all=false&per_page=30&page=${page}`
        : view === 'done'
          ? `/notifications?all=true&per_page=30&page=${page}`
          : '/notifications?all=true&per_page=100'
      : null,
    [sessionVersion, page, view],
  )

  const visible = useMemo(() => {
    const items = notifications.data || []
    if (view === 'done') return items.filter((item) => !item.unread)
    if (view === 'saved') return items.filter((item) => saved.includes(item.id))
    return items
  }, [notifications.data, view, saved])

  const groups = useMemo(() => {
    const map = new Map<string, { key: string; repo: GhNotification['repository'] | null; title: string; items: GhNotification[] }>()
    const today = new Date().toDateString()
    const yesterday = new Date(Date.now() - 86400000).toDateString()
    visible.forEach((item) => {
      const key = groupBy === 'repo' ? item.repository.full_name : new Date(item.updated_at).toDateString()
      if (!map.has(key)) {
        const date = new Date(item.updated_at)
        map.set(key, {
          key,
          repo: groupBy === 'repo' ? item.repository : null,
          title:
            groupBy === 'date'
              ? key === today
                ? L('Today', '今天')
                : key === yesterday
                  ? L('Yesterday', '昨天')
                  : date.toLocaleDateString()
              : item.repository.full_name,
          items: [],
        })
      }
      map.get(key)!.items.push(item)
    })
    return Array.from(map.values()).sort((a, b) => {
      const aTime = Math.max(...a.items.map((item) => new Date(item.updated_at).getTime()))
      const bTime = Math.max(...b.items.map((item) => new Date(item.updated_at).getTime()))
      return bTime - aTime
    })
  }, [visible, groupBy, lang])

  const unread = (notifications.data || []).filter((item) => item.unread).length
  const threadParsed = thread ? parseIssueSubject(thread) : null

  useEffect(() => {
    if (!thread) return
    const parsed = parseIssueSubject(thread)
    if (!parsed) return
    let alive = true
    setThreadLoading(true)
    Promise.all([
      gh<any>(`/repos/${parsed.owner}/${parsed.repo}/issues/${parsed.number}`),
      gh<any[]>(`/repos/${parsed.owner}/${parsed.repo}/issues/${parsed.number}/comments?per_page=100`),
    ]).then(([issueRes, commentsRes]) => {
      if (!alive) return
      setThreadIssue(issueRes.ok ? issueRes.data : null)
      setThreadComments(Array.isArray(commentsRes.data) ? commentsRes.data : [])
      setThreadLoading(false)
    })
    return () => {
      alive = false
    }
  }, [thread])

  const openThread = (item: GhNotification) => {
    setThread(item)
    setThreadText('')
    setThreadIssue(null)
    setThreadComments([])
    if (item.unread) {
      void gh(`/notifications/threads/${item.id}`, { method: 'PATCH' }).then(() => notifications.reload())
    }
  }

  const postThreadComment = async () => {
    if (!thread || !threadText.trim()) return
    const parsed = parseIssueSubject(thread)
    if (!parsed) return
    setThreadBusy(true)
    const res = await gh(`/repos/${parsed.owner}/${parsed.repo}/issues/${parsed.number}/comments`, {
      method: 'POST',
      body: { body: threadText.trim() },
    })
    if (res.ok) {
      setThreadText('')
      const list = await gh<any[]>(
        `/repos/${parsed.owner}/${parsed.repo}/issues/${parsed.number}/comments?per_page=100`,
      )
      setThreadComments(Array.isArray(list.data) ? list.data : [])
    } else {
      toast(apiErrorMessage(res.data, t('app.requestFailed', { status: res.status })), 'error')
    }
    setThreadBusy(false)
  }

  const persistSaved = (next: string[]) => {
    setSaved(next)
    try {
      localStorage.setItem('dg.notifSaved', JSON.stringify(next))
    } catch {
      /* ignore */
    }
  }

  const markRead = async (item: GhNotification, open = false) => {
    setBusy(item.id)
    if (item.unread) {
      await gh(`/notifications/threads/${item.id}`, { method: 'PATCH' })
      notifications.reload()
      if (!open) toast(t('notifications.markedRead'), 'success')
    }
    setBusy(null)
    if (open) void openExternal(githubUrl(item))
  }

  const markDone = async (item: GhNotification) => {
    setBusy(item.id)
    await gh(`/notifications/threads/${item.id}`, { method: 'PATCH' })
    setBusy(null)
    toast(L('Marked as done', '已标记为完成'), 'success')
    notifications.reload()
  }

  const unsubscribe = async (item: GhNotification) => {
    setBusy(item.id)
    const res = await gh(`/notifications/threads/${item.id}/subscription`, { method: 'DELETE' })
    setBusy(null)
    if (res.ok || res.status === 204) {
      toast(L('Unsubscribed', '已取消订阅'), 'success')
      notifications.reload()
    }
  }

  const toggleSaved = (item: GhNotification) => {
    const exists = saved.includes(item.id)
    persistSaved(exists ? saved.filter((id) => id !== item.id) : [...saved, item.id])
    toast(exists ? L('Removed from saved', '已取消收藏') : L('Saved', '已收藏'), 'success')
  }

  const markAll = async () => {
    setBusy('all')
    const res = await gh('/notifications', { method: 'PUT' })
    setBusy(null)
    if (res.ok || res.status === 205) {
      toast(t('notifications.allRead'), 'success')
      notifications.reload()
    }
  }

  const reasonLabel = (reason: string) => {
    const key = `notifications.reason.${reason}`
    const value = t(key)
    return value === key ? t('notifications.reason.other') : value
  }

  const typeLabel = (type: string) => {
    switch (type) {
      case 'Issue':
        return t('notifications.issue')
      case 'PullRequest':
        return t('notifications.pullRequest')
      case 'Release':
        return t('notifications.release')
      case 'Discussion':
        return t('notifications.discussion')
      case 'Commit':
        return t('notifications.commit')
      case 'Repository':
        return t('notifications.repository')
      default:
        return type
    }
  }

  return (
    <div className="page">
      <PageHeader
        title={t('notifications.title')}
        subtitle={
          authenticated
            ? view === 'inbox'
              ? t('notifications.unreadCount', { n: unread })
              : view === 'saved'
                ? L(`${saved.length} saved threads`, `已收藏 ${saved.length} 条`)
                : L('Threads you have marked as done', '已标记完成的会话')
            : t('notifications.subtitle')
        }
        actions={
          authenticated ? (
            <>
              <div className="segmented">
                <button
                  className={view === 'inbox' ? 'active' : ''}
                  onClick={() => {
                    setView('inbox')
                    setPage(1)
                  }}
                >
                  {L('Inbox', '收件箱')}
                </button>
                <button
                  className={view === 'saved' ? 'active' : ''}
                  onClick={() => {
                    setView('saved')
                    setPage(1)
                  }}
                >
                  {L('Saved', '已收藏')}
                </button>
                <button
                  className={view === 'done' ? 'active' : ''}
                  onClick={() => {
                    setView('done')
                    setPage(1)
                  }}
                >
                  {L('Done', '已完成')}
                </button>
              </div>
              <div className="segmented">
                <button
                  className={groupBy === 'repo' ? 'active' : ''}
                  onClick={() => setGroupBy('repo')}
                >
                  {L('By repo', '按仓库')}
                </button>
                <button
                  className={groupBy === 'date' ? 'active' : ''}
                  onClick={() => setGroupBy('date')}
                >
                  {L('By date', '按日期')}
                </button>
              </div>
              <button className="btn" onClick={() => void markAll()} disabled={busy === 'all' || unread === 0}>
                <CheckCheck size={14} />
                {t('notifications.markAll')}
              </button>
            </>
          ) : null
        }
      />

      {!authenticated ? (
        <LockGate title={t('notifications.loginTitle')} text={t('notifications.loginText')} />
      ) : notifications.loading ? (
        <section className="card">
          <LoadingBlock />
        </section>
      ) : notifications.error ? (
        <section className="card card-body">
          <ErrorBlock message={notifications.error} onRetry={notifications.reload} />
        </section>
      ) : groups.length === 0 ? (
        <section className="card">
          <EmptyState
            icon={<Inbox size={20} />}
            title={
              view === 'inbox'
                ? t('notifications.empty')
                : view === 'saved'
                  ? L('No saved threads', '没有收藏的会话')
                  : L('No done threads', '没有已完成的会话')
            }
            text={view === 'inbox' ? t('notifications.emptyText') : undefined}
          />
        </section>
      ) : (
        <section className="card">
          {groups.map((group) => (
            <div className="notif-group" key={group.key}>
              <div className="notif-group-head">
                {group.repo ? <Bell size={13} /> : <CalendarDays size={13} />}
                <span>{group.title}</span>
                {group.repo?.private ? (
                  <Badge tone="gold">
                    <Lock size={10} />
                    {t('repos.private')}
                  </Badge>
                ) : null}
                <span className="spacer" />
                <span className="muted" style={{ fontWeight: 400 }}>
                  {group.items.length}
                </span>
              </div>

              {group.items.map((item) => {
                const isSaved = saved.includes(item.id)
                return (
                  <div className="notif-item" key={item.id}>
                    <span className={item.unread ? 'notif-unread' : 'notif-unread read'} />
                    <div className="notif-main">
                      <button
                        className={item.unread ? 'notif-title unread' : 'notif-title'}
                        onClick={() => openThread(item)}
                        style={{ border: 0, background: 'transparent', padding: 0, textAlign: 'left' }}
                      >
                        {item.subject.title}
                      </button>
                      <div className="notif-meta">
                        <Badge tone={item.unread ? 'blue' : 'default'}>{reasonLabel(item.reason)}</Badge>
                        <span>{typeLabel(item.subject.type)}</span>
                        {groupBy === 'date' ? <span>{item.repository.full_name}</span> : null}
                        <span>
                          <TimeAgo iso={item.updated_at} />
                        </span>
                      </div>
                    </div>
                    <div className="notif-actions">
                      <button
                        className="icon-btn ghost"
                        title={isSaved ? L('Remove from saved', '取消收藏') : L('Save', '收藏')}
                        onClick={() => toggleSaved(item)}
                      >
                        {isSaved ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
                      </button>
                      {item.unread ? (
                        <button
                          className="icon-btn ghost"
                          title={t('notifications.markRead')}
                          onClick={() => void markRead(item)}
                          disabled={busy === item.id}
                        >
                          <Check size={14} />
                        </button>
                      ) : null}
                      <button
                        className="icon-btn ghost"
                        title={L('Mark as done', '标记完成')}
                        onClick={() => void markDone(item)}
                        disabled={busy === item.id}
                      >
                        <Inbox size={14} />
                      </button>
                      <button
                        className="icon-btn ghost"
                        title={L('Unsubscribe', '取消订阅')}
                        onClick={() => void unsubscribe(item)}
                        disabled={busy === item.id}
                      >
                        <BellOff size={14} />
                      </button>
                      <button
                        className="icon-btn ghost"
                        title={t('app.openInBrowser')}
                        onClick={() => void openExternal(githubUrl(item))}
                      >
                        <ExternalLink size={14} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
          {view !== 'saved' ? (
            <Pagination
              page={page}
              onPage={setPage}
              hasNext={(notifications.data?.length || 0) === 30}
              loading={notifications.loading}
            />
          ) : null}
        </section>
      )}

      {thread ? (
        <Modal
          wide
          title={thread.subject.title}
          subtitle={`${thread.repository.full_name} · ${typeLabel(thread.subject.type)}`}
          onClose={() => setThread(null)}
          footer={
            <>
              <button className="btn ghost" onClick={() => setThread(null)}>
                {t('app.close')}
              </button>
              <button className="btn" onClick={() => void openExternal(githubUrl(thread))}>
                <ExternalLink size={14} />
                {t('app.openInBrowser')}
              </button>
              <button
                className="btn primary"
                onClick={() => {
                  void markDone(thread)
                  setThread(null)
                }}
              >
                <Check size={14} />
                {L('Mark as done', '标记完成')}
              </button>
            </>
          }
        >
          {threadLoading ? (
            <LoadingBlock />
          ) : threadParsed ? (
            threadIssue ? (
              <>
                <div className="thread-head">
                  {threadIssue.user ? <Avatar user={threadIssue.user} size={22} /> : null}
                  <strong style={{ color: 'var(--text)' }}>{threadIssue.user?.login}</strong>
                  <Badge tone={threadIssue.state === 'open' ? 'green' : 'purple'}>
                    {threadIssue.state === 'open' ? t('issues.stateOpen') : t('issues.stateClosed')}
                  </Badge>
                  <span>#{threadIssue.number}</span>
                  <span>
                    <TimeAgo iso={threadIssue.created_at} />
                  </span>
                </div>
                {threadIssue.body ? (
                  <Markdown
                    markdown={threadIssue.body}
                    owner={threadParsed.owner}
                    repo={threadParsed.repo}
                  />
                ) : (
                  <p className="muted">{t('issues.noDescription')}</p>
                )}

                <div className="section-title" style={{ marginTop: 16 }}>
                  {t('issues.conversation')} · {threadComments.length}
                </div>
                {threadComments.map((comment) => (
                  <section className="card comment" key={comment.id} style={{ marginTop: 0 }}>
                    <div className="comment-head">
                      {comment.user ? <Avatar user={comment.user} size={20} /> : null}
                      <strong>{comment.user?.login}</strong>
                      <span>
                        <TimeAgo iso={comment.created_at} />
                      </span>
                    </div>
                    <div className="comment-body">
                      <Markdown
                        markdown={comment.body || ''}
                        owner={threadParsed.owner}
                        repo={threadParsed.repo}
                      />
                    </div>
                  </section>
                ))}

                <section className="card card-body" style={{ marginTop: 12 }}>
                  <textarea
                    className="textarea"
                    value={threadText}
                    onChange={(event) => setThreadText(event.target.value)}
                    placeholder={t('issues.commentPlaceholder')}
                  />
                  <div className="action-row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
                    <button
                      className="btn primary"
                      onClick={() => void postThreadComment()}
                      disabled={threadBusy || !threadText.trim()}
                    >
                      {threadBusy ? <span className="spinner" /> : <Send size={14} />}
                      {t('issues.commentAction')}
                    </button>
                  </div>
                </section>
              </>
            ) : (
              <div className="readme-empty">{t('app.error')}</div>
            )
          ) : (
            <div className="note">
              <Inbox size={14} />
              <span style={{ flex: 1 }}>{L('Open this thread on GitHub to view its full content.', '在 GitHub 上打开此会话来查看完整内容。')}</span>
              <button className="btn small" onClick={() => void openExternal(githubUrl(thread))}>
                {t('app.openInBrowser')}
              </button>
            </div>
          )}
        </Modal>
      ) : null}
    </div>
  )
}
