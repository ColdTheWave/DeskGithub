import { useState } from 'react'
import { SmilePlus } from 'lucide-react'
import { useApp } from '../lib/store'
import { apiErrorMessage, gh } from '../lib/api'
import type { ReactionSummary } from '../lib/types'

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

type ReactionContent = (typeof REACTIONS)[number]['content']

export function Reactions({
  endpoint,
  summary,
  onChanged,
}: {
  endpoint: string
  summary?: ReactionSummary
  onChanged: () => void
}) {
  const { t, authenticated, openLogin, user, toast } = useApp()
  const [expanded, setExpanded] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  const toggle = async (content: ReactionContent) => {
    if (!authenticated) {
      openLogin()
      return
    }
    setBusy(content)
    const list = await gh<any[]>(`${endpoint}?per_page=100`)
    const mine =
      list.ok && Array.isArray(list.data)
        ? list.data.find((item) => item.user?.login === user?.login && item.content === content)
        : null
    const res = mine
      ? await gh(`${endpoint}/${mine.id}`, { method: 'DELETE' })
      : await gh(endpoint, { method: 'POST', body: { content } })
    setBusy(null)
    if (res.ok || res.status === 204) {
      setExpanded(false)
      onChanged()
    } else {
      toast(apiErrorMessage(res.data, t('app.requestFailed', { status: res.status })), 'error')
    }
  }

  const visible = expanded
    ? REACTIONS
    : REACTIONS.filter((reaction) => (summary?.[reaction.content] || 0) > 0)

  return (
    <div className="reactions">
      {visible.map((reaction) => {
        const count = summary?.[reaction.content] || 0
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
        title={expanded ? 'Close' : 'Add reaction'}
        onClick={() => setExpanded((value) => !value)}
      >
        <SmilePlus size={13} />
      </button>
    </div>
  )
}
