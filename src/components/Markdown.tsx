import { useEffect, useMemo, useRef } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import hljs from 'highlight.js'
import { openExternal } from '../lib/desktop'

type MarkdownProps = {
  markdown: string
  owner?: string
  repo?: string
  branch?: string
  className?: string
}

marked.setOptions({
  gfm: true,
  breaks: false,
})

function rewriteRelativeUrls(html: string, owner?: string, repo?: string, branch?: string) {
  if (!owner || !repo) return html
  const rawBase = `https://raw.githubusercontent.com/${owner}/${repo}/${branch || 'HEAD'}`
  const repoBase = `https://github.com/${owner}/${repo}`
  return html.replace(/(<(?:img|source)[^>]*\ssrc=")([^"]+)(")/g, (_match, pre, src, post) => {
    if (/^(https?:|data:|#)/i.test(src)) return _match
    const clean = src.replace(/^\.?\//, '')
    return `${pre}${rawBase}/${clean}${post}`
  }).replace(/(<a[^>]*\shref=")(?!https?:|#|mailto:)([^"]+)(")/g, (_match, pre, href, post) => {
    const clean = href.replace(/^\.?\//, '')
    return `${pre}${repoBase}/blob/${branch || 'HEAD'}/${clean}${post}`
  })
}

export function Markdown({ markdown, owner, repo, branch, className }: MarkdownProps) {
  const ref = useRef<HTMLDivElement>(null)

  const html = useMemo(() => {
    try {
      const raw = marked.parse(markdown || '') as string
      const rewritten = rewriteRelativeUrls(raw, owner, repo, branch)
      return DOMPurify.sanitize(rewritten, {
        ADD_ATTR: ['target', 'rel', 'align'],
        ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|data):|[^a-z]|[a-z+.-]+(?:[^a-z+.:-]|$))/i,
      })
    } catch {
      return ''
    }
  }, [markdown, owner, repo, branch])

  useEffect(() => {
    if (!ref.current) return
    ref.current.querySelectorAll('pre code').forEach((block) => {
      try {
        hljs.highlightElement(block as HTMLElement)
      } catch {
        /* ignore */
      }
    })
  }, [html])

  return (
    <div
      ref={ref}
      className={className ? `md ${className}` : 'md'}
      dangerouslySetInnerHTML={{ __html: html }}
      onClick={(event) => {
        const target = event.target as HTMLElement
        const anchor = target.closest('a')
        if (!anchor) return
        const href = anchor.getAttribute('href') || ''
        if (!href || href.startsWith('#')) return
        if (/^https?:\/\//i.test(href) || href.startsWith('mailto:')) {
          event.preventDefault()
          void openExternal(href)
        }
      }}
    />
  )
}
