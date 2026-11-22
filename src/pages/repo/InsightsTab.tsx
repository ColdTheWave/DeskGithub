import { useEffect, useState } from 'react'
import { Activity, Download, Eye, GitFork, GitCommitHorizontal, Users } from 'lucide-react'
import { useApp } from '../../lib/store'
import { gh } from '../../lib/api'
import { useGh } from '../../lib/hooks'
import { Avatar, ErrorBlock, LoadingBlock } from '../../components/ui'

type Traffic = { count: number; uniques: number; views?: { timestamp: string; count: number; uniques: number }[]; clones?: { timestamp: string; count: number; uniques: number }[] }

export function InsightsTab({ owner, repo }: { owner: string; repo: string }) {
  const { t, lang } = useApp()
  const L = (en: string, zh: string) => (lang === 'zh' ? zh : en)
  const [views, setViews] = useState<Traffic | null>(null)
  const [clones, setClones] = useState<Traffic | null>(null)
  const [trafficError, setTrafficError] = useState<string | null>(null)
  const [trafficLoading, setTrafficLoading] = useState(true)

  const activity = useGh<any[]>(`/repos/${owner}/${repo}/stats/commit_activity`)
  const contributors = useGh<any[]>(`/repos/${owner}/${repo}/contributors?per_page=100`)
  const releases = useGh<any[]>(`/repos/${owner}/${repo}/releases?per_page=20`)

  useEffect(() => {
    let alive = true
    setTrafficLoading(true)
    setTrafficError(null)
    Promise.all([
      gh<Traffic>(`/repos/${owner}/${repo}/traffic/views`),
      gh<Traffic>(`/repos/${owner}/${repo}/traffic/clones`),
    ]).then(([viewsRes, clonesRes]) => {
      if (!alive) return
      setTrafficLoading(false)
      if (viewsRes.ok) setViews(viewsRes.data)
      if (clonesRes.ok) setClones(clonesRes.data)
      if (!viewsRes.ok && !clonesRes.ok) {
        setTrafficError(L('Traffic data requires push access to this repository.', '访问流量数据需要该仓库的写入权限。'))
      }
    })
    return () => {
      alive = false
    }
  }, [owner, repo, lang])

  const weeks = Array.isArray(activity.data) ? activity.data.slice(-52) : []
  const maxCommits = Math.max(1, ...weeks.map((week: any) => week.total || 0))
  const downloads = (releases.data || []).reduce(
    (sum: number, release: any) =>
      sum + (release.assets || []).reduce((inner: number, asset: any) => inner + (asset.download_count || 0), 0),
    0,
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <section className="card">
        <div className="card-head">
          <div className="card-title">
            <Eye size={15} />
            {L('Traffic', '访问流量')}
          </div>
          <span className="muted" style={{ fontSize: 11.5 }}>
            {L('Last 14 days', '最近 14 天')}
          </span>
        </div>
        <div className="card-body">
          {trafficLoading ? (
            <LoadingBlock />
          ) : trafficError ? (
            <div className="note">
              <Activity size={14} />
              <span style={{ flex: 1 }}>{trafficError}</span>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16 }}>
              <div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {L('Page views', '页面浏览')}
                </div>
                <div style={{ fontSize: 24, fontWeight: 700 }}>{(views?.count || 0).toLocaleString()}</div>
                <div className="muted" style={{ fontSize: 11.5 }}>
                  {L('Unique visitors', '独立访客')} · {(views?.uniques || 0).toLocaleString()}
                </div>
              </div>
              <div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {L('Git clones', 'Git 克隆')}
                </div>
                <div style={{ fontSize: 24, fontWeight: 700 }}>{(clones?.count || 0).toLocaleString()}</div>
                <div className="muted" style={{ fontSize: 11.5 }}>
                  {L('Unique cloners', '独立克隆者')} · {(clones?.uniques || 0).toLocaleString()}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <div className="card-title">
            <GitCommitHorizontal size={15} />
            {L('Commit activity', '提交活跃度')}
          </div>
          <span className="muted" style={{ fontSize: 11.5 }}>
            {L('Last 52 weeks', '最近 52 周')}
          </span>
        </div>
        <div className="card-body">
          {activity.loading ? (
            <LoadingBlock />
          ) : activity.error ? (
            <ErrorBlock message={activity.error} onRetry={activity.reload} />
          ) : !weeks.length ? (
            <div className="readme-empty">{L('No commit activity yet.', '暂无提交活跃度数据。')}</div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 120 }}>
              {weeks.map((week: any) => (
                <div
                  key={week.week}
                  title={`${new Date(week.week * 1000).toLocaleDateString()} · ${week.total}`}
                  style={{
                    flex: 1,
                    minWidth: 3,
                    height: `${Math.max(3, (week.total / maxCommits) * 100)}%`,
                    background: 'var(--accent)',
                    borderRadius: 3,
                    opacity: week.total ? 0.9 : 0.2,
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <div className="card-title">
            <Users size={15} />
            {L('Contributors', '贡献者')}
          </div>
          <span className="muted" style={{ fontSize: 11.5 }}>
            {contributors.data?.length || 0}
          </span>
        </div>
        {contributors.loading ? (
          <LoadingBlock />
        ) : contributors.error ? (
          <div style={{ padding: 16 }}>
            <ErrorBlock message={contributors.error} onRetry={contributors.reload} />
          </div>
        ) : !contributors.data?.length ? (
          <div className="readme-empty">{t('repo.contributors')}</div>
        ) : (
          <div className="list">
            {contributors.data.slice(0, 20).map((person: any) => (
              <div className="list-item" key={person.id}>
                <Avatar user={person} size={30} />
                <div className="item-main">
                  <div className="item-title">{person.login}</div>
                  <div className="item-meta">
                    <span>
                      {person.contributions.toLocaleString()} {L('contributions', '次贡献')}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <div className="card-title">
            <Download size={15} />
            {L('Release downloads', '发布下载量')}
          </div>
          <span className="muted" style={{ fontSize: 11.5 }}>
            {downloads.toLocaleString()}
          </span>
        </div>
        {releases.loading ? (
          <LoadingBlock />
        ) : !releases.data?.length ? (
          <div className="readme-empty">{t('repo.releases')}</div>
        ) : (
          <div className="list">
            {releases.data.slice(0, 8).map((release: any) => (
              <div className="list-item" key={release.id}>
                <GitFork size={15} color="var(--muted)" />
                <div className="item-main">
                  <div className="item-title">
                    {release.tag_name}
                    {release.prerelease ? <span className="badge">{L('Pre-release', '预发布')}</span> : null}
                  </div>
                  <div className="item-meta">
                    <span>{(release.assets || []).length} assets</span>
                    <span>
                      {(release.assets || [])
                        .reduce((sum: number, asset: any) => sum + (asset.download_count || 0), 0)
                        .toLocaleString()}{' '}
                      downloads
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
