import { ExternalLink, History } from 'lucide-react'
import { useApp } from '../lib/store'
import { useGh } from '../lib/hooks'
import { Avatar, ErrorBlock, LoadingBlock, Modal, TimeAgo } from './ui'
import { openExternal } from '../lib/desktop'

export function FileHistoryModal({
  owner,
  repo,
  branch,
  path,
  onClose,
}: {
  owner: string
  repo: string
  branch: string
  path: string
  onClose: () => void
}) {
  const { t, lang, navigate } = useApp()
  const L = (en: string, zh: string) => (lang === 'zh' ? zh : en)
  const encoded = path.split('/').map(encodeURIComponent).join('/')
  const commits = useGh<any[]>(
    `/repos/${owner}/${repo}/commits?path=${encoded}&sha=${encodeURIComponent(branch)}&per_page=50`,
  )

  return (
    <Modal
      wide
      title={L('File history', '文件历史')}
      subtitle={`${owner}/${repo} · ${path}`}
      icon={<History size={16} />}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            {t('app.close')}
          </button>
          <button
            className="btn primary"
            onClick={() =>
              void openExternal(`https://github.com/${owner}/${repo}/commits/${branch}/${encoded}`)
            }
          >
            <ExternalLink size={13} />
            {t('app.openInBrowser')}
          </button>
        </>
      }
    >
      {commits.loading ? (
        <LoadingBlock />
      ) : commits.error ? (
        <ErrorBlock message={commits.error} onRetry={commits.reload} />
      ) : !commits.data?.length ? (
        <div className="readme-empty">{L('No commit history for this file.', '该文件没有提交历史。')}</div>
      ) : (
        <div className="list">
          {commits.data.map((commit: any) => (
            <button
              className="list-item"
              key={commit.sha}
              onClick={() => {
                onClose()
                navigate({ name: 'commit', owner, repo, sha: commit.sha })
              }}
            >
              {commit.author ? <Avatar user={commit.author} size={28} /> : null}
              <div className="item-main">
                <div className="item-title">
                  <span className="truncate">{String(commit.commit?.message || '').split('\n')[0]}</span>
                </div>
                <div className="item-meta">
                  <span className="mono">{commit.sha.slice(0, 7)}</span>
                  {commit.commit?.author?.name ? <span>{commit.commit.author.name}</span> : null}
                  {commit.commit?.author?.date ? (
                    <span>
                      <TimeAgo iso={commit.commit.author.date} />
                    </span>
                  ) : null}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </Modal>
  )
}
