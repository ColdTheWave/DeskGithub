import { useState } from 'react'
import { ArrowLeftRight, GitCompare, ExternalLink } from 'lucide-react'
import { useApp } from '../lib/store'
import { useGh } from '../lib/hooks'
import { Avatar, ErrorBlock, LoadingBlock, Modal, TimeAgo } from './ui'
import { DiffFiles } from './DiffFiles'
import type { GhFileDiff } from '../lib/types'
import { openExternal } from '../lib/desktop'

type CompareData = {
  status: string
  ahead_by: number
  behind_by: number
  total_commits: number
  commits: {
    sha: string
    commit: { message: string; author: { name: string; date: string } | null }
    author: { login: string; avatar_url: string } | null
  }[]
  files: GhFileDiff[]
  html_url: string
}

export function CompareModal({
  owner,
  repo,
  branches,
  defaultBranch,
  onClose,
}: {
  owner: string
  repo: string
  branches: string[]
  defaultBranch: string
  onClose: () => void
}) {
  const { t, lang, navigate } = useApp()
  const L = (en: string, zh: string) => (lang === 'zh' ? zh : en)
  const [base, setBase] = useState(defaultBranch || branches[0] || '')
  const [head, setHead] = useState(branches.find((name) => name !== defaultBranch) || defaultBranch || '')
  const path =
    base && head
      ? `/repos/${owner}/${repo}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`
      : null
  const compare = useGh<CompareData>(path, [base, head])

  return (
    <Modal
      wide
      title={L('Compare changes', '比较变更')}
      subtitle={`${owner}/${repo}`}
      icon={<GitCompare size={16} />}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            {t('app.close')}
          </button>
          <button
            className="btn"
            onClick={() =>
              void openExternal(`https://github.com/${owner}/${repo}/compare/${base}...${head}`)
            }
          >
            <ExternalLink size={13} />
            {t('app.openInBrowser')}
          </button>
        </>
      }
    >
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <select className="select" value={base} onChange={(event) => setBase(event.target.value)} aria-label="Base">
          {branches.map((name) => (
            <option key={`base-${name}`} value={name}>
              {name}
            </option>
          ))}
        </select>
        <button
          className="icon-btn"
          title={L('Swap', '交换')}
          onClick={() => {
            setBase(head)
            setHead(base)
          }}
        >
          <ArrowLeftRight size={14} />
        </button>
        <select className="select" value={head} onChange={(event) => setHead(event.target.value)} aria-label="Compare">
          {branches.map((name) => (
            <option key={`head-${name}`} value={name}>
              {name}
            </option>
          ))}
        </select>
        {compare.data ? (
          <span className="muted" style={{ fontSize: 12 }}>
            {compare.data.total_commits} {L('commits', '个提交')} ·{' '}
            {L('{n} files changed', '{n} 个文件变更').replace('{n}', String(compare.data.files?.length || 0))}
          </span>
        ) : null}
      </div>

      {compare.loading ? (
        <LoadingBlock />
      ) : compare.error ? (
        <ErrorBlock message={compare.error} onRetry={compare.reload} />
      ) : !compare.data ? null : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="card">
            <div className="card-head">
              <div className="card-title">
                <GitCompare size={14} />
                {L('Commits', '提交')}
              </div>
              <span className="muted" style={{ fontSize: 11.5 }}>
                {compare.data.total_commits}
              </span>
            </div>
            <div className="list">
              {compare.data.commits?.length ? (
                compare.data.commits.map((commit) => (
                  <button
                    className="list-item"
                    key={commit.sha}
                    onClick={() => {
                      onClose()
                      navigate({ name: 'commit', owner, repo, sha: commit.sha })
                    }}
                  >
                    {commit.author ? <Avatar user={commit.author} size={26} /> : null}
                    <div className="item-main">
                      <div className="item-title">
                        <span className="truncate">{commit.commit.message.split('\n')[0]}</span>
                      </div>
                      <div className="item-meta">
                        <span className="mono">{commit.sha.slice(0, 7)}</span>
                        {commit.commit.author?.date ? (
                          <span>
                            <TimeAgo iso={commit.commit.author.date} />
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </button>
                ))
              ) : (
                <div className="readme-empty">{L('No commits between these branches', '两个分支之间没有提交')}</div>
              )}
            </div>
          </div>
          <div className="card">
            <div className="card-head">
              <div className="card-title">{L('Files changed', '文件变更')}</div>
            </div>
            <DiffFiles
              files={compare.data.files || []}
              noPatchLabel={L('No patch available', '没有可用的补丁')}
            />
          </div>
        </div>
      )}
    </Modal>
  )
}
