import { useEffect, useState } from 'react'
import {
  ArrowBigUp,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  MessageSquare,
  MessagesSquare,
  Pencil,
  Plus,
  Reply,
  Send,
  SmilePlus,
  Trash2,
} from 'lucide-react'
import { useApp } from '../../lib/store'
import { gql } from '../../lib/api'
import { useGql } from '../../lib/hooks'
import {
  Avatar,
  Badge,
  EmptyState,
  ErrorBlock,
  LoadingBlock,
  LockGate,
  Modal,
  TimeAgo,
} from '../../components/ui'
import { Markdown } from '../../components/Markdown'
import { openExternal } from '../../lib/desktop'

type Author = { login: string; avatarUrl: string }

type Summary = {
  id: string
  number: number
  title: string
  updatedAt: string
  upvoteCount: number
  url: string
  category: { name: string } | null
  author: Author | null
  comments: { totalCount: number }
}

type PageInfo = { hasNextPage: boolean; endCursor: string | null }

type ListData = {
  repository: {
    hasDiscussionsEnabled: boolean
    discussions: { nodes: Summary[]; pageInfo: PageInfo }
  } | null
}

type ReactionGroup = { content: string; viewerHasReacted: boolean; users: { totalCount: number } }

type CommentCore = {
  id: string
  body: string
  createdAt: string
  isAnswer: boolean
  author: Author | null
  reactionGroups: ReactionGroup[] | null
}

type ReplyNode = CommentCore

type CommentNode = CommentCore & { replies: { totalCount: number; nodes: ReplyNode[] } }

type Detail = {
  id: string
  number: number
  title: string
  body: string
  createdAt: string
  url: string
  upvoteCount: number
  viewerHasUpvoted: boolean
  category: { id: string; name: string; isAnswerable: boolean } | null
  author: Author | null
  answer: { id: string } | null
  reactionGroups: ReactionGroup[] | null
  comments: { nodes: CommentNode[] }
}

type DetailData = {
  repository: { viewerPermission: string | null; discussion: Detail | null } | null
}

type CategoriesData = {
  repository: {
    id: string
    hasDiscussionsEnabled: boolean
    discussionCategories: { nodes: { id: string; name: string }[] }
  } | null
}

const LIST_QUERY = `
query($owner:String!, $name:String!, $after:String, $categoryId:ID){
  repository(owner:$owner, name:$name){
    hasDiscussionsEnabled
    discussions(first:30, after:$after, categoryId:$categoryId, orderBy:{field:UPDATED_AT, direction:DESC}){
      nodes{
        id number title updatedAt upvoteCount url category{ name }
        author{ login avatarUrl }
        comments{ totalCount }
      }
      pageInfo{ hasNextPage endCursor }
    }
  }
}`

const DETAIL_QUERY = `
query($owner:String!, $name:String!, $number:Int!){
  repository(owner:$owner, name:$name){
    viewerPermission
    discussion(number:$number){
      id number title body createdAt url upvoteCount viewerHasUpvoted
      category{ id name isAnswerable }
      author{ login avatarUrl }
      answer{ id }
      reactionGroups{ content viewerHasReacted users{ totalCount } }
      comments(first:100){
        nodes{
          id body createdAt isAnswer
          author{ login avatarUrl }
          reactionGroups{ content viewerHasReacted users{ totalCount } }
          replies(first:100){
            totalCount
            nodes{
              id body createdAt isAnswer
              author{ login avatarUrl }
              reactionGroups{ content viewerHasReacted users{ totalCount } }
            }
          }
        }
      }
    }
  }
}`

const CATEGORIES_QUERY = `
query($owner:String!, $name:String!){
  repository(owner:$owner, name:$name){
    id
    hasDiscussionsEnabled
    discussionCategories(first:50){ nodes{ id name } }
  }
}`

const COMMENT_MUTATION = `
mutation($discussionId:ID!, $body:String!, $replyToId:ID){
  addDiscussionComment(input:{discussionId:$discussionId, body:$body, replyToId:$replyToId}){
    comment{ id }
  }
}`

const CREATE_MUTATION = `
mutation($repositoryId:ID!, $categoryId:ID!, $title:String!, $body:String!){
  createDiscussion(input:{repositoryId:$repositoryId, categoryId:$categoryId, title:$title, body:$body}){
    discussion{ number }
  }
}`

const UPDATE_DISCUSSION_MUTATION = `
mutation($discussionId:ID!, $title:String!, $body:String!, $categoryId:ID){
  updateDiscussion(input:{discussionId:$discussionId, title:$title, body:$body, categoryId:$categoryId}){
    discussion{ id title body category{ id name } }
  }
}`

const DELETE_DISCUSSION_MUTATION = `
mutation($id:ID!){
  deleteDiscussion(input:{id:$id}){
    discussion{ id }
  }
}`

const UPDATE_COMMENT_MUTATION = `
mutation($commentId:ID!, $body:String!){
  updateDiscussionComment(input:{commentId:$commentId, body:$body}){
    comment{ id body }
  }
}`

const DELETE_COMMENT_MUTATION = `
mutation($id:ID!){
  deleteDiscussionComment(input:{id:$id}){
    comment{ id }
  }
}`

const MARK_ANSWER_MUTATION = `
mutation($id:ID!){
  markDiscussionCommentAsAnswer(input:{id:$id}){
    discussion{ id }
  }
}`

const UNMARK_ANSWER_MUTATION = `
mutation($id:ID!){
  unmarkDiscussionCommentAsAnswer(input:{id:$id}){
    discussion{ id }
  }
}`

const ADD_UPVOTE_MUTATION = `
mutation($subjectId:ID!){
  addUpvote(input:{subjectId:$subjectId}){
    subject{ upvoteCount viewerHasUpvoted }
  }
}`

const REMOVE_UPVOTE_MUTATION = `
mutation($subjectId:ID!){
  removeUpvote(input:{subjectId:$subjectId}){
    subject{ upvoteCount viewerHasUpvoted }
  }
}`

const ADD_REACTION_MUTATION = `
mutation($subjectId:ID!, $content:ReactionContent!){
  addReaction(input:{subjectId:$subjectId, content:$content}){
    reaction{ content }
  }
}`

const REMOVE_REACTION_MUTATION = `
mutation($subjectId:ID!, $content:ReactionContent!){
  removeReaction(input:{subjectId:$subjectId, content:$content}){
    reaction{ content }
  }
}`

const REACTIONS = [
  { content: '+1', emoji: '👍' },
  { content: '-1', emoji: '👎' },
  { content: 'laugh', emoji: '😄' },
  { content: 'hooray', emoji: '🎉' },
  { content: 'confused', emoji: '😕' },
  { content: 'heart', emoji: '❤️' },
  { content: 'rocket', emoji: '🚀' },
  { content: 'eyes', emoji: '👀' },
] as const

export function DiscussionsTab({ owner, repo }: { owner: string; repo: string }) {
  const { t, lang, authenticated, openLogin, toast } = useApp()
  const L = (en: string, zh: string) => (lang === 'zh' ? zh : en)
  const [categoryId, setCategoryId] = useState('')
  const [extra, setExtra] = useState<{ nodes: Summary[]; endCursor: string | null; hasNext: boolean }>({
    nodes: [],
    endCursor: null,
    hasNext: false,
  })
  const [moreBusy, setMoreBusy] = useState(false)
  const list = useGql<ListData>(
    authenticated ? LIST_QUERY : null,
    { owner, name: repo, after: null, categoryId: categoryId || null },
    [authenticated],
  )
  const categories = useGql<CategoriesData>(
    authenticated ? CATEGORIES_QUERY : null,
    { owner, name: repo },
    [authenticated],
  )
  const [selected, setSelected] = useState<Summary | null>(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    setExtra({ nodes: [], endCursor: null, hasNext: false })
  }, [list.data, categoryId])

  if (!authenticated) {
    return (
      <div style={{ padding: 16 }}>
        <LockGate title={t('discussions.title')} text={t('discussions.login')} onSignIn={openLogin} />
      </div>
    )
  }

  const page = list.data?.repository?.discussions
  const nodes = [...(page?.nodes || []), ...extra.nodes]
  const enabled = list.data?.repository?.hasDiscussionsEnabled ?? true
  const hasNext = extra.endCursor ? extra.hasNext : Boolean(page?.pageInfo.hasNextPage)
  const categoryOptions = categories.data?.repository?.discussionCategories?.nodes || []

  const loadMore = async () => {
    if (!page || moreBusy) return
    setMoreBusy(true)
    const res = await gql<ListData>(LIST_QUERY, {
      owner,
      name: repo,
      after: extra.endCursor || page.pageInfo.endCursor,
      categoryId: categoryId || null,
    })
    setMoreBusy(false)
    if (!res.ok) {
      toast(res.error || L('Failed to load more', '加载更多失败'), 'error')
      return
    }
    const next = res.data?.repository?.discussions
    if (!next) return
    setExtra((prev) => ({
      nodes: [...prev.nodes, ...next.nodes],
      endCursor: next.pageInfo.endCursor,
      hasNext: next.pageInfo.hasNextPage,
    }))
  }

  return (
    <div>
      <div className="card-head" style={{ padding: '12px 16px' }}>
        <div className="card-title">
          <MessagesSquare size={15} />
          {t('discussions.title')}
        </div>
        <div className="row" style={{ gap: 8 }}>
          {categoryOptions.length ? (
            <select
              className="select"
              style={{ height: 28, width: 150 }}
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              aria-label={t('discussions.category')}
            >
              <option value="">{L('All categories', '全部分类')}</option>
              {categoryOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          ) : null}
          <button className="btn small primary" onClick={() => setCreating(true)} disabled={!enabled}>
            <Plus size={13} />
            {t('discussions.new')}
          </button>
        </div>
      </div>

      {list.loading ? (
        <LoadingBlock />
      ) : list.error ? (
        <div style={{ padding: 16 }}>
          <ErrorBlock message={list.error} onRetry={list.reload} />
        </div>
      ) : !enabled ? (
        <EmptyState icon={<MessagesSquare size={20} />} title={t('discussions.disabled')} />
      ) : nodes.length === 0 ? (
        <EmptyState icon={<MessagesSquare size={20} />} title={t('discussions.empty')} />
      ) : (
        <>
          <div className="list">
            {nodes.map((item) => (
              <button className="list-item" key={item.id} onClick={() => setSelected(item)}>
                <MessagesSquare size={17} color="var(--muted)" />
                <div className="item-main">
                  <div className="item-title">
                    {item.category?.name ? <Badge tone="blue">{item.category.name}</Badge> : null}
                    <span className="truncate">{item.title}</span>
                    <span className="muted" style={{ fontWeight: 500 }}>
                      #{item.number}
                    </span>
                  </div>
                  <div className="item-meta">
                    {item.author ? (
                      <span className="row" style={{ gap: 5 }}>
                        <Avatar url={item.author.avatarUrl} size={15} /> {item.author.login}
                      </span>
                    ) : null}
                    <span>
                      <MessageSquare size={11} /> {item.comments.totalCount}
                    </span>
                    <span>
                      <ArrowBigUp size={11} /> {item.upvoteCount}
                    </span>
                    <span>
                      <TimeAgo iso={item.updatedAt} />
                    </span>
                  </div>
                </div>
                <ExternalLink size={13} color="var(--muted)" />
              </button>
            ))}
          </div>
          {hasNext ? (
            <div style={{ padding: '0 16px 14px', display: 'flex', justifyContent: 'center' }}>
              <button className="btn small" onClick={() => void loadMore()} disabled={moreBusy}>
                {moreBusy ? <span className="spinner" /> : <ChevronDown size={13} />}
                {L('Load more', '加载更多')}
              </button>
            </div>
          ) : null}
        </>
      )}

      {selected ? (
        <DiscussionDetail
          owner={owner}
          repo={repo}
          number={selected.number}
          onClose={() => setSelected(null)}
          onChanged={() => list.reload()}
        />
      ) : null}

      {creating ? (
        <CreateDiscussion
          owner={owner}
          repo={repo}
          onClose={() => setCreating(false)}
          onCreated={() => {
            list.reload()
            toast(t('discussions.created'), 'success')
          }}
        />
      ) : null}
    </div>
  )
}

function ReactionBar({
  subjectId,
  groups,
  onChanged,
}: {
  subjectId: string
  groups: ReactionGroup[]
  onChanged: () => void
}) {
  const { lang, toast } = useApp()
  const L = (en: string, zh: string) => (lang === 'zh' ? zh : en)
  const [busy, setBusy] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)

  const countFor = (content: string) =>
    groups.find((group) => group.content === content)?.users?.totalCount || 0
  const reacted = (content: string) =>
    Boolean(groups.find((group) => group.content === content)?.viewerHasReacted)

  const toggle = async (content: string) => {
    setBusy(content)
    const res = reacted(content)
      ? await gql(REMOVE_REACTION_MUTATION, { subjectId, content })
      : await gql(ADD_REACTION_MUTATION, { subjectId, content })
    setBusy(null)
    if (res.ok) {
      setExpanded(false)
      onChanged()
    } else {
      toast(res.error || L('Reaction failed', '表情回应失败'), 'error')
    }
  }

  const visible = expanded
    ? REACTIONS
    : REACTIONS.filter((reaction) => countFor(reaction.content) > 0)

  return (
    <div className="reactions">
      {visible.map((reaction) => {
        const count = countFor(reaction.content)
        return (
          <button
            key={reaction.content}
            className="reaction-btn"
            title={reaction.content}
            disabled={busy !== null}
            onClick={() => void toggle(reaction.content)}
          >
            <span>{reaction.emoji}</span>
            {count > 0 ? <span>{count}</span> : null}
          </button>
        )
      })}
      <button
        className="reaction-btn add"
        title={expanded ? L('Close', '关闭') : L('Add reaction', '添加表情')}
        onClick={() => setExpanded((value) => !value)}
      >
        <SmilePlus size={13} />
      </button>
    </div>
  )
}

function CommentItem({
  node,
  discussionId,
  owner,
  repo,
  viewerLogin,
  canAnswer,
  answerId,
  nested,
  onChanged,
}: {
  node: CommentCore
  discussionId: string
  owner: string
  repo: string
  viewerLogin: string
  canAnswer: boolean
  answerId?: string | null
  nested?: boolean
  onChanged: () => void
}) {
  const { t, lang, toast } = useApp()
  const L = (en: string, zh: string) => (lang === 'zh' ? zh : en)
  const [busy, setBusy] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(node.body)
  const [replying, setReplying] = useState(false)
  const [replyBody, setReplyBody] = useState('')

  const isOwn = Boolean(viewerLogin && node.author?.login === viewerLogin)
  const isAnswer = answerId ? node.id === answerId : node.isAnswer
  const replies = nested ? [] : ((node as CommentNode).replies?.nodes || [])

  const save = async () => {
    if (!draft.trim()) return
    setBusy('save')
    const res = await gql(UPDATE_COMMENT_MUTATION, { commentId: node.id, body: draft.trim() })
    setBusy(null)
    if (res.ok) {
      setEditing(false)
      toast(L('Comment updated', '评论已更新'), 'success')
      onChanged()
    } else {
      toast(res.error || L('Update failed', '更新失败'), 'error')
    }
  }

  const remove = async () => {
    if (!window.confirm(L('Delete this comment?', '删除这条评论？'))) return
    setBusy('delete')
    const res = await gql(DELETE_COMMENT_MUTATION, { id: node.id })
    setBusy(null)
    if (res.ok) {
      toast(L('Comment deleted', '评论已删除'), 'success')
      onChanged()
    } else {
      toast(res.error || L('Delete failed', '删除失败'), 'error')
    }
  }

  const reply = async () => {
    if (!replyBody.trim()) return
    setBusy('reply')
    const res = await gql(COMMENT_MUTATION, {
      discussionId,
      body: replyBody.trim(),
      replyToId: node.id,
    })
    setBusy(null)
    if (res.ok) {
      setReplyBody('')
      setReplying(false)
      toast(t('discussions.commented'), 'success')
      onChanged()
    } else {
      toast(res.error || L('Reply failed', '回复失败'), 'error')
    }
  }

  const toggleAnswer = async () => {
    setBusy('answer')
    const res = await gql(isAnswer ? UNMARK_ANSWER_MUTATION : MARK_ANSWER_MUTATION, { id: node.id })
    setBusy(null)
    if (res.ok) {
      toast(isAnswer ? L('Answer removed', '已取消答案') : L('Marked as answer', '已标记为答案'), 'success')
      onChanged()
    } else {
      toast(res.error || L('Answer action failed', '答案操作失败'), 'error')
    }
  }

  return (
    <>
      <div className="comment" style={{ marginTop: nested ? 8 : 0, marginLeft: nested ? 20 : 0 }}>
        <div className="comment-head">
          {node.author ? <Avatar url={node.author.avatarUrl} size={18} /> : null}
          <strong>{node.author?.login}</strong>
          <span>
            <TimeAgo iso={node.createdAt} />
          </span>
          {isAnswer ? <Badge tone="green">{L('Answer', '答案')}</Badge> : null}
          <span className="spacer" />
          {!nested && canAnswer ? (
            <button
              className="icon-btn ghost"
              title={isAnswer ? L('Unmark answer', '取消答案') : L('Mark as answer', '标记为答案')}
              onClick={() => void toggleAnswer()}
              disabled={busy !== null}
            >
              {busy === 'answer' ? <span className="spinner" /> : <CheckCircle2 size={13} />}
            </button>
          ) : null}
          {!nested ? (
            <button
              className="icon-btn ghost"
              title={L('Reply', '回复')}
              onClick={() => setReplying((value) => !value)}
            >
              <Reply size={13} />
            </button>
          ) : null}
          {isOwn ? (
            <>
              <button
                className="icon-btn ghost"
                title={L('Edit comment', '编辑评论')}
                onClick={() => {
                  setDraft(node.body)
                  setEditing(true)
                }}
              >
                <Pencil size={13} />
              </button>
              <button
                className="icon-btn ghost"
                title={L('Delete comment', '删除评论')}
                onClick={() => void remove()}
                disabled={busy !== null}
              >
                <Trash2 size={13} />
              </button>
            </>
          ) : null}
        </div>
        <div className="comment-body">
          {editing ? (
            <div className="field">
              <textarea
                className="textarea"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
              />
              <div className="action-row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
                <button className="btn small ghost" onClick={() => setEditing(false)}>
                  {t('app.cancel')}
                </button>
                <button
                  className="btn small primary"
                  onClick={() => void save()}
                  disabled={busy !== null || !draft.trim()}
                >
                  {busy === 'save' ? <span className="spinner" /> : <Send size={12} />}
                  {t('common.save')}
                </button>
              </div>
            </div>
          ) : (
            <Markdown markdown={node.body} owner={owner} repo={repo} />
          )}
          {!editing ? (
            <ReactionBar subjectId={node.id} groups={node.reactionGroups || []} onChanged={onChanged} />
          ) : null}
          {!nested && replying ? (
            <div className="field" style={{ marginTop: 10 }}>
              <textarea
                className="textarea"
                value={replyBody}
                onChange={(event) => setReplyBody(event.target.value)}
                placeholder={t('discussions.commentPlaceholder')}
              />
              <div className="action-row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
                <button className="btn small ghost" onClick={() => setReplying(false)}>
                  {t('app.cancel')}
                </button>
                <button
                  className="btn small primary"
                  onClick={() => void reply()}
                  disabled={busy !== null || !replyBody.trim()}
                >
                  {busy === 'reply' ? <span className="spinner" /> : <Send size={12} />}
                  {t('discussions.commentAction')}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
      {replies.map((item) => (
        <CommentItem
          key={item.id}
          node={item}
          discussionId={discussionId}
          owner={owner}
          repo={repo}
          viewerLogin={viewerLogin}
          canAnswer={false}
          nested
          onChanged={onChanged}
        />
      ))}
    </>
  )
}

function DiscussionDetail({
  owner,
  repo,
  number,
  onClose,
  onChanged,
}: {
  owner: string
  repo: string
  number: number
  onClose: () => void
  onChanged: () => void
}) {
  const { t, lang, toast, user } = useApp()
  const L = (en: string, zh: string) => (lang === 'zh' ? zh : en)
  const detail = useGql<DetailData>(DETAIL_QUERY, { owner, name: repo, number })
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editBody, setEditBody] = useState('')
  const [editCategoryId, setEditCategoryId] = useState('')
  const categories = useGql<CategoriesData>(editOpen ? CATEGORIES_QUERY : null, {
    owner,
    name: repo,
  })

  const discussion = detail.data?.repository?.discussion || null
  const viewerLogin = user?.login || ''
  const permission = detail.data?.repository?.viewerPermission || ''
  const isAdmin = permission === 'ADMIN' || permission === 'MAINTAIN'
  const canAnswer = Boolean(discussion?.category?.isAnswerable) || isAdmin
  const isAuthor = Boolean(viewerLogin && discussion?.author?.login === viewerLogin)

  const refresh = () => {
    detail.reload()
    onChanged()
  }

  const openEdit = () => {
    if (!discussion) return
    setEditTitle(discussion.title)
    setEditBody(discussion.body)
    setEditCategoryId(discussion.category?.id || '')
    setEditOpen(true)
  }

  const saveEdit = async () => {
    if (!discussion || !editTitle.trim()) return
    setBusy('edit')
    const res = await gql(UPDATE_DISCUSSION_MUTATION, {
      discussionId: discussion.id,
      title: editTitle.trim(),
      body: editBody,
      categoryId: editCategoryId || null,
    })
    setBusy(null)
    if (res.ok) {
      setEditOpen(false)
      toast(L('Discussion updated', '讨论已更新'), 'success')
      refresh()
    } else {
      toast(res.error || L('Update failed', '更新失败'), 'error')
    }
  }

  const deleteDiscussion = async () => {
    if (!discussion) return
    if (!window.confirm(L('Delete this discussion?', '删除这个讨论？'))) return
    setBusy('delete')
    const res = await gql(DELETE_DISCUSSION_MUTATION, { id: discussion.id })
    setBusy(null)
    if (res.ok) {
      toast(L('Discussion deleted', '讨论已删除'), 'success')
      onChanged()
      onClose()
    } else {
      toast(res.error || L('Delete failed', '删除失败'), 'error')
    }
  }

  const toggleUpvote = async () => {
    if (!discussion) return
    setBusy('upvote')
    const res = await gql(
      discussion.viewerHasUpvoted ? REMOVE_UPVOTE_MUTATION : ADD_UPVOTE_MUTATION,
      { subjectId: discussion.id },
    )
    setBusy(null)
    if (res.ok) {
      refresh()
    } else {
      toast(res.error || L('Upvote failed', '投票失败'), 'error')
    }
  }

  const comment = async () => {
    if (!discussion || !body.trim()) return
    setBusy('comment')
    const res = await gql(COMMENT_MUTATION, {
      discussionId: discussion.id,
      body: body.trim(),
      replyToId: null,
    })
    setBusy(null)
    if (res.ok) {
      setBody('')
      toast(t('discussions.commented'), 'success')
      refresh()
    } else {
      toast(res.error || L('Comment failed', '评论失败'), 'error')
    }
  }

  const categoryOptions = categories.data?.repository?.discussionCategories?.nodes || []

  return (
    <Modal
      wide
      title={discussion ? `#${discussion.number} ${discussion.title}` : t('discussions.title')}
      subtitle={discussion?.category?.name}
      onClose={onClose}
    >
      {detail.loading ? (
        <LoadingBlock />
      ) : detail.error ? (
        <ErrorBlock message={detail.error} onRetry={detail.reload} />
      ) : !discussion ? (
        <div className="readme-empty">{t('discussions.empty')}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="thread-head">
            {discussion.author ? <Avatar url={discussion.author.avatarUrl} size={22} /> : null}
            <strong style={{ color: 'var(--text)' }}>{discussion.author?.login}</strong>
            <span>
              <TimeAgo iso={discussion.createdAt} />
            </span>
            <span className="spacer" />
            <button
              className={discussion.viewerHasUpvoted ? 'btn small primary' : 'btn small'}
              onClick={() => void toggleUpvote()}
              disabled={busy !== null}
              title={discussion.viewerHasUpvoted ? L('Remove upvote', '取消投票') : L('Upvote', '投票')}
            >
              {busy === 'upvote' ? <span className="spinner" /> : <ArrowBigUp size={13} />}
              {discussion.upvoteCount}
            </button>
            {isAuthor ? (
              <>
                <button
                  className="icon-btn ghost"
                  title={L('Edit discussion', '编辑讨论')}
                  onClick={openEdit}
                >
                  <Pencil size={13} />
                </button>
                <button
                  className="icon-btn ghost"
                  title={L('Delete discussion', '删除讨论')}
                  onClick={() => void deleteDiscussion()}
                  disabled={busy !== null}
                >
                  <Trash2 size={13} />
                </button>
              </>
            ) : null}
            <button className="btn small ghost" onClick={() => void openExternal(discussion.url)}>
              <ExternalLink size={13} />
              {t('discussions.openOnGitHub')}
            </button>
          </div>

          {editOpen ? (
            <div className="card card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="field">
                <label className="field-label">{t('discussions.titleField')}</label>
                <input
                  className="input"
                  value={editTitle}
                  onChange={(event) => setEditTitle(event.target.value)}
                />
              </div>
              <div className="field">
                <label className="field-label">{t('discussions.category')}</label>
                <select
                  className="select"
                  value={editCategoryId}
                  onChange={(event) => setEditCategoryId(event.target.value)}
                >
                  {categoryOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="field-label">{t('discussions.bodyField')}</label>
                <textarea
                  className="textarea"
                  style={{ minHeight: 160 }}
                  value={editBody}
                  onChange={(event) => setEditBody(event.target.value)}
                />
              </div>
              <div className="action-row" style={{ justifyContent: 'flex-end' }}>
                <button className="btn small ghost" onClick={() => setEditOpen(false)}>
                  {t('app.cancel')}
                </button>
                <button
                  className="btn small primary"
                  onClick={() => void saveEdit()}
                  disabled={busy !== null || !editTitle.trim()}
                >
                  {busy === 'edit' ? <span className="spinner" /> : <Send size={12} />}
                  {t('common.save')}
                </button>
              </div>
            </div>
          ) : (
            <div className="card card-body">
              <Markdown markdown={discussion.body} owner={owner} repo={repo} />
              <ReactionBar
                subjectId={discussion.id}
                groups={discussion.reactionGroups || []}
                onChanged={refresh}
              />
            </div>
          )}

          <div className="section-title">
            {discussion.comments.nodes.length} {t('discussions.commentsLabel')}
          </div>
          {discussion.comments.nodes.map((node) => (
            <CommentItem
              key={node.id}
              node={node}
              discussionId={discussion.id}
              owner={owner}
              repo={repo}
              viewerLogin={viewerLogin}
              canAnswer={canAnswer}
              answerId={discussion.answer?.id || null}
              onChanged={refresh}
            />
          ))}

          <div className="field">
            <textarea
              className="textarea"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder={t('discussions.commentPlaceholder')}
            />
            <div className="action-row" style={{ justifyContent: 'flex-end' }}>
              <button
                className="btn primary small"
                onClick={() => void comment()}
                disabled={busy !== null || !body.trim()}
              >
                {busy === 'comment' ? <span className="spinner" /> : <MessageSquare size={13} />}
                {t('discussions.commentAction')}
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}

function CreateDiscussion({
  owner,
  repo,
  onClose,
  onCreated,
}: {
  owner: string
  repo: string
  onClose: () => void
  onCreated: () => void
}) {
  const { t } = useApp()
  const categories = useGql<CategoriesData>(CATEGORIES_QUERY, { owner, name: repo })
  const [categoryId, setCategoryId] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const options = categories.data?.repository?.discussionCategories?.nodes || []
  const repoId = categories.data?.repository?.id || ''

  const create = async () => {
    if (!title.trim()) {
      setError(t('discussions.needTitle'))
      return
    }
    if (!categoryId || !repoId) {
      setError(t('discussions.noCategories'))
      return
    }
    setBusy(true)
    setError('')
    const res = await gql(CREATE_MUTATION, {
      repositoryId: repoId,
      categoryId,
      title: title.trim(),
      body,
    })
    setBusy(false)
    if (res.ok) {
      onCreated()
      onClose()
    } else {
      setError(res.error || t('app.error'))
    }
  }

  return (
    <Modal
      wide
      title={t('discussions.newTitle')}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            {t('app.cancel')}
          </button>
          <button className="btn primary" onClick={() => void create()} disabled={busy}>
            {busy ? <span className="spinner" /> : <Plus size={14} />}
            {t('common.create')}
          </button>
        </>
      }
    >
      <div className="field" style={{ marginBottom: 12 }}>
        <label className="field-label">{t('discussions.category')}</label>
        <select className="select" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
          <option value="">{t('discussions.selectCategory')}</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field" style={{ marginBottom: 12 }}>
        <label className="field-label">{t('discussions.titleField')}</label>
        <input className="input" value={title} onChange={(event) => setTitle(event.target.value)} />
      </div>
      <div className="field">
        <label className="field-label">{t('discussions.bodyField')}</label>
        <textarea className="textarea" style={{ minHeight: 160 }} value={body} onChange={(event) => setBody(event.target.value)} />
      </div>
      {error ? (
        <div style={{ marginTop: 12 }}>
          <ErrorBlock message={error} />
        </div>
      ) : null}
    </Modal>
  )
}
