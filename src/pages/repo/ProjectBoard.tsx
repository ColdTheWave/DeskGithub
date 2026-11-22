import { useState } from 'react'
import { ExternalLink, FolderKanban, Plus, Trash2 } from 'lucide-react'
import { useApp } from '../../lib/store'
import { useGql } from '../../lib/hooks'
import { gql } from '../../lib/api'
import { EmptyState, ErrorBlock, LoadingBlock, Modal } from '../../components/ui'
import { openExternal } from '../../lib/desktop'

type FieldOption = { id: string; name: string }

type FieldNode = {
  id: string
  name: string
  options?: FieldOption[]
}

type ItemContent = {
  __typename: string
  id: string
  title?: string
  number?: number
  url?: string
}

type FieldValue = {
  __typename: string
  name?: string
  optionId?: string
  field?: { id: string; name: string } | null
}

type ProjectItem = {
  id: string
  content: ItemContent | null
  fieldValues: { nodes: FieldValue[] }
}

type ProjectDetail = {
  id: string
  title: string
  number: number
  url: string
  closed: boolean
  fields: { nodes: FieldNode[] }
  items: { nodes: ProjectItem[] }
}

const DETAIL_QUERY = `
query($owner:String!, $name:String!, $number:Int!){
  repository(owner:$owner, name:$name){
    projectV2(number:$number){
      id title number url closed
      fields(first:50){
        nodes{
          ... on ProjectV2SingleSelectField{ id name options{ id name } }
          ... on ProjectV2FieldCommon{ id name }
        }
      }
      items(first:100){
        nodes{
          id
          content{
            __typename
            ... on Issue{ id title number url }
            ... on PullRequest{ id title number url }
            ... on DraftIssue{ id title }
          }
          fieldValues(first:20){
            nodes{
              __typename
              ... on ProjectV2ItemFieldSingleSelectValue{
                name optionId
                field{ ... on ProjectV2SingleSelectField{ id name } }
              }
            }
          }
        }
      }
    }
  }
}`

const UPDATE_VALUE_MUTATION = `
mutation($projectId:ID!, $itemId:ID!, $fieldId:ID!, $optionId:String!){
  updateProjectV2ItemFieldValue(input:{projectId:$projectId, itemId:$itemId, fieldId:$fieldId, value:{singleSelectOptionId:$optionId}}){
    projectV2Item{ id }
  }
}`

const ADD_ITEM_MUTATION = `
mutation($projectId:ID!, $contentId:ID!){
  addProjectV2ItemById(input:{projectId:$projectId, contentId:$contentId}){
    item{ id }
  }
}`

const DELETE_ITEM_MUTATION = `
mutation($projectId:ID!, $itemId:ID!){
  deleteProjectV2Item(input:{projectId:$projectId, itemId:$itemId}){
    deletedItemId
  }
}`

const FIND_ISSUE_QUERY = `
query($owner:String!, $name:String!, $number:Int!){
  repository(owner:$owner, name:$name){ issue(number:$number){ id } }
}`

const FIND_PR_QUERY = `
query($owner:String!, $name:String!, $number:Int!){
  repository(owner:$owner, name:$name){ pullRequest(number:$number){ id } }
}`

type Column = { id: string; name: string; items: ProjectItem[] }

function ItemCard({
  item,
  field,
  busy,
  onMove,
  onRemove,
}: {
  item: ProjectItem
  field: FieldNode | null
  busy: boolean
  onMove: (itemId: string, optionId: string) => void
  onRemove: (itemId: string) => void
}) {
  const { lang } = useApp()
  const L = (en: string, zh: string) => (lang === 'zh' ? zh : en)
  const content = item.content
  if (!content) return null

  const title = content.title || L('Untitled', '未命名')
  const url = content.url
  const current = field
    ? item.fieldValues.nodes.find(
        (value) => value.__typename === 'ProjectV2ItemFieldSingleSelectValue' && value.field?.id === field.id,
      )
    : undefined

  return (
    <div
      className="list-item"
      style={{
        flexDirection: 'column',
        alignItems: 'stretch',
        gap: 6,
        padding: '10px 12px',
        border: '1px solid var(--border)',
        borderRadius: 10,
        background: 'var(--panel)',
        cursor: url ? 'pointer' : 'default',
      }}
      onClick={() => {
        if (url) void openExternal(url)
      }}
    >
      <span className="truncate" style={{ fontSize: 12.5, fontWeight: 600 }} title={title}>
        {title}
      </span>
      <div className="row" style={{ gap: 6, fontSize: 11, color: 'var(--muted)' }}>
        <span>
          {content.__typename === 'PullRequest'
            ? 'PR'
            : content.__typename === 'DraftIssue'
              ? L('Draft', '草稿')
              : 'Issue'}
        </span>
        {content.number ? <span>#{content.number}</span> : null}
      </div>
      <div className="row" style={{ gap: 6 }} onClick={(event) => event.stopPropagation()}>
        {field ? (
          <select
            className="select"
            style={{ height: 26, fontSize: 11.5, flex: 1 }}
            value={current?.optionId || ''}
            disabled={busy}
            onChange={(event) => onMove(item.id, event.target.value)}
          >
            <option value="">{L('No status', '无状态')}</option>
            {(field.options || []).map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        ) : null}
        <button
          className="icon-btn ghost tiny"
          title={L('Remove from project', '从项目中移除')}
          onClick={() => onRemove(item.id)}
          disabled={busy}
        >
          {busy ? <span className="spinner" /> : <Trash2 size={12} />}
        </button>
      </div>
    </div>
  )
}

export function ProjectBoard({
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
  const { t, lang, toast } = useApp()
  const L = (en: string, zh: string) => (lang === 'zh' ? zh : en)
  const detail = useGql<{ repository: { projectV2: ProjectDetail | null } | null }>(DETAIL_QUERY, {
    owner,
    name: repo,
    number,
  })
  const [busy, setBusy] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [addNumber, setAddNumber] = useState('')
  const [adding, setAdding] = useState(false)

  const project = detail.data?.repository?.projectV2 || null
  const fields = project?.fields.nodes || []
  const statusField =
    fields.find((field) => field.name.toLowerCase() === 'status' && (field.options?.length || 0) > 0) || null
  const items = project?.items.nodes || []

  const columns: Column[] = []
  if (statusField) {
    statusField.options!.forEach((option) => columns.push({ id: option.id, name: option.name, items: [] }))
    const none: Column = { id: '', name: L('No status', '无状态'), items: [] }
    items.forEach((item) => {
      const value = item.fieldValues.nodes.find(
        (node) => node.__typename === 'ProjectV2ItemFieldSingleSelectValue' && node.field?.id === statusField.id,
      )
      const column = columns.find((entry) => entry.id === value?.optionId)
      if (column) column.items.push(item)
      else none.items.push(item)
    })
    if (none.items.length) columns.push(none)
  } else {
    columns.push({ id: '', name: L('Items', '条目'), items })
  }

  const move = async (itemId: string, optionId: string) => {
    if (!project || !statusField || !optionId) return
    setBusy(itemId)
    const res = await gql(UPDATE_VALUE_MUTATION, {
      projectId: project.id,
      itemId,
      fieldId: statusField.id,
      optionId,
    })
    setBusy(null)
    if (res.ok) {
      toast(L('Status updated', '状态已更新'), 'success')
      detail.reload()
    } else {
      toast(res.error || L('Failed to update status', '更新状态失败'), 'error')
    }
  }

  const remove = async (itemId: string) => {
    if (!project) return
    if (!window.confirm(L('Remove this item from the project?', '从项目中移除该条目？'))) return
    setBusy(itemId)
    const res = await gql(DELETE_ITEM_MUTATION, { projectId: project.id, itemId })
    setBusy(null)
    if (res.ok) {
      toast(L('Item removed', '条目已移除'), 'success')
      detail.reload()
      onChanged()
    } else {
      toast(res.error || L('Failed to remove item', '移除条目失败'), 'error')
    }
  }

  const addItem = async () => {
    if (!project) return
    const target = Number(addNumber.trim())
    if (!Number.isInteger(target) || target <= 0) {
      toast(L('Enter a valid issue or PR number', '请输入有效的 Issue 或 PR 编号'), 'error')
      return
    }
    setAdding(true)
    const issue = await gql<{ repository: { issue: { id: string } | null } | null }>(FIND_ISSUE_QUERY, {
      owner,
      name: repo,
      number: target,
    })
    let contentId = issue.data?.repository?.issue?.id || null
    let lookupError = issue.error
    if (!contentId) {
      const pull = await gql<{ repository: { pullRequest: { id: string } | null } | null }>(FIND_PR_QUERY, {
        owner,
        name: repo,
        number: target,
      })
      contentId = pull.data?.repository?.pullRequest?.id || null
      lookupError = pull.error || lookupError
    }
    if (!contentId) {
      setAdding(false)
      toast(lookupError || L('Could not find that issue or pull request', '找不到该 Issue 或 PR'), 'error')
      return
    }
    const res = await gql(ADD_ITEM_MUTATION, { projectId: project.id, contentId })
    setAdding(false)
    if (res.ok) {
      toast(L('Item added', '条目已添加'), 'success')
      setAddNumber('')
      setAddOpen(false)
      detail.reload()
      onChanged()
    } else {
      toast(res.error || L('Failed to add item', '添加条目失败'), 'error')
    }
  }

  return (
    <Modal
      wide
      title={project?.title || L('Project', '项目')}
      subtitle={project ? `#${project.number}` : undefined}
      onClose={onClose}
      icon={<FolderKanban size={15} />}
      footer={
        project ? (
          <div className="row" style={{ justifyContent: 'space-between', width: '100%' }}>
            <span className="muted" style={{ fontSize: 11.5 }}>
              {t('projects.items', { n: items.length })}
            </span>
            <button className="btn small" onClick={() => void openExternal(project.url)}>
              <ExternalLink size={13} />
              {L('Open on GitHub', '在 GitHub 打开')}
            </button>
          </div>
        ) : undefined
      }
    >
      {detail.loading ? (
        <LoadingBlock />
      ) : detail.error ? (
        <ErrorBlock message={detail.error} onRetry={detail.reload} />
      ) : !project ? (
        <EmptyState icon={<FolderKanban size={20} />} title={L('Project not found', '未找到项目')} />
      ) : (
        <div>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn small" onClick={() => setAddOpen((value) => !value)}>
                <Plus size={13} />
                {L('Add item', '添加条目')}
              </button>
              {addOpen ? (
                <form
                  className="row"
                  style={{ gap: 6 }}
                  onSubmit={(event) => {
                    event.preventDefault()
                    void addItem()
                  }}
                >
                  <input
                    className="input"
                    style={{ width: 110, height: 28 }}
                    placeholder={L('Issue / PR #', 'Issue / PR 编号')}
                    value={addNumber}
                    onChange={(event) => setAddNumber(event.target.value)}
                  />
                  <button className="btn small primary" type="submit" disabled={adding || !addNumber.trim()}>
                    {adding ? <span className="spinner" /> : L('Add', '添加')}
                  </button>
                </form>
              ) : null}
            </div>
            {!statusField ? (
              <span className="field-hint">
                {L('No single-select "Status" field found — status editing is unavailable.', '未找到名为 Status 的单选字段，无法编辑状态。')}
              </span>
            ) : null}
          </div>

          {items.length === 0 ? (
            <EmptyState
              icon={<FolderKanban size={20} />}
              title={L('No items yet', '暂无条目')}
              text={L('Add an issue or pull request to this project.', '向此项目添加 Issue 或 PR。')}
            />
          ) : (
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
                overflowX: 'auto',
                paddingBottom: 4,
              }}
            >
              {columns.map((column) => (
                <div
                  key={column.id || 'none'}
                  style={{ flex: '0 0 240px', width: 240, display: 'flex', flexDirection: 'column', gap: 8 }}
                >
                  <div className="row" style={{ justifyContent: 'space-between', padding: '0 2px' }}>
                    <span className="field-label truncate">{column.name}</span>
                    <span className="muted" style={{ fontSize: 11 }}>
                      {column.items.length}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {column.items.map((item) => (
                      <ItemCard
                        key={item.id}
                        item={item}
                        field={statusField}
                        busy={busy === item.id}
                        onMove={(itemId, optionId) => void move(itemId, optionId)}
                        onRemove={(itemId) => void remove(itemId)}
                      />
                    ))}
                    {column.items.length === 0 ? (
                      <div className="muted" style={{ fontSize: 11, padding: '6px 2px' }}>
                        {L('No items', '暂无条目')}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
