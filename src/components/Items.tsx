import { CheckCircle2, CircleDot, GitPullRequest, MessageSquare } from 'lucide-react'
import type { GhIssue, GhPull } from '../lib/types'
import { useApp } from '../lib/store'
import { Avatar, TimeAgo } from './ui'

type Item = GhIssue | GhPull

function labelStyle(color: string) {
  const hex = (color || '8b949e').replace('#', '')
  const r = parseInt(hex.slice(0, 2), 16) || 0
  const g = parseInt(hex.slice(2, 4), 16) || 0
  const b = parseInt(hex.slice(4, 6), 16) || 0
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return {
    background: `#${hex}`,
    color: luminance > 0.6 ? '#0b0f16' : '#ffffff',
    borderColor: `#${hex}`,
  }
}

export function IssueRow({
  item,
  isPull,
  onClick,
  repoName,
}: {
  item: Item
  isPull?: boolean
  onClick?: () => void
  repoName?: string
}) {
  const { t } = useApp()
  const merged = isPull && 'merged_at' in item && Boolean(item.merged_at)
  const draft = isPull && 'draft' in item && item.draft
  const stateClass = merged ? 'merged' : item.state === 'open' ? 'open' : 'closed'
  const Icon = isPull ? GitPullRequest : merged || item.state === 'closed' ? CheckCircle2 : CircleDot
  const comments = 'comments' in item ? item.comments || 0 : 0

  const body = (
    <>
      <span className={`state-icon ${stateClass}`}>
        <Icon size={17} />
      </span>
      <div className="issue-main">
        <div className="issue-title">
          {repoName ? <span className="badge">{repoName}</span> : null}
          <span>{item.title}</span>
          <span className="num">#{item.number}</span>
          {merged ? <span className="badge purple">{t('pulls.merged')}</span> : null}
          {draft ? <span className="badge">{t('pulls.draft')}</span> : null}
        </div>
        <div className="issue-meta">
          {item.user ? (
            <span className="row" style={{ gap: 5 }}>
              <Avatar user={item.user} size={16} />
              {item.user.login}
            </span>
          ) : null}
          <span>{t('repos.updated')} <TimeAgo iso={item.updated_at} /></span>
          {item.labels?.length ? (
            <span className="chip-row">
              {item.labels.slice(0, 4).map((label) => (
                <span className="label-chip" key={label.name} style={labelStyle(label.color)}>
                  {label.name}
                </span>
              ))}
            </span>
          ) : null}
        </div>
      </div>
      {comments > 0 ? (
        <span className="issue-comments">
          <MessageSquare size={13} />
          {comments}
        </span>
      ) : null}
    </>
  )

  if (onClick) {
    return (
      <button className="issue-row" onClick={onClick}>
        {body}
      </button>
    )
  }
  return <div className="issue-row">{body}</div>
}
