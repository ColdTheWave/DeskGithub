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
  const rawBase = branch
    ? `https://raw.githubusercontent.com/${owner}/${repo}/${branch}`
    : `https://github.com/${owner}/${repo}/raw/HEAD`
  const repoBase = `https://github.com/${owner}/${repo}`
  const resolve = (src: string) => {
    if (/^\/\//.test(src)) return `https:${src}`
    if (/^(https?:|data:|#)/i.test(src)) return src
    return `${rawBase}/${src.replace(/^\.?\//, '')}`
  }
  return html
    .replace(/(<(?:img|source)[^>]*\ssrc=")([^"]+)(")/g, (_match, pre, src, post) => {
      return `${pre}${resolve(src)}${post}`
    })
    .replace(/(\s(?:srcset|data-srcset)=")([^"]+)(")/g, (_match, pre, value, post) => {
      const rewritten = value
        .split(',')
        .map((part: string) => {
          const pieces = part.trim().split(/\s+/)
          if (!pieces[0]) return part
          pieces[0] = resolve(pieces[0])
          return pieces.join(' ')
        })
        .join(', ')
      return `${pre}${rewritten}${post}`
    })
    .replace(/(<a[^>]*\shref=")(?!https?:|#|mailto:)([^"]+)(")/g, (_match, pre, href, post) => {
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
        ADD_ATTR: ['target', 'rel', 'align', 'srcset'],
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
