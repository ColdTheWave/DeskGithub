import { useState } from 'react'
import { ArrowLeft, Code2, Copy, ExternalLink, MessageSquare, Send } from 'lucide-react'
import { useApp } from '../lib/store'
import { useGh } from '../lib/hooks'
import { apiErrorMessage, gh } from '../lib/api'
import { Avatar, Badge, ErrorBlock, LoadingBlock, TimeAgo } from '../components/ui'
import { DiffFiles } from '../components/DiffFiles'
import { Markdown } from '../components/Markdown'
import { Reactions } from '../components/Reactions'
import type { GhComment, GhCommit } from '../lib/types'
import { formatDate } from '../lib/format'
import { copyText, openExternal } from '../lib/desktop'

type CheckRun = {
  id: number
  name: string
  status: string
  conclusion: string | null
  html_url: string
  completed_at: string | null
}

export function CommitDetailPage({ owner, repo, sha }: { owner: string; repo: string; sha: string }) {
  const { t, lang, navigate, authenticated, openLogin, toast } = useApp()
  const L = (en: string, zh: string) => (lang === 'zh' ? zh : en)
  const commit = useGh<GhCommit>(`/repos/${owner}/${repo}/commits/${sha}`)
  const checks = useGh<{ total_count: number; check_runs: CheckRun[] }>(
    `/repos/${owner}/${repo}/commits/${sha}/check-runs?per_page=100`,
  )
  const comments = useGh<GhComment[]>(`/repos/${owner}/${repo}/commits/${sha}/comments?per_page=100`)
  const [commentText, setCommentText] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  if (commit.loading) return <LoadingBlock />
  if (commit.error || !commit.data) {
    return (
      <div className="page">
        <div className="card card-body">
          <ErrorBlock message={commit.error || t('app.error')} onRetry={commit.reload} />
        </div>
      </div>
    )
  }

  const data = commit.data
  const lines = (data.commit?.message || '').split('\n')
  const title = lines[0]
  const body = lines.slice(1).join('\n').trim()

  const copySha = async () => {
    const ok = await copyText(data.sha)
    toast(
      ok ? L('Commit SHA copied', '已复制提交 SHA') : L('Could not copy SHA', '复制 SHA 失败'),
      ok ? 'success' : 'error',
    )
  }

  const postComment = async () => {
    if (!commentText.trim()) return
    setBusy('comment')
    const res = await gh(`/repos/${owner}/${repo}/commits/${sha}/comments`, {
      method: 'POST',
      body: { body: commentText.trim() },
    })
    setBusy(null)
    if (res.ok) {
      setCommentText('')
      toast(L('Comment posted', '评论已发布'), 'success')
      comments.reload()
    } else {
      toast(apiErrorMessage(res.data, t('app.requestFailed', { status: res.status })), 'error')
    }
  }

  return (
    <div className="page">
      <button className="btn ghost" style={{ alignSelf: 'flex-start' }} onClick={() => navigate({ name: 'repo', owner, repo })}>
        <ArrowLeft size={14} />
        {owner}/{repo}
      </button>

      <div className="page-head" style={{ alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <div className="row wrap" style={{ gap: 8 }}>
            <Badge tone="blue" >{t('repo.commits')}</Badge>
            <span className="badge mono">{sha.slice(0, 10)}</span>
          </div>
          <h1 className="page-title" style={{ marginTop: 10 }}>
            {title}
          </h1>
          <div className="row wrap" style={{ gap: 10, marginTop: 8, color: 'var(--muted)', fontSize: 12 }}>
            {data.author ? <Avatar user={data.author} size={22} /> : null}
            <span>{data.commit?.author?.name || data.author?.login}</span>
            <span>{formatDate(data.commit?.author?.date, lang)}</span>
            <span>
              <TimeAgo iso={data.commit?.author?.date} />
            </span>
          </div>
        </div>
        <div className="page-actions">
          <button className="btn" onClick={() => void copySha()}>
            <Copy size={14} />
            {L('Copy SHA', '复制 SHA')}
          </button>
          <button className="btn" onClick={() => void openExternal(`https://github.com/${owner}/${repo}/tree/${sha}`)}>
            <Code2 size={14} />
            {L('Browse code', '浏览提交代码')}
          </button>
          <button className="btn" onClick={() => void openExternal(data.html_url)}>
            <ExternalLink size={14} />
            {t('app.openInBrowser')}
          </button>
        </div>
      </div>

      {checks.data?.check_runs?.length ? (
        <section className="card">
          <div className="card-head">
            <div className="card-title">{L('Checks', '检查')}</div>
            <Badge>{checks.data.check_runs.length}</Badge>
          </div>
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
                <button className="commit-row" key={run.id} onClick={() => void openExternal(run.html_url)}>
                  <span className={tone ? `badge ${tone}` : 'badge'}>{label}</span>
                  <span className="commit-msg">{run.name}</span>
                  <span className="muted commit-author">
                    {run.completed_at ? <TimeAgo iso={run.completed_at} /> : null}
                  </span>
                </button>
              )
            })}
          </div>
        </section>
      ) : null}

      <section className="card">
        <div className="card-head">
          <div className="card-title">{t('pulls.changes')}</div>
          {data.stats ? (
            <div className="diff-stat">
              <span className="plus">+{data.stats.additions}</span>
              <span className="minus">-{data.stats.deletions}</span>
              <span className="muted">{data.stats.total} total</span>
            </div>
          ) : null}
        </div>
        {body ? (
          <pre className="commit-message">{body}</pre>
        ) : null}
        {data.files?.length ? (
          <DiffFiles files={data.files} noPatchLabel={t('pulls.noPatch')} />
        ) : (
          <div className="readme-empty">{t('pulls.noPatch')}</div>
        )}
      </section>

      <div className="section-title">
        {L('Comments', '评论')} · {comments.data?.length || 0}
      </div>

      {comments.loading ? (
        <LoadingBlock />
      ) : comments.error ? (
        <div className="card card-body">
          <ErrorBlock message={comments.error} onRetry={comments.reload} />
        </div>
      ) : !comments.data?.length ? (
        <div className="card card-body muted" style={{ fontSize: 12.5 }}>
          {L('No comments yet', '还没有评论')}
        </div>
      ) : (
        comments.data.map((comment) => (
          <section className="card comment" key={comment.id} style={{ marginTop: 0 }}>
            <div className="comment-head">
              {comment.user ? <Avatar user={comment.user} size={20} /> : null}
              <strong>{comment.user?.login}</strong>
              <span>{formatDate(comment.created_at, lang)}</span>
              {comment.path ? <span className="badge blue mono">{comment.path}</span> : null}
            </div>
            <div className="comment-body">
              <Markdown markdown={comment.body || ''} owner={owner} repo={repo} />
              <Reactions
                endpoint={`/repos/${owner}/${repo}/comments/${comment.id}/reactions`}
                summary={comment.reactions}
                onChanged={comments.reload}
              />
            </div>
          </section>
        ))
      )}

      {authenticated ? (
        <section className="card card-body">
          <div className="card-title" style={{ marginBottom: 10 }}>
            <MessageSquare size={15} />
            {L('Add a comment', '发表评论')}
          </div>
          <textarea
            className="textarea"
            value={commentText}
            onChange={(event) => setCommentText(event.target.value)}
            placeholder={L('Leave a comment on this commit', '对这个提交发表评论')}
          />
          <div className="action-row" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
            <button
              className="btn primary"
              onClick={() => void postComment()}
              disabled={busy === 'comment' || !commentText.trim()}
            >
              {busy === 'comment' ? <span className="spinner" /> : <Send size={14} />}
              {L('Comment', '评论')}
            </button>
          </div>
        </section>
      ) : (
        <div className="note">
          <MessageSquare size={14} />
          <span style={{ flex: 1 }}>{L('Sign in to comment on this commit', '登录后可以对该提交发表评论')}</span>
          <button className="btn small" onClick={openLogin}>
            {t('app.signIn')}
          </button>
        </div>
      )}
    </div>
  )
}
