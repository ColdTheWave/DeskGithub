import { useEffect, useState } from 'react'
import { AlertTriangle, ShieldAlert, ShieldCheck, ShieldX } from 'lucide-react'
import { useApp } from '../../lib/store'
import { gh } from '../../lib/api'
import { Badge, LoadingBlock } from '../../components/ui'

type Section = {
  key: string
  label: string
  endpoint: string
  data: any[] | null
  error: string | null
  loading: boolean
}

const SECTION_DEFS: { key: string; label: string; labelZh: string; endpoint: string }[] = [
  {
    key: 'advisories',
    label: 'Security advisories',
    labelZh: '安全公告',
    endpoint: 'security-advisories?per_page=100',
  },
  {
    key: 'dependabot',
    label: 'Dependabot alerts',
    labelZh: 'Dependabot 告警',
    endpoint: 'dependabot/alerts?state=open&per_page=100',
  },
  {
    key: 'code',
    label: 'Code scanning alerts',
    labelZh: '代码扫描告警',
    endpoint: 'code-scanning/alerts?state=open&per_page=100',
  },
  {
    key: 'secret',
    label: 'Secret scanning alerts',
    labelZh: '密钥扫描告警',
    endpoint: 'secret-scanning/alerts?state=open&per_page=100',
  },
]

export function SecurityTab({ owner, repo }: { owner: string; repo: string }) {
  const { lang, t } = useApp()
  const L = (en: string, zh: string) => (lang === 'zh' ? zh : en)
  const [sections, setSections] = useState<Section[]>(
    SECTION_DEFS.map((def) => ({
      key: def.key,
      label: L(def.label, def.labelZh),
      endpoint: def.endpoint,
      data: null,
      error: null,
      loading: true,
    })),
  )

  useEffect(() => {
    let alive = true
    setSections((prev) => prev.map((section) => ({ ...section, loading: true, error: null })))
    SECTION_DEFS.forEach((def) => {
      gh<any[]>(`/repos/${owner}/${repo}/${def.endpoint}`).then((res) => {
        if (!alive) return
        setSections((prev) =>
          prev.map((section) =>
            section.key === def.key
              ? {
                  ...section,
                  loading: false,
                  data: res.ok && Array.isArray(res.data) ? res.data : null,
                  error: res.ok
                    ? null
                    : L(
                        'Not enabled or requires admin access.',
                        '未启用，或需要管理员权限。',
                      ),
                }
              : section,
          ),
        )
      })
    })
    return () => {
      alive = false
    }
  }, [owner, repo, lang])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <section className="card card-body">
        <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
          <ShieldCheck size={18} color="var(--accent)" />
          <div>
            <div className="card-title">{L('Security overview', '安全概览')}</div>
            <p className="muted" style={{ fontSize: 12.5, margin: '4px 0 0' }}>
              {L(
                'Security features depend on repository settings and your access level.',
                '安全功能取决于仓库设置和你的访问权限。',
              )}
            </p>
          </div>
        </div>
      </section>

      {sections.map((section) => (
        <section className="card" key={section.key}>
          <div className="card-head">
            <div className="card-title">
              {section.key === 'advisories' ? (
                <ShieldAlert size={15} />
              ) : section.key === 'secret' ? (
                <ShieldX size={15} />
              ) : (
                <AlertTriangle size={15} />
              )}
              {section.label}
            </div>
            {section.data ? <Badge tone={section.data.length ? 'red' : 'green'}>{section.data.length}</Badge> : null}
          </div>
          {section.loading ? (
            <LoadingBlock />
          ) : section.error ? (
            <div className="note">
              <ShieldCheck size={14} />
              <span style={{ flex: 1 }}>{section.error}</span>
            </div>
          ) : !section.data?.length ? (
            <div className="readme-empty">
              {section.key === 'advisories'
                ? L('No published advisories.', '没有已发布的安全公告。')
                : L('No open alerts.', '没有未处理的告警。')}
            </div>
          ) : (
            <div className="list">
              {section.data.slice(0, 20).map((item: any) => (
                <div className="list-item" key={item.ghsa_id || item.number || item.id}>
                  <div className="item-main">
                    <div className="item-title">
                      {item.summary || item.rule?.description || item.title || item.ghsa_id || `#${item.number}`}
                    </div>
                    <div className="item-meta">
                      {item.severity ? <Badge tone={item.severity === 'critical' ? 'red' : 'gold'}>{item.severity}</Badge> : null}
                      {item.state ? <span>{item.state}</span> : null}
                      {item.published_at ? <span>{new Date(item.published_at).toLocaleDateString()}</span> : null}
                      {item.created_at ? <span>{new Date(item.created_at).toLocaleDateString()}</span> : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      ))}
      <div className="note">
        <ShieldCheck size={14} />
        <span style={{ flex: 1 }}>{t('repo.community')}</span>
      </div>
    </div>
  )
}
