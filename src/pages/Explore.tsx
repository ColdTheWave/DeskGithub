import { useEffect, useMemo, useState } from 'react'
import {
  Code2,
  FileCode2,
  GitCommitHorizontal,
  GitFork,
  GitPullRequest,
  Lock,
  MessagesSquare,
  Search,
  Star,
  Tag,
  UserRound,
} from 'lucide-react'
import { useApp } from '../lib/store'
import { useGh, useGql } from '../lib/hooks'
import {
  Avatar,
  Badge,
  EmptyState,
  ErrorBlock,
  LoadingBlock,
  PageHeader,
  RepoRow,
  TimeAgo,
} from '../components/ui'
import { IssueRow } from '../components/Items'
import { Pagination } from '../components/Pagination'
import type { GhIssue, GhRepo, GhSearchResult, GhUser } from '../lib/types'
import { compactNumber } from '../lib/format'
import { openExternal } from '../lib/desktop'
import { gh, apiErrorMessage } from '../lib/api'

type Tab = 'repos' | 'users' | 'issues' | 'prs' | 'code' | 'commits' | 'discussions' | 'topics'

type CodeItem = {
  name: string
  path: string
  html_url: string
  repository: { full_name: string; owner: { login: string }; name: string }
}

type CommitItem = {
  sha: string
  html_url: string
  commit: { message: string; author: { name: string; date: string } | null }
  author: GhUser | null
  repository: { full_name: string; owner: { login: string }; name: string }
}

type TopicItem = {
  name: string
  display_name: string
  short_description: string
  featured: boolean
  curated: boolean
}

const DISCUSSION_QUERY = `query ($q: String!, $first: Int!) {
  search(query: $q, type: DISCUSSION, first: $first) {
    discussionCount
    nodes {
      ... on Discussion {
        id
        title
        url
        createdAt
        upvoteCount
        category { name }
        comments { totalCount }
        repository { nameWithOwner }
      }
    }
  }
}`

type DiscussionItem = {
  id: string
  title: string
  url: string
  createdAt: string
  upvoteCount: number
  category: { name: string } | null
  comments: { totalCount: number }
  repository: { nameWithOwner: string }
}

export function ExplorePage({ query }: { query?: string }) {
  const { t, lang, authenticated, navigate, openLogin } = useApp()
  const L = (en: string, zh: string) => (lang === 'zh' ? zh : en)
  const [tab, setTab] = useState<Tab>('repos')
  const [input, setInput] = useState(query || '')
  const [term, setTerm] = useState((query || '').trim())
  const [page, setPage] = useState(1)
  const [commitResults, setCommitResults] = useState<{ total_count: number; items: CommitItem[] } | null>(null)
  const [commitLoading, setCommitLoading] = useState(false)
  const [commitError, setCommitError] = useState<string | null>(null)
  const [repoSort, setRepoSort] = useState('best')
  const [repoLanguage, setRepoLanguage] = useState('')
  const [issueStateFilter, setIssueStateFilter] = useState<'all' | 'open' | 'closed'>('all')
  const [issueSortFilter, setIssueSortFilter] = useState('best')
  const [issueLabel, setIssueLabel] = useState('')

  useEffect(() => {
    if (query !== undefined) {
      setInput(query)
      setTerm(query.trim())
    }
  }, [query])

  const since = useMemo(() => new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10), [])
  const encoded = encodeURIComponent(term)
  const repoQueryText = [term, repoLanguage.trim() ? `language:${repoLanguage.trim()}` : '']
    .filter(Boolean)
    .join(' ')
  const issueQueryText = [
    term,
    issueStateFilter === 'all' ? '' : `is:${issueStateFilter}`,
    issueLabel.trim() ? `label:${issueLabel.trim()}` : '',
  ]
    .filter(Boolean)
    .join(' ')
  const repoEncoded = encodeURIComponent(repoQueryText)
  const issueEncoded = encodeURIComponent(issueQueryText)
  const repoSortParam = repoSort === 'best' ? '' : `&sort=${repoSort}&order=desc`
  const issueSortParam = issueSortFilter === 'best' ? '' : `&sort=${issueSortFilter}&order=desc`

  const repos = useGh<GhSearchResult<GhRepo>>(
    tab === 'repos'
      ? term
        ? `/search/repositories?q=${repoEncoded}&per_page=30&page=${page}${repoSortParam}`
        : `/search/repositories?q=stars:>800+pushed:>${since}&sort=stars&order=desc&per_page=20`
      : null,
    [tab, term, page, repoLanguage, repoSort],
  )
  const users = useGh<GhSearchResult<GhUser>>(
    tab === 'users' && term ? `/search/users?q=${encoded}&per_page=30&page=${page}` : null,
    [tab, term, page],
  )
  const issues = useGh<GhSearchResult<GhIssue & { repository_url: string }>>(
    tab === 'issues' && term
      ? `/search/issues?q=${issueEncoded}&per_page=30&page=${page}${issueSortParam}`
      : null,
    [tab, term, page, issueStateFilter, issueSortFilter, issueLabel],
  )
  const prs = useGh<GhSearchResult<GhIssue & { repository_url: string }>>(
    tab === 'prs' && term
      ? `/search/issues?q=${encodeURIComponent(`${issueQueryText} is:pr`.trim())}&per_page=30&page=${page}${issueSortParam}`
      : null,
    [tab, term, page, issueStateFilter, issueSortFilter, issueLabel],
  )
  const topics = useGh<GhSearchResult<TopicItem>>(
    tab === 'topics' && term ? `/search/topics?q=${encoded}&per_page=30&page=${page}` : null,
    [tab, term, page],
  )
  const discussions = useGql<{ search: { discussionCount: number; nodes: DiscussionItem[] } }>(
    tab === 'discussions' && term && authenticated ? DISCUSSION_QUERY : null,
    { q: term, first: 30 },
    [tab, term, authenticated],
  )
  const code = useGh<GhSearchResult<CodeItem>>(
    tab === 'code' && term && authenticated ? `/search/code?q=${encoded}&per_page=30&page=${page}` : null,
    [tab, term, authenticated, page],
  )

  useEffect(() => {
    if (tab !== 'commits' || !term) return
    let alive = true
    setCommitLoading(true)
    setCommitError(null)
    gh<{ total_count: number; items: CommitItem[] }>(
      `/search/commits?q=${encoded}&per_page=30&page=${page}`,
      { accept: 'application/vnd.github.cloak-preview+json' },
    ).then((res) => {
      if (!alive) return
      setCommitLoading(false)
      if (res.ok) {
        setCommitResults(res.data)
      } else {
        setCommitError(apiErrorMessage(res.data, `GitHub API error (${res.status})`))
      }
    })
    return () => {
      alive = false
    }
  }, [tab, term, encoded, page])

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    setTerm(input.trim())
    setPage(1)
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'repos', label: t('search.repos') },
    { key: 'users', label: t('search.users') },
    { key: 'issues', label: t('search.issues') },
    { key: 'prs', label: L('Pull requests', '拉取请求') },
    { key: 'code', label: t('search.code') },
    { key: 'commits', label: L('Commits', '提交') },
    { key: 'discussions', label: L('Discussions', '讨论') },
    { key: 'topics', label: L('Topics', '主题') },
  ]

  const parseRepo = (url: string) => {
    const full = url.replace('https://api.github.com/repos/', '')
    const [owner, repo] = full.split('/')
    return { owner, repo }
  }

  const total =
    tab === 'repos'
      ? repos.data?.total_count
      : tab === 'users'
        ? users.data?.total_count
        : tab === 'issues'
          ? issues.data?.total_count
          : tab === 'prs'
            ? prs.data?.total_count
            : tab === 'topics'
              ? topics.data?.total_count
              : tab === 'commits'
                ? commitResults?.total_count
                : tab === 'discussions'
                  ? discussions.data?.search.discussionCount
                  : code.data?.total_count
  const totalPages = total !== undefined ? Math.max(1, Math.ceil(total / 30)) : undefined

  return (
    <div className="page">
      <PageHeader title={t('search.title')} subtitle={t('search.subtitle')} />

      <section className="card card-body" style={{ padding: 16 }}>
        <form onSubmit={submit} className="row">
          <div className="search-box" style={{ flex: 1, width: 'auto' }}>
            <Search size={15} />
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={t('search.placeholder')}
              style={{ height: 40 }}
              autoFocus
            />
          </div>
          <button className="btn primary" type="submit" style={{ height: 40 }}>
            {t('app.search')}
          </button>
        </form>
        <div className="tabs" style={{ marginTop: 12, borderBottom: 0, padding: 0 }}>
          {tabs.map((item) => (
            <button
              key={item.key}
              className={tab === item.key ? 'tab active' : 'tab'}
              onClick={() => {
                setTab(item.key)
                setPage(1)
              }}
            >
              {item.key === 'repos' ? <Star size={13} /> : null}
              {item.key === 'users' ? <UserRound size={13} /> : null}
              {item.key === 'issues' ? <Code2 size={13} /> : null}
              {item.key === 'prs' ? <GitPullRequest size={13} /> : null}
              {item.key === 'code' ? <FileCode2 size={13} /> : null}
              {item.key === 'commits' ? <GitCommitHorizontal size={13} /> : null}
              {item.key === 'discussions' ? <MessagesSquare size={13} /> : null}
              {item.key === 'topics' ? <Tag size={13} /> : null}
              {item.label}
            </button>
          ))}
        </div>

        {tab === 'repos' || tab === 'issues' || tab === 'prs' ? (
          <div className="row" style={{ marginTop: 12, gap: 8, flexWrap: 'wrap' }}>
            {tab === 'repos' ? (
              <>
                <select
                  className="select"
                  style={{ height: 32, width: 170 }}
                  value={repoSort}
                  onChange={(event) => {
                    setRepoSort(event.target.value)
                    setPage(1)
                  }}
                >
                  <option value="best">{L('Best match', '最佳匹配')}</option>
                  <option value="stars">{L('Most stars', '星标最多')}</option>
                  <option value="forks">{L('Most forks', '复刻最多')}</option>
                  <option value="updated">{L('Recently updated', '最近更新')}</option>
                </select>
                <input
                  className="input"
                  style={{ height: 32, width: 190 }}
                  value={repoLanguage}
                  onChange={(event) => {
                    setRepoLanguage(event.target.value)
                    setPage(1)
                  }}
                  placeholder={L('Language (e.g. TypeScript)', '语言（如 TypeScript）')}
                />
              </>
            ) : (
              <>
                <select
                  className="select"
                  style={{ height: 32, width: 150 }}
                  value={issueStateFilter}
                  onChange={(event) => {
                    setIssueStateFilter(event.target.value as 'all' | 'open' | 'closed')
                    setPage(1)
                  }}
                >
                  <option value="all">{L('Any state', '任意状态')}</option>
                  <option value="open">{L('Open', '打开')}</option>
                  <option value="closed">{L('Closed', '已关闭')}</option>
                </select>
                <select
                  className="select"
                  style={{ height: 32, width: 170 }}
                  value={issueSortFilter}
                  onChange={(event) => {
                    setIssueSortFilter(event.target.value)
                    setPage(1)
                  }}
                >
                  <option value="best">{L('Best match', '最佳匹配')}</option>
                  <option value="comments">{L('Most commented', '评论最多')}</option>
                  <option value="created">{L('Newest', '最新创建')}</option>
                  <option value="updated">{L('Recently updated', '最近更新')}</option>
                </select>
                <input
                  className="input"
                  style={{ height: 32, width: 190 }}
                  value={issueLabel}
                  onChange={(event) => {
                    setIssueLabel(event.target.value)
                    setPage(1)
                  }}
                  placeholder={L('Label filter', '标签筛选')}
                />
              </>
            )}
            <button
              className="btn small ghost"
              onClick={() => {
                setRepoSort('best')
                setRepoLanguage('')
                setIssueStateFilter('all')
                setIssueSortFilter('best')
                setIssueLabel('')
                setPage(1)
              }}
            >
              {L('Clear filters', '清除筛选')}
            </button>
          </div>
        ) : null}
      </section>

      {!term ? (
        <section className="card">
          <div className="card-head">
            <div>
              <div className="card-title">{t('dashboard.trending')}</div>
              <div className="card-sub">{t('search.shortcutHint')}</div>
            </div>
          </div>
          <div className="list">
            {tab === 'repos' ? (
              repos.loading ? (
                <LoadingBlock />
              ) : repos.error ? (
                <div style={{ padding: 16 }}>
                  <ErrorBlock message={repos.error} onRetry={repos.reload} />
                </div>
              ) : (
                (repos.data?.items || []).map((repo) => (
                  <RepoRow
                    key={repo.id}
                    repo={repo}
                    onClick={() => navigate({ name: 'repo', owner: repo.owner.login, repo: repo.name })}
                    right={
                      <>
                        <span>
                          <Star size={12} /> {compactNumber(repo.stargazers_count)}
                        </span>
                        <span>
                          <GitFork size={12} /> {compactNumber(repo.forks_count)}
                        </span>
                      </>
                    }
                  />
                ))
              )
            ) : (
              <EmptyState icon={<Search size={20} />} title={t('search.empty')} text={t('search.emptyHint')} />
            )}
          </div>
        </section>
      ) : (tab === 'code' || tab === 'discussions') && !authenticated ? (
        <section className="card card-body">
          <div className="gate">
            <div className="gate-icon">
              <Lock size={21} />
            </div>
            <h3>{t('search.codeTitle')}</h3>
            <p>{t('search.codeText')}</p>
            <button className="btn primary" onClick={openLogin}>
              {t('app.unlock')}
            </button>
          </div>
        </section>
      ) : (
        <section className="card">
          <div className="card-head">
            <div className="card-title">
              {total !== undefined ? t('search.results', { n: total.toLocaleString() }) : t('app.loading')}
            </div>
            <Badge>{tabs.find((item) => item.key === tab)?.label}</Badge>
          </div>

          {tab === 'repos' ? (
            repos.loading ? (
              <LoadingBlock />
            ) : repos.error ? (
              <div style={{ padding: 16 }}>
                <ErrorBlock message={repos.error} onRetry={repos.reload} />
              </div>
            ) : !repos.data?.items?.length ? (
              <EmptyState title={t('search.empty')} text={t('search.emptyHint')} />
            ) : (
              <div className="list">
                {repos.data.items.map((repo) => (
                  <RepoRow
                    key={repo.id}
                    repo={repo}
                    onClick={() => navigate({ name: 'repo', owner: repo.owner.login, repo: repo.name })}
                    right={<span>★ {compactNumber(repo.stargazers_count)}</span>}
                  />
                ))}
              </div>
            )
          ) : null}

          {tab === 'users' ? (
            users.loading ? (
              <LoadingBlock />
            ) : users.error ? (
              <div style={{ padding: 16 }}>
                <ErrorBlock message={users.error} onRetry={users.reload} />
              </div>
            ) : !users.data?.items?.length ? (
              <EmptyState title={t('search.empty')} text={t('search.emptyHint')} />
            ) : (
              <div>
                {users.data.items.map((user) => (
                  <div className="search-result" key={user.id}>
                    <Avatar user={user} size={44} />
                    <div className="item-main">
                      <div className="item-title">{user.login}</div>
                      <div className="item-desc mono">{user.html_url}</div>
                    </div>
                    <button className="btn small" onClick={() => navigate({ name: 'user', login: user.login })}>
                      {t('search.viewProfile')}
                    </button>
                  </div>
                ))}
              </div>
            )
          ) : null}

          {tab === 'issues' ? (
            issues.loading ? (
              <LoadingBlock />
            ) : issues.error ? (
              <div style={{ padding: 16 }}>
                <ErrorBlock message={issues.error} onRetry={issues.reload} />
              </div>
            ) : !issues.data?.items?.length ? (
              <EmptyState title={t('search.empty')} text={t('search.emptyHint')} />
            ) : (
              issues.data.items.map((item) => {
                const { owner, repo } = parseRepo(item.repository_url)
                return (
                  <IssueRow
                    key={`${item.id}`}
                    item={item}
                    isPull={Boolean(item.pull_request)}
                    repoName={`${owner}/${repo}`}
                    onClick={() =>
                      navigate({
                        name: 'issue',
                        owner,
                        repo,
                        number: item.number,
                        kind: item.pull_request ? 'pull' : 'issue',
                      })
                    }
                  />
                )
              })
            )
          ) : null}

          {tab === 'prs' ? (
            prs.loading ? (
              <LoadingBlock />
            ) : prs.error ? (
              <div style={{ padding: 16 }}>
                <ErrorBlock message={prs.error} onRetry={prs.reload} />
              </div>
            ) : !prs.data?.items?.length ? (
              <EmptyState title={t('search.empty')} text={t('search.emptyHint')} />
            ) : (
              prs.data.items.map((item) => {
                const { owner, repo } = parseRepo(item.repository_url)
                return (
                  <IssueRow
                    key={`${item.id}`}
                    item={item}
                    isPull
                    repoName={`${owner}/${repo}`}
                    onClick={() =>
                      navigate({ name: 'issue', owner, repo, number: item.number, kind: 'pull' })
                    }
                  />
                )
              })
            )
          ) : null}

          {tab === 'commits' ? (
            commitLoading ? (
              <LoadingBlock />
            ) : commitError ? (
              <div style={{ padding: 16 }}>
                <ErrorBlock message={commitError} />
              </div>
            ) : !commitResults?.items?.length ? (
              <EmptyState title={t('search.empty')} text={t('search.emptyHint')} />
            ) : (
              commitResults.items.map((item) => {
                const [owner, repo] = item.repository.full_name.split('/')
                return (
                  <button
                    className="search-result"
                    key={item.sha}
                    onClick={() => navigate({ name: 'commit', owner, repo, sha: item.sha })}
                  >
                    <span className="file-icon">
                      <GitCommitHorizontal size={18} />
                    </span>
                    <div className="item-main">
                      <div className="item-title">{item.commit.message.split('\n')[0]}</div>
                      <div className="item-desc">
                        {item.repository.full_name} · <span className="mono">{item.sha.slice(0, 7)}</span>
                        {item.commit.author?.date ? (
                          <>
                            {' · '}
                            <TimeAgo iso={item.commit.author.date} />
                          </>
                        ) : null}
                      </div>
                    </div>
                    <span className="badge mono">{item.sha.slice(0, 7)}</span>
                  </button>
                )
              })
            )
          ) : null}

          {tab === 'topics' ? (
            topics.loading ? (
              <LoadingBlock />
            ) : topics.error ? (
              <div style={{ padding: 16 }}>
                <ErrorBlock message={topics.error} onRetry={topics.reload} />
              </div>
            ) : !topics.data?.items?.length ? (
              <EmptyState title={t('search.empty')} text={t('search.emptyHint')} />
            ) : (
              topics.data.items.map((topic) => (
                <button
                  className="search-result"
                  key={topic.name}
                  onClick={() => navigate({ name: 'explore', query: topic.name })}
                >
                  <span className="file-icon">
                    <Tag size={18} />
                  </span>
                  <div className="item-main">
                    <div className="item-title">
                      {topic.display_name || topic.name}
                      {topic.featured ? <Badge tone="blue">{L('Featured', '精选')}</Badge> : null}
                    </div>
                    {topic.short_description ? <div className="item-desc">{topic.short_description}</div> : null}
                  </div>
                </button>
              ))
            )
          ) : null}

          {tab === 'discussions' ? (
            discussions.loading && !discussions.data ? (
              <LoadingBlock />
            ) : discussions.error ? (
              <div style={{ padding: 16 }}>
                <ErrorBlock message={discussions.error} onRetry={discussions.reload} />
              </div>
            ) : !discussions.data?.search?.nodes?.length ? (
              <EmptyState title={t('search.empty')} text={t('search.emptyHint')} />
            ) : (
              discussions.data.search.nodes.map((item) => (
                <button
                  className="search-result"
                  key={item.id}
                  onClick={() => void openExternal(item.url)}
                >
                  <span className="file-icon">
                    <MessagesSquare size={18} />
                  </span>
                  <div className="item-main">
                    <div className="item-title">{item.title}</div>
                    <div className="item-desc">
                      {item.repository.nameWithOwner}
                      {item.category ? ` · ${item.category.name}` : ''}
                      {' · '}
                      {item.comments.totalCount} comments
                    </div>
                  </div>
                  <span className="muted" style={{ fontSize: 11.5 }}>
                    <TimeAgo iso={item.createdAt} />
                  </span>
                </button>
              ))
            )
          ) : null}

          {tab === 'code' ? (
            code.loading ? (
              <LoadingBlock />
            ) : code.error ? (
              <div style={{ padding: 16 }}>
                <ErrorBlock message={code.error} onRetry={code.reload} />
              </div>
            ) : !code.data?.items?.length ? (
              <EmptyState title={t('search.empty')} text={t('search.emptyHint')} />
            ) : (
              code.data.items.map((item) => (
                <div className="search-result" key={item.html_url}>
                  <span className="file-icon">
                    <FileCode2 size={18} />
                  </span>
                  <div className="item-main">
                    <div className="item-title mono" style={{ fontSize: 12.5 }}>
                      {item.path}
                    </div>
                    <div className="item-desc mono">{item.repository.full_name}</div>
                  </div>
                  <button className="btn small" onClick={() => void openExternal(item.html_url)}>
                    {t('app.openInBrowser')}
                  </button>
                </div>
              ))
            )
          ) : null}

          {tab !== 'discussions' ? (
            <Pagination
              page={page}
              onPage={setPage}
              totalPages={totalPages}
              loading={
                tab === 'repos'
                  ? repos.loading
                  : tab === 'users'
                    ? users.loading
                    : tab === 'issues'
                      ? issues.loading
                      : tab === 'prs'
                        ? prs.loading
                        : tab === 'topics'
                          ? topics.loading
                          : tab === 'commits'
                            ? commitLoading
                            : code.loading
              }
            />
          ) : null}
        </section>
      )}
    </div>
  )
}
