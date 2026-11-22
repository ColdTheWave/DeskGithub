import { useState } from 'react'
import { FolderKanban, Plus } from 'lucide-react'
import { useApp } from '../../lib/store'
import { useGql } from '../../lib/hooks'
import { gql } from '../../lib/api'
import { Badge, EmptyState, ErrorBlock, LoadingBlock, LockGate, Modal, TimeAgo } from '../../components/ui'
import { ProjectBoard } from './ProjectBoard'

type Project = {
  id: string
  title: string
  number: number
  shortDescription: string | null
  updatedAt: string
  closed: boolean
  url: string
  items: { totalCount: number }
}

const PROJECTS_QUERY = `
query($owner:String!, $name:String!){
  repository(owner:$owner, name:$name){
    projectsV2(first:30){
      nodes{
        id title number shortDescription updatedAt closed url
        items(first:1){ totalCount }
      }
    }
  }
}`

const OWNER_QUERY = `
query($owner:String!, $name:String!){
  repository(owner:$owner, name:$name){ owner{ id } }
}`

const CREATE_PROJECT_MUTATION = `
mutation($ownerId:ID!, $title:String!){
  createProjectV2(input:{ownerId:$ownerId, title:$title}){
    projectV2{ id number title url }
  }
}`

type OwnerData = { repository: { owner: { id: string } } | null }

export function ProjectsTab({ owner, repo }: { owner: string; repo: string }) {
  const { t, lang, toast, authenticated, openLogin } = useApp()
  const L = (en: string, zh: string) => (lang === 'zh' ? zh : en)
  const projects = useGql<{ repository: { projectsV2: { nodes: Project[] } } | null }>(
    authenticated ? PROJECTS_QUERY : null,
    { owner, name: repo },
    [authenticated],
  )
  const [createOpen, setCreateOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [creating, setCreating] = useState(false)
  const [openNumber, setOpenNumber] = useState<number | null>(null)
  const ownerInfo = useGql<OwnerData>(authenticated && createOpen ? OWNER_QUERY : null, {
    owner,
    name: repo,
  })

  if (!authenticated) {
    return (
      <div style={{ padding: 16 }}>
        <LockGate title={t('projects.title')} text={t('discussions.login')} onSignIn={openLogin} />
      </div>
    )
  }

  const nodes = projects.data?.repository?.projectsV2?.nodes || []
  const ownerId = ownerInfo.data?.repository?.owner?.id || ''

  const createProject = async () => {
    if (!title.trim() || !ownerId) return
    setCreating(true)
    const res = await gql<{ createProjectV2: { projectV2: { id: string } } }>(CREATE_PROJECT_MUTATION, {
      ownerId,
      title: title.trim(),
    })
    setCreating(false)
    if (res.ok) {
      toast(L('Project created', '项目已创建'), 'success')
      setCreateOpen(false)
      setTitle('')
      projects.reload()
    } else {
      toast(res.error || L('Failed to create project', '创建项目失败'), 'error')
    }
  }

  return (
    <div>
      <div className="card-head" style={{ padding: '12px 16px' }}>
        <div className="card-title">
          <FolderKanban size={15} />
          {t('projects.title')}
        </div>
        <button className="btn small" onClick={() => setCreateOpen(true)}>
          <Plus size={13} />
          {L('New project', '新建项目')}
        </button>
      </div>

      {projects.loading ? (
        <LoadingBlock />
      ) : projects.error ? (
        <div style={{ padding: 16 }}>
          <ErrorBlock message={projects.error} onRetry={projects.reload} />
        </div>
      ) : nodes.length === 0 ? (
        <EmptyState icon={<FolderKanban size={20} />} title={t('projects.empty')} />
      ) : (
        <div className="project-grid">
          {nodes.map((project) => (
            <button
              className="project-card"
              key={project.id}
              title={L('Open project', '打开项目')}
              onClick={() => setOpenNumber(project.number)}
            >
              <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
                <span className="project-title truncate">{project.title}</span>
                {project.closed ? <Badge tone="purple">{t('projects.closed')}</Badge> : <Badge tone="green">{t('projects.stateOpen')}</Badge>}
              </div>
              <div className="project-number">#{project.number}</div>
              {project.shortDescription ? <div className="project-desc">{project.shortDescription}</div> : null}
              <div className="project-meta">
                <span>{t('projects.items', { n: project.items.totalCount })}</span>
                <span>
                  {t('projects.updated')} <TimeAgo iso={project.updatedAt} />
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {openNumber !== null ? (
        <ProjectBoard
          owner={owner}
          repo={repo}
          number={openNumber}
          onClose={() => setOpenNumber(null)}
          onChanged={projects.reload}
        />
      ) : null}

      {createOpen ? (
        <Modal
          title={L('New project', '新建项目')}
          subtitle={L('Create a Projects v2 board', '创建一个 Projects v2 看板')}
          onClose={() => setCreateOpen(false)}
          icon={<FolderKanban size={15} />}
          footer={
            <>
              <button className="btn small ghost" onClick={() => setCreateOpen(false)}>
                {t('app.cancel')}
              </button>
              <button
                className="btn small primary"
                onClick={() => void createProject()}
                disabled={creating || !title.trim() || !ownerId}
              >
                {creating ? <span className="spinner" /> : L('Create', '创建')}
              </button>
            </>
          }
        >
          <div className="field">
            <label className="field-label">{L('Title', '标题')}</label>
            <input
              className="input"
              value={title}
              autoFocus
              placeholder={L('Project title', '项目标题')}
              onChange={(event) => setTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void createProject()
              }}
            />
            {ownerInfo.error ? <div className="field-hint">{ownerInfo.error}</div> : null}
          </div>
        </Modal>
      ) : null}
    </div>
  )
}
