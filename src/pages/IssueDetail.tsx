import { useMemo, useState } from 'react'
import {
  ArrowLeft,
  CheckCircle2,
  CircleDot,
  ExternalLink,
  GitMerge,
  GitPullRequest,
  MessageSquare,
  Pencil,
  Send,
  Settings2,
  ShieldCheck,
  Trash2,
} from 'lucide-react'
import { useApp } from '../lib/store'
import { useGh, useGql } from '../lib/hooks'
import { apiErrorMessage, gh, gql } from '../lib/api'
import { Avatar, Badge, ErrorBlock, LoadingBlock, Modal, TimeAgo } from '../components/ui'
import { Markdown } from '../components/Markdown'
import { ReviewDiff } from '../components/ReviewDiff'
import { Reactions } from '../components/Reactions'
import type { GhComment, GhFileDiff, GhIssue, GhLabel, GhPull, GhUser } from '../lib/types'
import { formatDate } from '../lib/format'
import { openExternal } from '../lib/desktop'

type CommentWithPath = GhComment & { path?: string }
type Review = {
  id: number
  user: GhUser | null
  state: string
  body: string | null
  submitted_at: string | null
  html_url: string
}

type PullCommit = {
  sha: string
  commit: { message: string; author: { name: string; date: string } | null }
  author: GhUser | null
}

type CheckRun = {
  id: number
  name: string
  status: string
  conclusion: string | null
  html_url: string
  started_at: string | null
  completed_at: string | null
}

type ReviewThreadsData = {
  repository: {
    pullRequest: {
      reviewThreads: {
        nodes: {
          id: string
          isResolved: boolean
          comments: { nodes: { databaseId: number | null }[] }
        }[]
      }
    }
  }
}

const REVIEW_THREADS_QUERY = `query ($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      reviewThreads(first: 100) {
        nodes {
          id
          isResolved
          comments(first: 100) { nodes { databaseId } }
        }
      }
    }
  }
}`

const PR_META_QUERY = `query ($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      id
      isDraft
    }
  }
}`

type PullMeta = {
  repository: { pullRequest: { id: string; isDraft: boolean } | null } | null
}

function CommitDiff({
  owner,
  repo,
  prNumber,
  sha,
  comments,
  threads,
  onChanged,
  onThreadsChanged,
}: {
  owner: string
  repo: string
  prNumber: number
  sha: string
  comments: CommentWithPath[]
  threads: Map<number, { id: string; isResolved: boolean }>
  onChanged: () => void
  onThreadsChanged: () => void
}) {
  const { t } = useApp()
  const detail = useGh<{ files: GhFileDiff[] }>(`/repos/${owner}/${repo}/commits/${sha}`)

  if (detail.loading && !detail.data) return <LoadingBlock />
  if (detail.error) {
    return (
      <div style={{ padding: 16 }}>
        <ErrorBlock message={detail.error} onRetry={detail.reload} />
      </div>
    )
  }
  if (!detail.data?.files?.length) return <div className="readme-empty">{t('pulls.commitNoFiles')}</div>
  return (
    <ReviewDiff
      owner={owner}
      repo={repo}
      prNumber={prNumber}
      commitId={sha}
      files={detail.data.files}
      comments={comments}
      threads={threads}
      onChanged={onChanged}
      onThreadsChanged={onThreadsChanged}
    />
  )
}

export function IssueDetailPage({
  owner,
  repo,
  number,
  kind,
}: {
  owner: string
  repo: string
  number: number
  kind: 'issue' | 'pull'
}) {
  const { t, lang, navigate, authenticated, openLogin, toast, user } = useApp()
  const L = (en: string, zh: string) => (lang === 'zh' ? zh : en)
  const issue = useGh<GhIssue>(`/repos/${owner}/${repo}/issues/${number}`)
  const pull = useGh<GhPull>(kind === 'pull' ? `/repos/${owner}/${repo}/pulls/${number}` : null)
  const comments = useGh<CommentWithPath[]>(`/repos/${owner}/${repo}/issues/${number}/comments?per_page=100`)
  const reviewComments = useGh<CommentWithPath[]>(
    kind === 'pull' ? `/repos/${owner}/${repo}/pulls/${number}/comments?per_page=100` : null,
  )
  const reviews = useGh<Review[]>(kind === 'pull' ? `/repos/${owner}/${repo}/pulls/${number}/reviews?per_page=50` : null)
  const files = useGh<GhFileDiff[]>(
    kind === 'pull' ? `/repos/${owner}/${repo}/pulls/${number}/files?per_page=100` : null,
  )
  const pullCommits = useGh<PullCommit[]>(
    kind === 'pull' ? `/repos/${owner}/${repo}/pulls/${number}/commits?per_page=100` : null,
  )
  const checks = useGh<{ total_count: number; check_runs: CheckRun[] }>(
    kind === 'pull' && pull.data?.head?.sha
      ? `/repos/${owner}/${repo}/commits/${pull.data.head.sha}/check-runs?per_page=100`
      : null,
    [pull.data?.head?.sha],
  )
  const subIssues = useGh<{ id: number; number: number; title: string; state: string }[]>(
    kind === 'issue' ? `/repos/${owner}/${repo}/issues/${number}/sub_issues?per_page=100` : null,
  )
  const blockedBy = useGh<{ id: number; number: number; title: string; state: string }[]>(
    kind === 'issue' ? `/repos/${owner}/${repo}/issues/${number}/dependencies/blocked_by?per_page=100` : null,
  )
  const reviewThreads = useGql<ReviewThreadsData>(
    kind === 'pull' && authenticated ? REVIEW_THREADS_QUERY : null,
    { owner, repo, number },
  )
  const pullMeta = useGql<PullMeta>(
    kind === 'pull' && authenticated ? PR_META_QUERY : null,
    { owner, repo, number },
  )

  const threadMap = useMemo(() => {
    const map = new Map<number, { id: string; isResolved: boolean }>()
    const nodes = reviewThreads.data?.repository?.pullRequest?.reviewThreads?.nodes || []
    for (const node of nodes) {
      const root = node.comments?.nodes?.find((item) => typeof item.databaseId === 'number')
      if (root?.databaseId) map.set(root.databaseId, { id: node.id, isResolved: node.isResolved })
    }
    return map
  }, [reviewThreads.data])

  const fileTree = useMemo(() => {
    const map = new Map<string, { name: string; path: string }[]>()
    for (const file of files.data || []) {
      const parts = file.filename.split('/')
      const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : ''
      if (!map.has(dir)) map.set(dir, [])
      map.get(dir)!.push({ name: parts[parts.length - 1], path: file.filename })
    }
    return Array.from(map.entries())
  }, [files.data])

  const scrollToFile = (path: string) => {
    document.getElementById(`diff-file-${path}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const [diffMode, setDiffMode] = useState<'files' | 'commits' | 'checks'>('files')
  const [selectedCommit, setSelectedCommit] = useState<string | null>(null)

  const [commentText, setCommentText] = useState('')
  const [reviewBody, setReviewBody] = useState('')
  const [mergeMethod, setMergeMethod] = useState('merge')
  const [busy, setBusy] = useState<string | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editBody, setEditBody] = useState('')
  const [editLabels, setEditLabels] = useState<string[]>([])
  const [editAssignees, setEditAssignees] = useState<string[]>([])
  const [editMilestone, setEditMilestone] = useState('')
  const [manageOpen, setManageOpen] = useState(false)
  const [lockReason, setLockReason] = useState('resolved')
  const [transferRepo, setTransferRepo] = useState('')
  const [manageBusy, setManageBusy] = useState<string | null>(null)
  const [editCommentId, setEditCommentId] = useState<number | null>(null)
  const [editCommentBody, setEditCommentBody] = useState('')
  const [reviewer, setReviewer] = useState('')

  const repoLabels = useGh<GhLabel[]>(editOpen ? `/repos/${owner}/${repo}/labels?per_page=100` : null)
  const repoAssignees = useGh<GhUser[]>(
    editOpen || (kind === 'pull' && authenticated)
      ? `/repos/${owner}/${repo}/assignees?per_page=100`
      : null,
  )
  const repoMilestones = useGh<{ number: number; title: string }[]>(
    editOpen ? `/repos/${owner}/${repo}/milestones?state=open&per_page=100` : null,
  )

  const isPull = kind === 'pull' || Boolean(issue.data?.pull_request)
  const merged = kind === 'pull' && Boolean(pull.data?.merged_at)
  const notMergeable = Boolean(isPull && pull.data && (pull.data as any).mergeable === false)
  const needsUpdate = Boolean(isPull && pull.data && (pull.data as any).mergeable_state === 'behind')
  const state = merged ? 'merged' : issue.data?.state || 'open'

  const thread = useMemo(() => comments.data || [], [comments.data])

  if (issue.loading && !issue.data) return <LoadingBlock />

  if (issue.error || !issue.data) {
    return (
      <div className="page">
        <div className="card card-body">
          <ErrorBlock message={issue.error || t('issues.notFound')} onRetry={issue.reload} />
          <div style={{ marginTop: 14 }}>
            <button className="btn" onClick={() => navigate({ name: 'repo', owner, repo })}>
              <ArrowLeft size={14} />
              {t('issues.backToRepo')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  const data = issue.data

  const refreshAll = () => {
    issue.reload()
    pull.reload()
    comments.reload()
    reviews.reload()
    reviewComments.reload()
    reviewThreads.reload()
    subIssues.reload()
    blockedBy.reload()
  }

  const startEditComment = (comment: CommentWithPath) => {
    setEditCommentId(comment.id)
    setEditCommentBody(comment.body || '')
  }

  const saveComment = async (comment: CommentWithPath) => {
    if (!editCommentBody.trim()) return
    setBusy(`edit-comment-${comment.id}`)
    const res = await gh(`/repos/${owner}/${repo}/issues/comments/${comment.id}`, {
      method: 'PATCH',
      body: { body: editCommentBody.trim() },
    })
    setBusy(null)
    if (res.ok) {
      toast(t('issues.saved'), 'success')
      setEditCommentId(null)
      setEditCommentBody('')
      refreshAll()
    } else {
      toast(apiErrorMessage(res.data, t('app.requestFailed', { status: res.status })), 'error')
    }
  }

  const deleteComment = async (comment: CommentWithPath) => {
    if (!window.confirm(L('Delete this comment?', '删除这条评论？'))) return
    setBusy(`delete-comment-${comment.id}`)
    const res = await gh(`/repos/${owner}/${repo}/issues/comments/${comment.id}`, { method: 'DELETE' })
    setBusy(null)
    if (res.ok || res.status === 204) {
      toast(L('Comment deleted', '评论已删除'), 'success')
      refreshAll()
    } else {
      toast(apiErrorMessage(res.data, t('app.requestFailed', { status: res.status })), 'error')
    }
  }

  const postComment = async () => {
    if (!commentText.trim()) return
    setBusy('comment')
    const res = await gh(`/repos/${owner}/${repo}/issues/${number}/comments`, {
      method: 'POST',
      body: { body: commentText.trim() },
    })
    setBusy(null)
    if (res.ok) {
      setCommentText('')
      toast(t('issues.commented'), 'success')
      comments.reload()
      issue.reload()
    } else {
      toast(apiErrorMessage(res.data, t('app.requestFailed', { status: res.status })), 'error')
    }
  }

  const toggleState = async () => {
    const next = data.state === 'open' ? 'closed' : 'open'
    setBusy('state')
    const res = await gh(`/repos/${owner}/${repo}/issues/${number}`, {
      method: 'PATCH',
      body: { state: next },
    })
    setBusy(null)
    if (res.ok) {
      toast(t(next === 'closed' ? 'issues.closedToast' : 'issues.reopenedToast'), 'success')
      refreshAll()
    } else {
      toast(apiErrorMessage(res.data, t('app.requestFailed', { status: res.status })), 'error')
    }
  }

  const openEdit = () => {
    setEditTitle(data.title)
    setEditBody(data.body || '')
    setEditLabels((data.labels || []).map((label) => label.name))
    setEditAssignees((data.assignees || []).map((user) => user.login))
    setEditMilestone(data.milestone ? String(data.milestone.number) : '')
    setEditOpen(true)
  }

  const saveEdit = async () => {
    setBusy('edit')
    const res = await gh(`/repos/${owner}/${repo}/issues/${number}`, {
      method: 'PATCH',
      body: {
        title: editTitle.trim(),
        body: editBody,
        assignees: editAssignees,
        milestone: editMilestone ? Number(editMilestone) : null,
      },
    })
    const labelsRes = await gh(`/repos/${owner}/${repo}/issues/${number}/labels`, {
      method: 'PUT',
      body: { labels: editLabels },
    })
    setBusy(null)
    if (res.ok && labelsRes.ok) {
      toast(t('issues.saved'), 'success')
      setEditOpen(false)
      refreshAll()
    } else {
      toast(apiErrorMessage(!res.ok ? res.data : labelsRes.data, t('app.requestFailed', { status: res.status })), 'error')
    }
  }

  const toggleLock = async () => {
    setManageBusy('lock')
    const res = data.locked
      ? await gh(`/repos/${owner}/${repo}/issues/${number}/lock`, { method: 'DELETE' })
      : await gh(`/repos/${owner}/${repo}/issues/${number}/lock`, {
          method: 'PUT',
          body: { lock_reason: lockReason },
        })
    setManageBusy(null)
    if (res.ok || res.status === 204) {
      toast(t(data.locked ? 'issues.unlockedToast' : 'issues.lockedToast'), 'success')
      refreshAll()
    } else {
      toast(apiErrorMessage(res.data, t('app.requestFailed', { status: res.status })), 'error')
    }
  }

  const transferIssue = async () => {
    const target = transferRepo.trim()
    if (!target) return
    setManageBusy('transfer')
    const res = await gh(`/repos/${owner}/${repo}/issues/${number}/transfer`, {
      method: 'POST',
      body: { new_repo: target },
    })
    setManageBusy(null)
    if (res.ok) {
      toast(t('issues.transferred'), 'success')
      setManageOpen(false)
      const match = String(res.data?.html_url || '').match(/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/)
      if (match) {
        navigate({ name: 'issue', owner: match[1], repo: match[2], number: Number(match[3]), kind: 'issue' })
      }
    } else {
      toast(apiErrorMessage(res.data, t('app.requestFailed', { status: res.status })), 'error')
    }
  }

  const deleteIssue = async () => {
    if (!window.confirm(t('issues.deleteConfirm'))) return
    setManageBusy('delete')
    const res = await gh(`/repos/${owner}/${repo}/issues/${number}`, { method: 'DELETE' })
    setManageBusy(null)
    if (res.ok || res.status === 204) {
      toast(t('issues.deleted'), 'success')
      navigate({ name: 'repo', owner, repo })
    } else {
      toast(apiErrorMessage(res.data, t('app.requestFailed', { status: res.status })), 'error')
    }
  }

  const submitReview = async (event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT') => {
    setBusy('review')
    const res = await gh(`/repos/${owner}/${repo}/pulls/${number}/reviews`, {
      method: 'POST',
      body: { event, body: reviewBody },
    })
    setBusy(null)
    if (res.ok) {
      setReviewBody('')
      toast(t('pulls.reviewed'), 'success')
      reviews.reload()
      issue.reload()
      pull.reload()
    } else {
      toast(apiErrorMessage(res.data, t('app.requestFailed', { status: res.status })), 'error')
    }
  }

  const mergePull = async () => {
    setBusy('merge')
    const res = await gh(`/repos/${owner}/${repo}/pulls/${number}/merge`, {
      method: 'PUT',
      body: { merge_method: mergeMethod, commit_title: data.title },
    })
    setBusy(null)
    if (res.ok) {
      toast(t('pulls.mergedToast'), 'success')
      refreshAll()
    } else {
      toast(apiErrorMessage(res.data, t('pulls.notMergeable')), 'error')
    }
  }

  const updateBranch = async () => {
    setBusy('update-branch')
    const res = await gh(`/repos/${owner}/${repo}/pulls/${number}/update-branch`, { method: 'PUT' })
    setBusy(null)
    if (res.ok) {
      toast(L('Branch updated', '分支已更新'), 'success')
      refreshAll()
    } else {
      toast(apiErrorMessage(res.data, t('app.requestFailed', { status: res.status })), 'error')
    }
  }

  const requestReview = async () => {
    if (!reviewer) return
    setBusy('reviewer')
    const res = await gh(`/repos/${owner}/${repo}/pulls/${number}/requested_reviewers`, {
      method: 'POST',
      body: { reviewers: [reviewer] },
    })
    setBusy(null)
    if (res.ok) {
      toast(L('Review requested', '已请求审查'), 'success')
      setReviewer('')
      pull.reload()
    } else {
      toast(apiErrorMessage(res.data, t('app.requestFailed', { status: res.status })), 'error')
    }
  }

  const toggleDraft = async (draft: boolean) => {
    const id = pullMeta.data?.repository?.pullRequest?.id
    if (!id) {
      toast(L('Could not load pull request id', '无法获取拉取请求 ID'), 'error')
      return
    }
    setBusy('draft')
    const mutation = draft
      ? `mutation ($id: ID!) { convertPullRequestToDraft(input: { pullRequestId: $id }) { clientMutationId } }`
      : `mutation ($id: ID!) { markPullRequestReadyForReview(input: { pullRequestId: $id }) { clientMutationId } }`
    const res = await gql(mutation, { id })
    setBusy(null)
    if (res.ok) {
      toast(draft ? L('Converted to draft', '已转为草稿') : L('Ready for review', '已标记为可审查'), 'success')
      pull.reload()
      pullMeta.reload()
    } else {
      toast(res.error || t('app.error'), 'error')
    }
  }

  const reviewLabel = (reviewState: string) => {
    if (reviewState === 'APPROVED') return t('pulls.reviewStateApproved')
    if (reviewState === 'CHANGES_REQUESTED') return t('pulls.reviewStateChanges')
    return t('pulls.reviewStateComment')
  }

  return (
    <div className="page">
      <button className="btn ghost" style={{ alignSelf: 'flex-start' }} onClick={() => navigate({ name: 'repo', owner, repo })}>
        <ArrowLeft size={14} />
        {owner}/{repo}
      </button>

      <div className="page-head" style={{ alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <span className={`badge ${state === 'open' ? 'green' : 'purple'}`}>
              {state === 'open' ? <CircleDot size={11} /> : <CheckCircle2 size={11} />}
              {merged ? t('pulls.merged') : state === 'open' ? t('issues.stateOpen') : t('issues.stateClosed')}
            </span>
            <span className="badge">{isPull ? t('notifications.pullRequest') : t('notifications.issue')}</span>
            <span className="badge">#{data.number}</span>
            {pull.data?.draft ? <span className="badge">{L('Draft', '草稿')}</span> : null}
          </div>
          <h1 className="page-title" style={{ marginTop: 10 }}>
            {data.title}
          </h1>
          <p className="page-sub">
            {data.user ? t('issues.openedBy', { name: data.user.login }) : ''} · <TimeAgo iso={data.created_at} />
          </p>
        </div>
        <div className="page-actions">
          {authenticated ? (
            <>
              <button className="btn" onClick={openEdit}>
                <Pencil size={14} />
                {t('issues.edit')}
              </button>
              {!(isPull && merged) ? (
                <button className="btn" onClick={() => void toggleState()} disabled={busy === 'state'}>
                  {data.state === 'open' ? <CheckCircle2 size={14} /> : <CircleDot size={14} />}
                  {data.state === 'open' ? t('issues.close') : t('issues.reopen')}
                </button>
              ) : null}
              {isPull && !merged ? (
                <button
                  className="btn"
                  onClick={() => void toggleDraft(!pull.data?.draft)}
                  disabled={busy === 'draft'}
                >
                  {busy === 'draft' ? <span className="spinner" /> : <GitPullRequest size={14} />}
                  {pull.data?.draft ? L('Ready for review', '标记为可审查') : L('Convert to draft', '转为草稿')}
                </button>
              ) : null}
              <button className="icon-btn" title={t('issues.manage')} onClick={() => setManageOpen(true)}>
                <Settings2 size={15} />
              </button>
            </>
          ) : null}
          <button className="btn" onClick={() => void openExternal(data.html_url)}>
            <ExternalLink size={14} />
            {t('app.openInBrowser')}
          </button>
        </div>
      </div>

      <div className="detail-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <section className="card thread-card">
            <div className="thread-head">
              {data.user ? <Avatar user={data.user} size={22} /> : null}
              <strong style={{ color: 'var(--text)' }}>{data.user?.login}</strong>
              <span>{formatDate(data.created_at, lang)}</span>
            </div>
            {data.body ? (
              <Markdown markdown={data.body} owner={owner} repo={repo} branch={pull.data?.head.ref} />
            ) : (
              <p className="muted">{t('issues.noDescription')}</p>
            )}
            <Reactions
              endpoint={`/repos/${owner}/${repo}/issues/${number}/reactions`}
              summary={data.reactions}
              onChanged={refreshAll}
            />
          </section>

          <div className="section-title">
            {t('issues.conversation')} · {thread.length}
          </div>

          {comments.loading ? (
            <LoadingBlock />
          ) : thread.length === 0 ? (
            <div className="card card-body muted" style={{ fontSize: 12.5 }}>
              {t('notifications.emptyText')}
            </div>
          ) : (
            thread.map((comment) => (
              <section className="card comment" key={`${comment.id}-${comment.path || 'issue'}`} style={{ marginTop: 0 }}>
                <div className="comment-head">
                  {comment.user ? <Avatar user={comment.user} size={20} /> : null}
                  <strong>{comment.user?.login}</strong>
                  <span>{formatDate(comment.created_at, lang)}</span>
                  {comment.path ? <span className="badge blue mono">{comment.path}</span> : null}
                  {authenticated && user && comment.user?.login === user.login ? (
                    <span className="row" style={{ gap: 4, marginLeft: 'auto' }}>
                      {editCommentId === comment.id ? (
                        <>
                          <button
                            className="btn small ghost"
                            onClick={() => {
                              setEditCommentId(null)
                              setEditCommentBody('')
                            }}
                          >
                            {t('app.cancel')}
                          </button>
                          <button
                            className="btn small primary"
                            onClick={() => void saveComment(comment)}
                            disabled={busy === `edit-comment-${comment.id}` || !editCommentBody.trim()}
                          >
                            {busy === `edit-comment-${comment.id}` ? <span className="spinner" /> : <Send size={12} />}
                            {t('common.save')}
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            className="icon-btn ghost"
                            title={L('Edit comment', '编辑评论')}
                            onClick={() => startEditComment(comment)}
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            className="icon-btn ghost"
                            title={L('Delete comment', '删除评论')}
                            onClick={() => void deleteComment(comment)}
                            disabled={busy === `delete-comment-${comment.id}`}
                          >
                            <Trash2 size={13} />
                          </button>
                        </>
                      )}
                    </span>
                  ) : null}
                </div>
                {editCommentId === comment.id ? (
                  <div className="comment-body">
                    <textarea
                      className="textarea"
                      value={editCommentBody}
                      onChange={(event) => setEditCommentBody(event.target.value)}
                    />
                  </div>
                ) : (
                  <div className="comment-body">
                    <Markdown markdown={comment.body || ''} owner={owner} repo={repo} branch={pull.data?.head.ref} />
                    <Reactions
                      endpoint={
                        comment.path
                          ? `/repos/${owner}/${repo}/pulls/comments/${comment.id}/reactions`
                          : `/repos/${owner}/${repo}/issues/comments/${comment.id}/reactions`
                      }
                      summary={comment.reactions}
                      onChanged={refreshAll}
                    />
                  </div>
                )}
              </section>
            ))
          )}

          {isPull && reviews.data?.length ? (
            <>
              <div className="section-title">{t('pulls.reviews')}</div>
              {reviews.data.map((review) => (
                <section className="card comment" key={review.id} style={{ marginTop: 0 }}>
                  <div className="comment-head">
                    {review.user ? <Avatar user={review.user} size={20} /> : null}
                    <strong>{review.user?.login}</strong>
                    <Badge
                      tone={
                        review.state === 'APPROVED'
                          ? 'green'
                          : review.state === 'CHANGES_REQUESTED'
                            ? 'red'
                            : 'default'
                      }
                    >
                      {reviewLabel(review.state)}
                    </Badge>
                    <span>{formatDate(review.submitted_at, lang)}</span>
                  </div>
                  {review.body ? (
                    <div className="comment-body">
                      <Markdown markdown={review.body} owner={owner} repo={repo} branch={pull.data?.head.ref} />
                    </div>
                  ) : null}
                </section>
              ))}
            </>
          ) : null}

          {authenticated ? (
            <section className="card card-body">
              <div className="card-title" style={{ marginBottom: 10 }}>
                <MessageSquare size={15} />
                {t('issues.commentAction')}
              </div>
              <textarea
                className="textarea"
                value={commentText}
                onChange={(event) => setCommentText(event.target.value)}
                placeholder={t('issues.commentPlaceholder')}
              />
              <div className="action-row" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
                <button
                  className="btn primary"
                  onClick={() => void postComment()}
                  disabled={busy === 'comment' || !commentText.trim()}
                >
                  {busy === 'comment' ? <span className="spinner" /> : <Send size={14} />}
                  {t('issues.commentAction')}
                </button>
              </div>
            </section>
          ) : (
            <div className="note">
              <MessageSquare size={14} />
              <span style={{ flex: 1 }}>{t('issues.commentLogin')}</span>
              <button className="btn small" onClick={openLogin}>
                {t('app.signIn')}
              </button>
            </div>
          )}

          {isPull && authenticated && !merged && data.state === 'open' ? (
            <section className="card card-body">
              <div className="card-title" style={{ marginBottom: 10 }}>
                <ShieldCheck size={15} />
                {t('pulls.review')}
              </div>
              <textarea
                className="textarea"
                value={reviewBody}
                onChange={(event) => setReviewBody(event.target.value)}
                placeholder={t('pulls.reviewBody')}
              />
              <div className="action-row" style={{ marginTop: 10, flexWrap: 'wrap' }}>
                <button
                  className="btn primary small"
                  onClick={() => void submitReview('APPROVE')}
                  disabled={busy === 'review'}
                >
                  <CheckCircle2 size={13} />
                  {t('pulls.approve')}
                </button>
                <button
                  className="btn small"
                  onClick={() => void submitReview('REQUEST_CHANGES')}
                  disabled={busy === 'review'}
                >
                  {t('pulls.requestChanges')}
                </button>
                <button
                  className="btn small ghost"
                  onClick={() => void submitReview('COMMENT')}
                  disabled={busy === 'review'}
                >
                  {t('pulls.reviewComment')}
                </button>
              </div>
            </section>
          ) : null}

          {isPull ? (
            <section className="card">
              <div className="card-head">
                <div className="card-title">
                  <GitPullRequest size={15} />
                  {t('pulls.changes')}
                </div>
                <div className="row" style={{ gap: 10 }}>
                  <div className="segmented">
                    <button
                      className={diffMode === 'files' ? 'active' : ''}
                      onClick={() => {
                        setDiffMode('files')
                        setSelectedCommit(null)
                      }}
                    >
                      {t('pulls.filesTab')}
                    </button>
                    <button
                      className={diffMode === 'commits' ? 'active' : ''}
                      onClick={() => setDiffMode('commits')}
                    >
                      {t('pulls.commitsTab')}
                    </button>
                    <button
                      className={diffMode === 'checks' ? 'active' : ''}
                      onClick={() => setDiffMode('checks')}
                    >
                      {L('Checks', '检查')}
                      {checks.data?.total_count ? <span className="count">{checks.data.total_count}</span> : null}
                    </button>
                  </div>
                  {diffMode === 'files' && files.data ? (
                    <div className="diff-stat">
                      <span className="plus">+{files.data.reduce((sum, file) => sum + file.additions, 0)}</span>
                      <span className="minus">-{files.data.reduce((sum, file) => sum + file.deletions, 0)}</span>
                    </div>
                  ) : null}
                </div>
              </div>
              {diffMode === 'commits' ? (
                selectedCommit ? (
                  <>
                    <div className="commit-diff-bar">
                      <button className="btn small ghost" onClick={() => setSelectedCommit(null)}>
                        <ArrowLeft size={13} />
                        {t('pulls.backToCommits')}
                      </button>
                      <span className="badge mono">{selectedCommit.slice(0, 7)}</span>
                    </div>
                    <CommitDiff
                      owner={owner}
                      repo={repo}
                      prNumber={number}
                      sha={selectedCommit}
                      comments={reviewComments.data || []}
                      threads={threadMap}
                      onChanged={refreshAll}
                      onThreadsChanged={reviewThreads.reload}
                    />
                  </>
                ) : pullCommits.loading ? (
                  <LoadingBlock />
                ) : pullCommits.error ? (
                  <div style={{ padding: 16 }}>
                    <ErrorBlock message={pullCommits.error} onRetry={pullCommits.reload} />
                  </div>
                ) : !pullCommits.data?.length ? (
                  <div className="readme-empty">{t('pulls.noCommits')}</div>
                ) : (
                  <div className="commit-list">
                    {pullCommits.data.map((commit) => (
                      <button
                        className="commit-row"
                        key={commit.sha}
                        onClick={() => setSelectedCommit(commit.sha)}
                      >
                        <span className="badge mono">{commit.sha.slice(0, 7)}</span>
                        <span className="commit-msg">{commit.commit.message.split('\n')[0]}</span>
                        <span className="muted commit-author">
                          {commit.author?.login || commit.commit.author?.name || ''}
                        </span>
                      </button>
                    ))}
                  </div>
                )
              ) : diffMode === 'checks' ? (
                checks.loading ? (
                  <LoadingBlock />
                ) : checks.error ? (
                  <div style={{ padding: 16 }}>
                    <ErrorBlock message={checks.error} onRetry={checks.reload} />
                  </div>
                ) : !checks.data?.check_runs?.length ? (
                  <div className="readme-empty">{L('No checks reported on this pull request', '该拉取请求没有检查记录')}</div>
                ) : (
                  <div className="commit-list">
                    {checks.data.check_runs.map((run) => {
                      const tone =
                        run.status !== 'completed'
                          ? 'gold'
                          : run.conclusion === 'success'
                            ? 'green'
                            : run.conclusion === 'failure' || run.conclusion === 'timed_out'
                              ? 'red'
                              : ''
                      const label = run.status !== 'completed' ? run.status : run.conclusion || 'neutral'
                      return (
                        <button
                          className="commit-row"
                          key={run.id}
                          onClick={() => void openExternal(run.html_url)}
                        >
                          <span className={tone ? `badge ${tone}` : 'badge'}>{label}</span>
                          <span className="commit-msg">{run.name}</span>
                          <span className="muted commit-author">
                            {run.completed_at ? <TimeAgo iso={run.completed_at} /> : null}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )
              ) : files.loading ? (
                <LoadingBlock />
              ) : files.error ? (
                <div style={{ padding: 16 }}>
                  <ErrorBlock message={files.error} onRetry={files.reload} />
                </div>
              ) : !files.data?.length ? (
                <div className="readme-empty">{t('pulls.noPatch')}</div>
              ) : (
                <div className="diff-with-tree">
                  <aside className="diff-tree">
                    {fileTree.map(([dir, items]) => (
                      <div className="diff-tree-group" key={dir || 'root'}>
                        {dir ? <div className="diff-tree-dir">{dir}</div> : null}
                        {items.map((item) => (
                          <button
                            className="diff-tree-file"
                            key={item.path}
                            title={item.path}
                            onClick={() => scrollToFile(item.path)}
                          >
                            {item.name}
                          </button>
                        ))}
                      </div>
                    ))}
                  </aside>
                  <ReviewDiff
                    owner={owner}
                    repo={repo}
                    prNumber={number}
                    commitId={pull.data?.head.sha || ''}
                    files={files.data}
                    comments={reviewComments.data || []}
                    threads={threadMap}
                    onChanged={refreshAll}
                    onThreadsChanged={reviewThreads.reload}
                  />
                </div>
              )}
            </section>
          ) : null}
        </div>

        <aside style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <section className="card side-card">
            <div className="side-section">
              <div className="side-label">{t('issues.author')}</div>
              <div className="row">
                {data.user ? <Avatar user={data.user} size={28} /> : null}
                <div>
                  <div style={{ fontWeight: 600, fontSize: 12.5 }}>{data.user?.login}</div>
                  <div className="muted" style={{ fontSize: 11 }}>
                    {formatDate(data.user?.created_at, lang)}
                  </div>
                </div>
              </div>
            </div>

            {data.labels?.length ? (
              <div className="side-section">
                <div className="side-label">{t('issues.labels')}</div>
                <div className="chip-row">
                  {data.labels.map((label) => (
                    <span
                      className="label-chip"
                      key={label.name}
                      style={{
                        background: `#${label.color}`,
                        color: '#fff',
                        textShadow: '0 1px 2px rgba(0,0,0,.35)',
                      }}
                    >
                      {label.name}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            {subIssues.data?.length ? (
              <div className="side-section">
                <div className="side-label">
                  {t('issues.subIssues')} · {subIssues.data.length}
                </div>
                {subIssues.data.map((item) => (
                  <button
                    className="issue-mini"
                    key={item.id}
                    onClick={() => navigate({ name: 'issue', owner, repo, number: item.number, kind: 'issue' })}
                  >
                    <CircleDot size={11} />
                    <span className="truncate">
                      #{item.number} {item.title}
                    </span>
                    <span className="muted" style={{ fontSize: 10 }}>
                      {item.state}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}

            {blockedBy.data?.length ? (
              <div className="side-section">
                <div className="side-label">
                  {t('issues.blockedBy')} · {blockedBy.data.length}
                </div>
                {blockedBy.data.map((item) => (
                  <button
                    className="issue-mini"
                    key={item.id}
                    onClick={() => navigate({ name: 'issue', owner, repo, number: item.number, kind: 'issue' })}
                  >
                    <CircleDot size={11} />
                    <span className="truncate">
                      #{item.number} {item.title}
                    </span>
                    <span className="muted" style={{ fontSize: 10 }}>
                      {item.state}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}

            <div className="side-section">
              <div className="side-label">{t('notifications.repository')}</div>
              <button className="btn small" onClick={() => navigate({ name: 'repo', owner, repo })}>
                {owner}/{repo}
              </button>
            </div>

            <div className="side-section">
              <div className="side-label">{t('issues.conversation')}</div>
              <div className="row muted" style={{ fontSize: 12 }}>
                <MessageSquare size={13} />
                {t('issues.comments', { n: data.comments || 0 })}
              </div>
            </div>

            {isPull && pull.data ? (
              <div className="side-section">
                <div className="side-label">{t('pulls.pullRequest')}</div>
                <div className="kv">
                  <span>{t('pulls.from')}</span>
                  <span className="mono">{pull.data.head.ref}</span>
                </div>
                <div className="kv">
                  <span>{t('pulls.into')}</span>
                  <span className="mono">{pull.data.base.ref}</span>
                </div>
                <div className="kv">
                  <span>{t('pulls.filesChanged', { n: pull.data.changed_files })}</span>
                </div>
                <div className="kv">
                  <span>{t('pulls.commits', { n: pull.data.commits })}</span>
                </div>
                <div className="diff-stat" style={{ marginTop: 8 }}>
                  <span className="plus">+{pull.data.additions}</span>
                  <span className="minus">-{pull.data.deletions}</span>
                </div>
              </div>
            ) : null}

            {isPull && pull.data ? (
              <div className="side-section">
                <div className="side-label">{L('Reviewers', '审查者')}</div>
                {((pull.data as any).requested_reviewers || []).length ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
                    {((pull.data as any).requested_reviewers as GhUser[]).map((person) => (
                      <div className="row" key={person.id} style={{ gap: 6 }}>
                        <Avatar user={person} size={18} />
                        <span style={{ fontSize: 12 }}>{person.login}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
                {authenticated && !merged ? (
                  <div className="row" style={{ gap: 6 }}>
                    <select
                      className="select"
                      value={reviewer}
                      onChange={(event) => setReviewer(event.target.value)}
                      aria-label={L('Request review', '请求审查')}
                    >
                      <option value="">{L('Request review…', '请求审查…')}</option>
                      {(repoAssignees.data || []).map((person) => (
                        <option key={person.id} value={person.login}>
                          {person.login}
                        </option>
                      ))}
                    </select>
                    <button
                      className="btn small"
                      onClick={() => void requestReview()}
                      disabled={!reviewer || busy === 'reviewer'}
                    >
                      {busy === 'reviewer' ? <span className="spinner" /> : null}
                      {L('Request', '请求')}
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}

            {isPull && !merged && data.state === 'open' ? (
              <div className="side-section">
                <div className="side-label">
                  <GitMerge size={12} /> {t('pulls.merge')}
                </div>
                {authenticated ? (
                  <>
                    <select
                      className="select"
                      style={{ marginBottom: 8 }}
                      value={mergeMethod}
                      onChange={(event) => setMergeMethod(event.target.value)}
                    >
                      <option value="merge">{t('pulls.mergeMethodMerge')}</option>
                      <option value="squash">{t('pulls.mergeMethodSquash')}</option>
                      <option value="rebase">{t('pulls.mergeMethodRebase')}</option>
                    </select>
                    {notMergeable ? (
                      <div className="field-hint" style={{ color: 'var(--red)', marginBottom: 8 }}>
                        {L(
                          'This branch has conflicts that must be resolved before merging.',
                          '该分支存在冲突，解决后才能合并。',
                        )}
                      </div>
                    ) : null}
                    {needsUpdate ? (
                      <button
                        className="btn block"
                        style={{ marginBottom: 8 }}
                        onClick={() => void updateBranch()}
                        disabled={busy === 'update-branch'}
                      >
                        {busy === 'update-branch' ? <span className="spinner" /> : <GitMerge size={14} />}
                        {L('Update branch', '更新分支')}
                      </button>
                    ) : null}
                    <button
                      className="btn primary block"
                      onClick={() => void mergePull()}
                      disabled={busy === 'merge' || notMergeable}
                    >
                      {busy === 'merge' ? <span className="spinner" /> : <GitMerge size={14} />}
                      {t('pulls.merge')}
                    </button>
                  </>
                ) : (
                  <button className="btn block" onClick={openLogin}>
                    {t('pulls.mergeLogin')}
                  </button>
                )}
              </div>
            ) : null}
          </section>
        </aside>
      </div>

      {manageOpen ? (
        <Modal
          title={t('issues.manage')}
          onClose={() => setManageOpen(false)}
          footer={
            <button className="btn ghost" onClick={() => setManageOpen(false)}>
              {t('app.close')}
            </button>
          }
        >
          <div className="field">
            <label className="field-label">{data.locked ? t('issues.unlock') : t('issues.lock')}</label>
            {!data.locked ? (
              <select className="select" value={lockReason} onChange={(event) => setLockReason(event.target.value)}>
                <option value="resolved">{t('issues.lockResolved')}</option>
                <option value="off-topic">{t('issues.lockOffTopic')}</option>
                <option value="too heated">{t('issues.lockTooHeated')}</option>
                <option value="spam">{t('issues.lockSpam')}</option>
              </select>
            ) : null}
            <div className="action-row" style={{ marginTop: 8 }}>
              <button className="btn" onClick={() => void toggleLock()} disabled={manageBusy !== null}>
                {manageBusy === 'lock' ? <span className="spinner" /> : null}
                {data.locked ? t('issues.unlock') : t('issues.lock')}
              </button>
            </div>
          </div>

          {!isPull ? (
            <>
              <div className="field" style={{ marginTop: 16 }}>
                <label className="field-label">{t('issues.transfer')}</label>
                <div className="row">
                  <input
                    className="input mono"
                    value={transferRepo}
                    onChange={(event) => setTransferRepo(event.target.value)}
                    placeholder="owner/repo"
                    spellCheck={false}
                  />
                  <button
                    className="btn"
                    onClick={() => void transferIssue()}
                    disabled={!transferRepo.trim() || manageBusy !== null}
                  >
                    {manageBusy === 'transfer' ? <span className="spinner" /> : null}
                    {t('issues.transferAction')}
                  </button>
                </div>
                <div className="field-hint">{t('issues.transferHint')}</div>
              </div>

              <div className="danger-zone">
                <div className="row" style={{ gap: 8, color: 'var(--red)', fontWeight: 650, fontSize: 13 }}>
                  <Settings2 size={14} />
                  {t('issues.deleteIssue')}
                </div>
                <p className="field-hint" style={{ margin: '6px 0 10px' }}>
                  {t('issues.deleteConfirm')}
                </p>
                <button className="btn danger" onClick={() => void deleteIssue()} disabled={manageBusy !== null}>
                  {manageBusy === 'delete' ? <span className="spinner" /> : null}
                  {t('issues.deleteIssue')}
                </button>
              </div>
            </>
          ) : null}
        </Modal>
      ) : null}

      {editOpen ? (
        <Modal
          wide
          title={t('issues.editTitle')}
          onClose={() => setEditOpen(false)}
          footer={
            <>
              <button className="btn ghost" onClick={() => setEditOpen(false)}>
                {t('app.cancel')}
              </button>
              <button className="btn primary" onClick={() => void saveEdit()} disabled={busy === 'edit'}>
                {busy === 'edit' ? <span className="spinner" /> : null}
                {t('common.save')}
              </button>
            </>
          }
        >
          <div className="field" style={{ marginBottom: 12 }}>
            <label className="field-label">{t('issues.titleField')}</label>
            <input className="input" value={editTitle} onChange={(event) => setEditTitle(event.target.value)} />
          </div>
          <div className="field">
            <label className="field-label">{t('issues.bodyField')}</label>
            <textarea
              className="textarea"
              style={{ minHeight: 180 }}
              value={editBody}
              onChange={(event) => setEditBody(event.target.value)}
            />
          </div>
          <div className="field" style={{ marginTop: 12 }}>
            <label className="field-label">{t('issues.labels')}</label>
            {repoLabels.loading ? (
              <div className="field-hint">{t('app.loading')}</div>
            ) : repoLabels.data?.length ? (
              <div className="chip-row" style={{ gap: 10 }}>
                {repoLabels.data.map((label) => (
                  <label className="row" key={label.name} style={{ gap: 5, fontSize: 12, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={editLabels.includes(label.name)}
                      onChange={(event) =>
                        setEditLabels((prev) =>
                          event.target.checked
                            ? [...prev, label.name]
                            : prev.filter((name) => name !== label.name),
                        )
                      }
                    />
                    <span
                      className="label-chip"
                      style={{
                        background: `#${label.color}`,
                        color: '#fff',
                        textShadow: '0 1px 2px rgba(0,0,0,.35)',
                      }}
                    >
                      {label.name}
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <div className="field-hint">{t('app.none')}</div>
            )}
          </div>
          <div className="field" style={{ marginTop: 12 }}>
            <label className="field-label">{t('repo.assignees')}</label>
            {repoAssignees.loading ? (
              <div className="field-hint">{t('app.loading')}</div>
            ) : repoAssignees.data?.length ? (
              <div className="chip-row" style={{ gap: 10 }}>
                {repoAssignees.data.map((user) => (
                  <label className="row" key={user.login} style={{ gap: 5, fontSize: 12, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={editAssignees.includes(user.login)}
                      onChange={(event) =>
                        setEditAssignees((prev) =>
                          event.target.checked
                            ? [...prev, user.login]
                            : prev.filter((login) => login !== user.login),
                        )
                      }
                    />
                    <Avatar user={user} size={18} />
                    {user.login}
                  </label>
                ))}
              </div>
            ) : (
              <div className="field-hint">{t('app.none')}</div>
            )}
          </div>
          <div className="field" style={{ marginTop: 12 }}>
            <label className="field-label">{t('repo.milestone')}</label>
            <select
              className="select"
              value={editMilestone}
              onChange={(event) => setEditMilestone(event.target.value)}
            >
              <option value="">{t('app.none')}</option>
              {(repoMilestones.data || []).map((milestone) => (
                <option key={milestone.number} value={milestone.number}>
                  {milestone.title}
                </option>
              ))}
            </select>
          </div>
        </Modal>
      ) : null}
    </div>
  )
}
