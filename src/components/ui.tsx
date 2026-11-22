import React from 'react'
import { AlertCircle, Inbox, Lock, X } from 'lucide-react'
import { useApp } from '../lib/store'
import { formatDate, initials, timeAgo } from '../lib/format'
import type { GhRepo } from '../lib/types'

export function Spinner({ large }: { large?: boolean }) {
  return <span className={large ? 'spinner lg' : 'spinner'} />
}

export function Avatar({
  user,
  url,
  size = 28,
  square,
  name,
}: {
  user?: { avatar_url?: string; login?: string } | null
  url?: string
  size?: number
  square?: boolean
  name?: string
}) {
  const src = url || user?.avatar_url || ''
  const label = name || user?.login || '?'
  if (!src) {
    return (
      <span
        className={square ? 'avatar square' : 'avatar'}
        style={{
          width: size,
          height: size,
          display: 'grid',
          placeItems: 'center',
          fontSize: Math.max(9, size * 0.34),
          fontWeight: 700,
          color: 'var(--muted)',
        }}
      >
        {initials(label)}
      </span>
    )
  }
  return (
    <img
      className={square ? 'avatar square' : 'avatar'}
      src={src}
      alt={label}
      width={size}
      height={size}
      style={{ width: size, height: size }}
      loading="lazy"
    />
  )
}

export function Badge({
  children,
  tone = 'default',
}: {
  children: React.ReactNode
  tone?: 'default' | 'green' | 'purple' | 'blue' | 'gold' | 'red'
}) {
  return <span className={tone === 'default' ? 'badge' : `badge ${tone}`}>{children}</span>
}

export function TimeAgo({ iso }: { iso: string | null | undefined }) {
  const { lang } = useApp()
  if (!iso) return <span className="muted">—</span>
  return <span title={formatDate(iso, lang)}>{timeAgo(iso, lang)}</span>
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: React.ReactNode
  subtitle?: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <div className="page-head">
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle ? <p className="page-sub">{subtitle}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </div>
  )
}

export function LoadingBlock({ label }: { label?: string }) {
  const { t } = useApp()
  return (
    <div className="loading-block">
      <Spinner />
      <span>{label || t('app.loading')}</span>
    </div>
  )
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useApp()
  return (
    <div className="error-block">
      <AlertCircle size={16} />
      <span style={{ flex: 1 }}>{message}</span>
      {onRetry ? (
        <button className="btn small ghost" onClick={onRetry}>
          {t('app.retry')}
        </button>
      ) : null}
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  text,
  action,
}: {
  icon?: React.ReactNode
  title: string
  text?: string
  action?: React.ReactNode
}) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon || <Inbox size={20} />}</div>
      <div className="empty-title">{title}</div>
      {text ? <div className="empty-text">{text}</div> : null}
      {action ? <div style={{ marginTop: 12 }}>{action}</div> : null}
    </div>
  )
}

export function LockGate({
  title,
  text,
  onSignIn,
}: {
  title: string
  text: string
  onSignIn?: () => void
}) {
  const { t, openLogin } = useApp()
  return (
    <div className="gate">
      <div className="gate-icon">
        <Lock size={21} />
      </div>
      <h3>{title}</h3>
      <p>{text}</p>
      <button className="btn primary" onClick={onSignIn || openLogin}>
        {t('app.unlock')}
      </button>
    </div>
  )
}

export function Modal({
  title,
  subtitle,
  onClose,
  children,
  footer,
  wide,
  icon,
}: {
  title: React.ReactNode
  subtitle?: React.ReactNode
  onClose: () => void
  children: React.ReactNode
  footer?: React.ReactNode
  wide?: boolean
  icon?: React.ReactNode
}) {
  const { t } = useApp()
  React.useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      className="overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className={wide ? 'modal wide' : 'modal'} role="dialog" aria-modal="true">
        <div className="modal-head">
          <div>
            <h2 className="modal-title">
              {icon}
              {title}
            </h2>
            {subtitle ? <p className="modal-sub">{subtitle}</p> : null}
          </div>
          <button className="icon-btn ghost" onClick={onClose} aria-label={t('app.close')}>
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>
  )
}

export function RepoRow({
  repo,
  onClick,
  right,
  rank,
}: {
  repo: GhRepo
  onClick?: () => void
  right?: React.ReactNode
  rank?: number
}) {
  const { t } = useApp()
  const body = (
    <>
      {rank ? <div className="rank">{rank}</div> : null}
      <div className="repo-avatar">
        <Avatar user={repo.owner} size={38} square />
      </div>
      <div className="item-main">
        <div className="item-title">
          <span className="mono truncate" style={{ color: 'var(--muted)' }}>
            {repo.owner.login}/
          </span>
          <span className="truncate">{repo.name}</span>
          {repo.private ? <Badge tone="gold">{t('repos.private')}</Badge> : null}
          {repo.archived ? <Badge>{t('repo.archived')}</Badge> : null}
        </div>
        {repo.description ? <div className="item-desc">{repo.description}</div> : null}
        <div className="item-meta">
          {repo.language ? (
            <span>
              <i className="dot" style={{ background: 'var(--accent)' }} />
              {repo.language}
            </span>
          ) : null}
          <span>★ {repo.stargazers_count.toLocaleString()}</span>
          <span>⑂ {repo.forks_count.toLocaleString()}</span>
          <span>
            {t('repos.updated')} <TimeAgo iso={repo.updated_at} />
          </span>
        </div>
      </div>
      {right ? <div className="item-stats">{right}</div> : null}
    </>
  )

  if (onClick) {
    return (
      <button className="list-item" onClick={onClick}>
        {body}
      </button>
    )
  }
  return <div className="list-item">{body}</div>
}
