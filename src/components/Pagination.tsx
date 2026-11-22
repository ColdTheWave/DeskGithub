import { useApp } from '../lib/store'

export function Pagination({
  page,
  onPage,
  hasNext,
  totalPages,
  loading,
}: {
  page: number
  onPage: (page: number) => void
  hasNext?: boolean
  totalPages?: number
  loading?: boolean
}) {
  const { t } = useApp()
  const nextEnabled = totalPages ? page < totalPages : Boolean(hasNext)
  if (page <= 1 && !nextEnabled) return null

  return (
    <div className="pager">
      <button
        className="btn small"
        disabled={page <= 1 || loading}
        onClick={() => onPage(Math.max(1, page - 1))}
      >
        {t('pager.prev')}
      </button>
      <span className="pager-info">
        {t('pager.page', { page })}
        {totalPages ? ` · ${t('pager.of', { total: totalPages })}` : ''}
      </span>
      <button
        className="btn small"
        disabled={!nextEnabled || loading}
        onClick={() => onPage(page + 1)}
      >
        {t('pager.next')}
      </button>
    </div>
  )
}
