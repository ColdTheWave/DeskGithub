import { useState } from 'react'
import { CircleDot, GitPullRequest, RefreshCw } from 'lucide-react'
import { useApp } from '../lib/store'
import { useGh } from '../lib/hooks'
import { EmptyState, ErrorBlock, LoadingBlock, LockGate, PageHeader } from '../components/ui'
import { IssueRow } from '../components/Items'
import { Pagination } from '../components/Pagination'
import type { GhIssue, GhSearchResult } from '../lib/types'

type SearchIssue = GhIssue & { repository_url: string }

function splitRepo(repoUrl: string | undefined) {
  if (!repoUrl) return { owner: '', repo: '', name: '' }
  const full = repoUrl.replace('https://api.github.com/repos/', '')
  const [owner, repo] = full.split('/')
  return { owner, repo, name: full }
}

function WorkList({ kind }: { kind: 'issue' | 'pull' }) {
  const { t, authenticated, navigate, sessionVersion } = useApp()
  const [scope, setScope] = useState<'mine' | 'created'>('mine')
  const [state, setState] = useState<'open' | 'closed'>('open')
  const [page, setPage] = useState(1)

  const isPull = kind === 'pull'
  const base = isPull ? 'is:pr' : 'is:issue'
  const scopeQuery = isPull
    ? scope === 'mine'
      ? 'involves:@me'
      : 'author:@me'
    : scope === 'mine'
      ? 'assignee:@me'
      : 'author:@me'
  const q = encodeURIComponent(`${base} is:${state} ${scopeQuery}`)

  const perPage = 30
  const results = useGh<GhSearchResult<SearchIssue>>(
    authenticated ? `/search/issues?q=${q}&sort=updated&order=desc&per_page=${perPage}&page=${page}` : null,
    [scope, state, kind, sessionVersion, page],
  )
  const totalPages = results.data ? Math.max(1, Math.ceil(results.data.total_count / perPage)) : undefined

  const title = isPull ? t('pulls.title') : t('issues.title')
  const subtitle = isPull ? t('pulls.subtitle') : t('issues.subtitle')

  if (!authenticated) {
    return (
      <div className="page">
        <PageHeader title={title} subtitle={subtitle} />
        <LockGate title={isPull ? t('issues.loginTitle') : t('issues.loginTitle')} text={t('issues.loginText')} />
      </div>
    )
  }

  return (
    <div className="page">
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          <button className="btn" onClick={results.reload} disabled={results.loading}>
            <RefreshCw size={14} />
            {t('app.refresh')}
          </button>
        }
      />

      <section className="card">
        <div className="card-head" style={{ alignItems: 'center' }}>
          <div className="segmented">
            <button
              className={scope === 'mine' ? 'active' : ''}
              onClick={() => {
                setScope('mine')
                setPage(1)
              }}
            >
              {isPull ? t('pulls.involved') : t('issues.assigned')}
            </button>
            <button
              className={scope === 'created' ? 'active' : ''}
              onClick={() => {
                setScope('created')
                setPage(1)
              }}
            >
              {isPull ? t('pulls.created') : t('issues.created')}
            </button>
          </div>
          <div className="segmented">
            <button
              className={state === 'open' ? 'active' : ''}
              onClick={() => {
                setState('open')
                setPage(1)
              }}
            >
              {t('issues.open')}
            </button>
            <button
              className={state === 'closed' ? 'active' : ''}
              onClick={() => {
                setState('closed')
                setPage(1)
              }}
            >
              {t('issues.closed')}
            </button>
          </div>
        </div>

        {results.loading ? (
          <LoadingBlock />
        ) : results.error ? (
          <div style={{ padding: 16 }}>
            <ErrorBlock message={results.error} onRetry={results.reload} />
          </div>
        ) : !results.data?.items?.length ? (
          <EmptyState
            icon={isPull ? <GitPullRequest size={20} /> : <CircleDot size={20} />}
            title={isPull ? t('pulls.noPulls') : t('issues.noIssues')}
          />
        ) : (
          results.data.items.map((item) => {
            const { owner, repo, name } = splitRepo(item.repository_url)
            return (
              <IssueRow
                key={`${name}-${item.id}`}
                item={item}
                isPull={isPull}
                repoName={name}
                onClick={() => navigate({ name: 'issue', owner, repo, number: item.number, kind })}
              />
            )
          })
        )}
        <Pagination page={page} onPage={setPage} totalPages={totalPages} loading={results.loading} />
      </section>
    </div>
  )
}

export function IssuesPage() {
  return <WorkList kind="issue" />
}

export function PullsPage() {
  return <WorkList kind="pull" />
}
