import { ExternalLink } from 'lucide-react'
import { useApp } from '../lib/store'
import { useGh } from '../lib/hooks'
import { Avatar, EmptyState, ErrorBlock, LoadingBlock, Modal, RepoRow } from './ui'

type Mode = 'stargazers' | 'watchers' | 'forks'

export function PeopleModal({
  owner,
  repo,
  mode,
  onClose,
}: {
  owner: string
  repo: string
  mode: Mode
  onClose: () => void
}) {
  const { t, lang, navigate } = useApp()
  const L = (en: string, zh: string) => (lang === 'zh' ? zh : en)
  const path =
    mode === 'stargazers'
      ? `/repos/${owner}/${repo}/stargazers?per_page=100`
      : mode === 'watchers'
        ? `/repos/${owner}/${repo}/subscribers?per_page=100`
        : `/repos/${owner}/${repo}/forks?per_page=100&sort=newest`
  const query = useGh<any[]>(path)

  const title =
    mode === 'stargazers'
      ? L('Stargazers', '星标用户')
      : mode === 'watchers'
        ? L('Watchers', '关注者')
        : L('Forks', '复刻')

  return (
    <Modal title={title} subtitle={`${owner}/${repo}`} onClose={onClose} wide>
      {query.loading ? (
        <LoadingBlock />
      ) : query.error ? (
        <ErrorBlock message={query.error} onRetry={query.reload} />
      ) : !query.data?.length ? (
        <EmptyState title={L('Nobody here yet', '这里还没有人')} />
      ) : mode === 'forks' ? (
        <div className="list">
          {query.data.map((fork: any) => (
            <RepoRow
              key={fork.id}
              repo={fork}
              onClick={() => {
                onClose()
                navigate({ name: 'repo', owner: fork.owner.login, repo: fork.name })
              }}
            />
          ))}
        </div>
      ) : (
        <div className="list">
          {query.data.map((person: any) => (
            <div className="list-item" key={person.id}>
              <Avatar user={person} size={34} />
              <div className="item-main">
                <div className="item-title">{person.login}</div>
                {person.type ? <div className="item-desc">{person.type}</div> : null}
              </div>
              <button
                className="btn small"
                onClick={() => {
                  onClose()
                  navigate({ name: 'user', login: person.login })
                }}
              >
                <ExternalLink size={13} />
                {t('search.viewProfile')}
              </button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}
