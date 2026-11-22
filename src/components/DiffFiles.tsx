import { useState } from 'react'
import { useApp } from '../lib/store'
import type { GhFileDiff } from '../lib/types'

export function DiffFiles({ files, noPatchLabel }: { files: GhFileDiff[]; noPatchLabel: string }) {
  const { lang } = useApp()
  const L = (en: string, zh: string) => (lang === 'zh' ? zh : en)
  const [expanded, setExpanded] = useState<string[]>([])
  const [viewed, setViewed] = useState<string[]>([])

  const setOpen = (filename: string, open: boolean) =>
    setExpanded((prev) =>
      open ? (prev.includes(filename) ? prev : [...prev, filename]) : prev.filter((name) => name !== filename),
    )

  const toggleViewed = (filename: string) =>
    setViewed((prev) =>
      prev.includes(filename) ? prev.filter((name) => name !== filename) : [...prev, filename],
    )

  return (
    <div>
      <div className="action-row" style={{ padding: '8px 12px' }}>
        <span className="muted" style={{ fontSize: 11.5 }}>
          {L('{n} files changed', '{n} 个文件变更').replace('{n}', String(files.length))}
        </span>
        <span className="spacer" />
        <button className="btn small ghost" onClick={() => setExpanded(files.map((file) => file.filename))}>
          {L('Expand all', '全部展开')}
        </button>
        <button className="btn small ghost" onClick={() => setExpanded([])}>
          {L('Collapse all', '全部折叠')}
        </button>
      </div>
      {files.map((file) => (
        <details
          className="diff-file"
          key={file.filename}
          open={expanded.includes(file.filename)}
          onToggle={(event) => setOpen(file.filename, event.currentTarget.open)}
        >
          <summary>
            <span className="mono" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {file.filename}
            </span>
            <span className="diff-stat">
              <span className="plus">+{file.additions}</span>
              <span className="minus">-{file.deletions}</span>
            </span>
            <label className="row" style={{ gap: 5, fontSize: 11.5, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={viewed.includes(file.filename)}
                onChange={() => toggleViewed(file.filename)}
              />
              {L('Viewed', '已查看')}
            </label>
          </summary>
          {file.patch ? (
            <pre className="diff-patch">
              {file.patch.split('\n').map((line, index) => {
                const className = line.startsWith('+')
                  ? 'diff-add'
                  : line.startsWith('-')
                    ? 'diff-del'
                    : line.startsWith('@@')
                      ? 'diff-hunk'
                      : undefined
                return (
                  <span className={className} key={index}>
                    {line || ' '}
                    {'\n'}
                  </span>
                )
              })}
            </pre>
          ) : (
            <div className="readme-empty" style={{ padding: 12 }}>
              {noPatchLabel}
            </div>
          )}
        </details>
      ))}
    </div>
  )
}
