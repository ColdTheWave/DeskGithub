import { useEffect, useState } from 'react'
import { GitCommitHorizontal } from 'lucide-react'
import { useApp } from '../../lib/store'
import { useGh } from '../../lib/hooks'
import { Avatar, EmptyState, ErrorBlock, LoadingBlock, TimeAgo } from '../../components/ui'
import { Pagination } from '../../components/Pagination'
import type { GhCommit } from '../../lib/types'

export function CommitsTab({
  owner,
  repo,
  branch,
  onOpen,
}: {
  owner: string
  repo: string
  branch: string
  onOpen: (sha: string) => void
}) {
  const { t } = useApp()
  const [page, setPage] = useState(1)
  useEffect(() => {
    setPage(1)
  }, [owner, repo, branch])
  const commits = useGh<GhCommit[]>(
    branch
      ? `/repos/${owner}/${repo}/commits?sha=${encodeURIComponent(branch)}&per_page=30&page=${page}`
      : null,
    [branch, page],
  )

  if (commits.loading) return <LoadingBlock />
  if (commits.error) {
    return (
      <div style={{ padding: 16 }}>
        <ErrorBlock message={commits.error} onRetry={commits.reload} />
      </div>
    )
  }
  if (!commits.data?.length) {
    return (
      <div>
        <EmptyState icon={<GitCommitHorizontal size={20} />} title={t('repo.noCommits')} />
        <Pagination page={page} onPage={setPage} hasNext={false} />
      </div>
    )
  }

  return (
    <div className="list">
      {commits.data.map((commit) => {
        const message = (commit.commit?.message || '').split('\n')[0]
        return (
          <button className="list-item" key={commit.sha} onClick={() => onOpen(commit.sha)}>
            <Avatar user={commit.author} size={30} />
            <div className="item-main">
              <div className="item-title">{message}</div>
              <div className="item-meta">
                <span>{commit.commit?.author?.name || commit.author?.login}</span>
                <span>
                  <TimeAgo iso={commit.commit?.author?.date} />
                </span>
              </div>
            </div>
            <span className="badge mono">{commit.sha.slice(0, 7)}</span>
          </button>
        )
      })}
      <Pagination
        page={page}
        onPage={setPage}
        hasNext={(commits.data?.length || 0) === 30}
        loading={commits.loading}
      />
    </div>
  )
}
