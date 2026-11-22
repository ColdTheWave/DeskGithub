import {
  CircleDot,
  GitCommitHorizontal,
  GitFork,
  GitPullRequest,
  MessageSquare,
  Package,
  Star,
  Tag,
} from 'lucide-react'
import { useApp } from '../../lib/store'
import { useGh } from '../../lib/hooks'
import { Avatar, EmptyState, ErrorBlock, LoadingBlock, TimeAgo } from '../../components/ui'
import { Pagination } from '../../components/Pagination'
import { useState } from 'react'

type GhEvent = {
  id: string
  type: string
  created_at: string
  actor: { login: string; avatar_url: string } | null
  payload: any
}

function refName(ref: string | undefined) {
  return (ref || '').replace('refs/heads/', '').replace('refs/tags/', '')
}

function eventIcon(type: string) {
  if (type === 'PushEvent') return <GitCommitHorizontal size={15} />
  if (type === 'IssuesEvent') return <CircleDot size={15} />
  if (type === 'PullRequestEvent' || type === 'PullRequestReviewEvent') return <GitPullRequest size={15} />
  if (type === 'WatchEvent') return <Star size={15} />
  if (type === 'ForkEvent') return <GitFork size={15} />
  if (type === 'ReleaseEvent') return <Package size={15} />
  if (type === 'CreateEvent' || type === 'DeleteEvent') return <Tag size={15} />
  if (type === 'IssueCommentEvent') return <MessageSquare size={15} />
  return <CircleDot size={15} />
}

export function EventsTab({ owner, repo }: { owner: string; repo: string }) {
  const { t, navigate } = useApp()
  const [page, setPage] = useState(1)
  const events = useGh<GhEvent[]>(`/repos/${owner}/${repo}/events?per_page=30&page=${page}`, [page])

  const describe = (event: GhEvent) => {
    const payload = event.payload || {}
    switch (event.type) {
      case 'PushEvent':
        return t('events.pushed', {
          n: payload.commits?.length || 0,
          ref: refName(payload.ref),
        })
      case 'IssuesEvent': {
        const number = payload.issue?.number
        const action = payload.action
        if (action === 'closed') return t('events.closedIssue', { n: number })
        if (action === 'reopened') return t('events.reopenedIssue', { n: number })
        return t('events.openedIssue', { n: number })
      }
      case 'PullRequestEvent': {
        const number = payload.pull_request?.number
        const action = payload.action
        if (payload.pull_request?.merged) return t('events.mergedPull', { n: number })
        if (action === 'closed') return t('events.closedPull', { n: number })
        return t('events.openedPull', { n: number })
      }
      case 'WatchEvent':
        return t('events.starred')
      case 'ForkEvent':
        return t('events.forked')
      case 'CreateEvent':
        return t('events.created', { ref: payload.ref || payload.ref_type || '' })
      case 'ReleaseEvent':
        return t('events.released', { tag: payload.release?.tag_name || '' })
      case 'IssueCommentEvent':
        return t('events.commented')
      case 'PullRequestReviewEvent':
        return t('events.reviewed')
      default:
        return t('events.other')
    }
  }

  const openEvent = (event: GhEvent) => {
    const payload = event.payload || {}
    const issueNumber = payload.issue?.number
    const pullNumber = payload.pull_request?.number
    const number = pullNumber || issueNumber
    if (typeof number === 'number') {
      const kind = pullNumber ? 'pull' : 'issue'
      navigate({ name: 'issue', owner, repo, number, kind })
      return
    }
    if (event.type === 'PushEvent') navigate({ name: 'repo', owner, repo })
  }

  if (events.loading) return <LoadingBlock />
  if (events.error) {
    return (
      <div style={{ padding: 16 }}>
        <ErrorBlock message={events.error} onRetry={events.reload} />
      </div>
    )
  }
  if (!events.data?.length) {
    return <EmptyState icon={<CircleDot size={20} />} title={t('events.empty')} />
  }

  return (
    <div>
      <div className="list">
        {events.data.map((event) => (
          <button className="list-item event-row" key={event.id} onClick={() => openEvent(event)}>
            <span className="event-icon">{eventIcon(event.type)}</span>
            {event.actor ? <Avatar user={event.actor} size={22} /> : null}
            <div className="item-main">
              <div className="item-title" style={{ fontWeight: 600 }}>
                <span style={{ fontWeight: 650 }}>{event.actor?.login}</span>{' '}
                <span className="event-summary">{describe(event)}</span>
              </div>
              <div className="item-meta">
                <span>
                  <TimeAgo iso={event.created_at} />
                </span>
              </div>
            </div>
          </button>
        ))}
      </div>
      <Pagination
        page={page}
        onPage={setPage}
        hasNext={(events.data?.length || 0) === 30}
        loading={events.loading}
      />
    </div>
  )
}
