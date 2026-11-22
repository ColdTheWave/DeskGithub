import { CheckCircle2, ExternalLink, ShieldCheck, XCircle } from 'lucide-react'
import { useApp } from '../lib/store'
import { useGh } from '../lib/hooks'
import { ErrorBlock, LoadingBlock, Modal } from './ui'
import { openExternal } from '../lib/desktop'

type CommunityFile = { name?: string; html_url?: string } | null

type CommunityProfile = {
  health_percentage: number
  description: string | null
  documentation: string | null
  files: {
    code_of_conduct: CommunityFile
    contributing: CommunityFile
    issue_template: CommunityFile
    pull_request_template: CommunityFile
    license: CommunityFile
    readme: CommunityFile
  }
}

export function CommunityModal({
  owner,
  repo,
  onClose,
}: {
  owner: string
  repo: string
  onClose: () => void
}) {
  const { t } = useApp()
  const profile = useGh<CommunityProfile>(`/repos/${owner}/${repo}/community/profile`)
  const security = useGh<{ html_url?: string }>(`/repos/${owner}/${repo}/contents/SECURITY.md`)

  const rows = profile.data
    ? [
        { label: 'README', file: profile.data.files?.readme || null },
        { label: 'LICENSE', file: profile.data.files?.license || null },
        { label: 'CONTRIBUTING', file: profile.data.files?.contributing || null },
        { label: 'CODE_OF_CONDUCT', file: profile.data.files?.code_of_conduct || null },
        { label: 'ISSUE_TEMPLATE', file: profile.data.files?.issue_template || null },
        { label: 'PULL_REQUEST_TEMPLATE', file: profile.data.files?.pull_request_template || null },
        { label: 'SECURITY.md', file: security.data ? { html_url: security.data.html_url } : null },
      ]
    : []

  return (
    <Modal
      wide
      title={t('community.title')}
      subtitle={`${owner}/${repo}`}
      icon={<ShieldCheck size={16} />}
      onClose={onClose}
    >
      {profile.loading ? (
        <LoadingBlock />
      ) : profile.error ? (
        <ErrorBlock message={profile.error} onRetry={profile.reload} />
      ) : (
        <>
          <div className="community-health">
            <div className="community-health-copy">
              <span>{t('community.health', { n: profile.data?.health_percentage ?? 0 })}</span>
              {profile.data?.description ? (
                <span className="muted" style={{ fontSize: 11.5 }}>
                  {profile.data.description}
                </span>
              ) : null}
            </div>
            <div className="community-health-bar">
              <span style={{ width: `${profile.data?.health_percentage ?? 0}%` }} />
            </div>
          </div>

          <div className="community-list">
            {rows.map((row) => (
              <div className="community-row" key={row.label}>
                {row.file ? (
                  <CheckCircle2 size={15} color="var(--green)" />
                ) : (
                  <XCircle size={15} color="var(--muted)" />
                )}
                <span className="community-label mono">{row.label}</span>
                <span className="muted community-state">
                  {row.file ? t('community.present') : t('community.missing')}
                </span>
                {row.file?.html_url ? (
                  <button
                    className="icon-btn ghost tiny"
                    title={t('app.openInBrowser')}
                    onClick={() => void openExternal(row.file!.html_url!)}
                  >
                    <ExternalLink size={12} />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </>
      )}
    </Modal>
  )
}
