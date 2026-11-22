import { useApp } from '../lib/store'
import { useGh } from '../lib/hooks'
import { Avatar, ErrorBlock, LoadingBlock, Modal } from './ui'
import { languageColor } from '../lib/format'

type Contributor = {
  id: number
  login: string
  avatar_url: string
  contributions: number
  html_url: string
}

export function ContributorsModal({
  owner,
  repo,
  onClose,
}: {
  owner: string
  repo: string
  onClose: () => void
}) {
  const { t, navigate } = useApp()
  const contributors = useGh<Contributor[]>(`/repos/${owner}/${repo}/contributors?per_page=50`)
  const languages = useGh<Record<string, number>>(`/repos/${owner}/${repo}/languages`)
  const participation = useGh<{ all: number[] }>(`/repos/${owner}/${repo}/stats/participation`)

  const langEntries = Object.entries(languages.data || {}).sort((a, b) => b[1] - a[1])
  const total = langEntries.reduce((sum, [, bytes]) => sum + bytes, 0) || 1
  const weeks = participation.data?.all || []
  const peak = Math.max(1, ...weeks)
  const totalCommits = weeks.reduce((sum, count) => sum + count, 0)

  return (
    <Modal wide title={t('contributors.title')} subtitle={`${owner}/${repo}`} onClose={onClose}>
      <div className="side-label" style={{ marginBottom: 8 }}>
        {t('contributors.languages')}
      </div>
      {languages.loading ? (
        <LoadingBlock />
      ) : languages.error ? (
        <ErrorBlock message={languages.error} onRetry={languages.reload} />
      ) : !langEntries.length ? (
        <div className="readme-empty">{t('contributors.noLanguages')}</div>
      ) : (
        <>
          <div className="language-bar">
            {langEntries.slice(0, 8).map(([name, bytes]) => (
              <span
                className="language-seg"
                key={name}
                style={{ width: `${(bytes / total) * 100}%`, background: languageColor(name) }}
                title={`${name} ${((bytes / total) * 100).toFixed(1)}%`}
              />
            ))}
          </div>
          <div className="language-legend">
            {langEntries.slice(0, 8).map(([name, bytes]) => (
              <span key={name}>
                <i className="dot" style={{ background: languageColor(name) }} />
                {name} {((bytes / total) * 100).toFixed(1)}%
              </span>
            ))}
          </div>
        </>
      )}

      <div className="side-label" style={{ margin: '18px 0 8px' }}>
        {t('contributors.activity')}
      </div>
      {participation.loading ? (
        <LoadingBlock />
      ) : participation.error ? (
        <ErrorBlock message={participation.error} onRetry={participation.reload} />
      ) : !weeks.length ? (
        <div className="readme-empty">{t('contributors.noActivity')}</div>
      ) : (
        <>
          <div className="activity-bars">
            {weeks.map((count, index) => (
              <span
                className="activity-bar"
                key={index}
                style={{ height: `${Math.max(2, (count / peak) * 100)}%` }}
                title={`${count}`}
              />
            ))}
          </div>
          <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
            {t('contributors.activityTotal', { n: totalCommits })}
          </div>
        </>
      )}

      <div className="side-label" style={{ margin: '18px 0 8px' }}>
        {t('contributors.title')}
      </div>
      {contributors.loading ? (
        <LoadingBlock />
      ) : contributors.error ? (
        <ErrorBlock message={contributors.error} onRetry={contributors.reload} />
      ) : !contributors.data?.length ? (
        <div className="readme-empty">{t('contributors.empty')}</div>
      ) : (
        <div className="list" style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          {contributors.data.map((contributor) => (
            <button
              className="list-item"
              key={contributor.id}
              onClick={() => {
                onClose()
                navigate({ name: 'user', login: contributor.login })
              }}
            >
              <Avatar user={contributor} size={26} />
              <div className="item-main">
                <div className="item-title">{contributor.login}</div>
              </div>
              <span className="muted" style={{ fontSize: 11.5 }}>
                {t('contributors.commits', { n: contributor.contributions })}
              </span>
            </button>
          ))}
        </div>
      )}
    </Modal>
  )
}
