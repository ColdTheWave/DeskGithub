import { useEffect, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  CircleDot,
  ExternalLink,
  GitBranch,
  Globe2,
  KeyRound,
  LogOut,
  Moon,
  Network,
  Sun,
} from 'lucide-react'
import { useApp } from '../lib/store'
import { Avatar, Badge, PageHeader } from '../components/ui'
import { getDesktop, openExternal, type AppInfo, type ProxyConfig } from '../lib/desktop'
import { gh, apiErrorMessage } from '../lib/api'
import { useGh } from '../lib/hooks'
import type { Lang } from '../lib/i18n'

export function SettingsPage() {
  const { t, lang, setLang, theme, setTheme, user, authenticated, clientId, saveClientId, openLogin, signOut, rate, toast, refreshSession } =
    useApp()
  const desktop = getDesktop()
  const L = (en: string, zh: string) => (lang === 'zh' ? zh : en)
  const [draftClientId, setDraftClientId] = useState(clientId)
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [gitVersion, setGitVersion] = useState<string | null>(null)
  const [proxy, setProxy] = useState<ProxyConfig | null>(null)
  const [proxyBusy, setProxyBusy] = useState<string | null>(null)
  const [proxyResult, setProxyResult] = useState<{ ok: boolean; text: string } | null>(null)
  const [ghName, setGhName] = useState('')
  const [ghBio, setGhBio] = useState('')
  const [ghCompany, setGhCompany] = useState('')
  const [ghLocation, setGhLocation] = useState('')
  const [ghBlog, setGhBlog] = useState('')
  const [ghTwitter, setGhTwitter] = useState('')
  const [profileBusy, setProfileBusy] = useState(false)
  const githubProfile = useGh<any>(authenticated ? '/user' : null, [authenticated])

  useEffect(() => {
    setDraftClientId(clientId)
  }, [clientId])

  useEffect(() => {
    const data = githubProfile.data
    if (!data) return
    setGhName(data.name || '')
    setGhBio(data.bio || '')
    setGhCompany(data.company || '')
    setGhLocation(data.location || '')
    setGhBlog(data.blog || '')
    setGhTwitter(data.twitter_username || '')
  }, [githubProfile.data])

  const saveGithubProfile = async () => {
    setProfileBusy(true)
    const res = await gh('/user', {
      method: 'PATCH',
      body: {
        name: ghName,
        bio: ghBio,
        company: ghCompany,
        location: ghLocation,
        blog: ghBlog,
        twitter_username: ghTwitter,
      },
    })
    setProfileBusy(false)
    if (res.ok) {
      toast(t('settings.saved'), 'success')
      await refreshSession()
      githubProfile.reload()
    } else {
      toast(apiErrorMessage(res.data, t('app.requestFailed', { status: res.status })), 'error')
    }
  }

  useEffect(() => {
    const api = getDesktop()
    if (!api) return
    api.app.info().then(setInfo)
    api.git.version().then((res) => setGitVersion(res.ok ? res.stdout.trim() : null))
    api.proxy.get().then(setProxy)
  }, [])

  const save = () => {
    saveClientId(draftClientId)
    toast(t('settings.saved'), 'success')
  }

  const doSignOut = async () => {
    if (!window.confirm(t('auth.signOutConfirm'))) return
    await signOut()
  }

  const patchProxy = (patch: Partial<ProxyConfig>) => {
    setProxy((prev) => (prev ? { ...prev, ...patch } : prev))
  }

  const applyProxy = async () => {
    if (!desktop || !proxy) return
    setProxyBusy('save')
    setProxyResult(null)
    const res = await desktop.proxy.set(proxy)
    setProxyBusy(null)
    if (res.ok && res.config) {
      setProxy(res.config)
      toast(t('settings.proxyApplied'), 'success')
    } else {
      toast(res.error || t('settings.proxyFail'), 'error')
    }
  }

  const testProxy = async () => {
    if (!desktop || !proxy) return
    setProxyBusy('test')
    setProxyResult(null)
    const saved = await desktop.proxy.set(proxy)
    if (!saved.ok) {
      setProxyBusy(null)
      setProxyResult({ ok: false, text: saved.error || t('settings.proxyFail') })
      return
    }
    if (saved.config) setProxy(saved.config)
    const result = await desktop.proxy.test()
    setProxyBusy(null)
    setProxyResult({
      ok: result.ok,
      text: `${result.ok ? t('settings.proxyOk') : t('settings.proxyFail')} · ${result.message}`,
    })
  }

  const languages: { key: Lang; label: string }[] = [
    { key: 'zh', label: t('settings.languageZh') },
    { key: 'en', label: t('settings.languageEn') },
  ]

  return (
    <div className="page">
      <PageHeader title={t('settings.title')} subtitle={t('settings.subtitle')} />

      <div className="settings-grid">
        <div className="settings-col">
        <section className="card">
          <div className="card-head">
            <div className="card-title">
              <Globe2 size={15} />
              {t('settings.appearance')}
            </div>
          </div>
          <div className="card-body">
            <div className="setting-row">
              <div className="setting-row-copy">
                <div className="setting-row-title">{t('settings.language')}</div>
                <div className="setting-row-desc">{t('settings.languageHint')}</div>
              </div>
              <div className="setting-row-control">
                <div className="segmented">
                  {languages.map((item) => (
                    <button
                      key={item.key}
                      className={lang === item.key ? 'active' : ''}
                      onClick={() => setLang(item.key)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="setting-row">
              <div className="setting-row-copy">
                <div className="setting-row-title">{t('settings.theme')}</div>
                <div className="setting-row-desc">{t('settings.themeHint')}</div>
              </div>
              <div className="setting-row-control">
                <div className="segmented">
                  <button
                    className={theme === 'dark' ? 'active' : ''}
                    onClick={() => setTheme('dark')}
                    title={t('settings.themeDark')}
                  >
                    <Moon size={12} />
                    {t('settings.themeDark')}
                  </button>
                  <button
                    className={theme === 'light' ? 'active' : ''}
                    onClick={() => setTheme('light')}
                    title={t('settings.themeLight')}
                  >
                    <Sun size={12} />
                    {t('settings.themeLight')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <div className="card-title">
              <KeyRound size={15} />
              {t('settings.account')}
            </div>
            <Badge tone={authenticated ? 'green' : 'gold'}>
              {authenticated ? t('settings.fullStatusOn') : t('settings.fullStatusOff')}
            </Badge>
          </div>
          <div className="card-body">
            <div className="setting-row">
              <div className="row" style={{ minWidth: 0 }}>
                {authenticated && user ? (
                  <Avatar user={user} size={38} />
                ) : (
                  <span className="avatar" style={{ width: 38, height: 38, display: 'grid', placeItems: 'center', background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                    <GitBranch size={18} />
                  </span>
                )}
                <div style={{ minWidth: 0 }}>
                  <div className="setting-row-title">
                    {authenticated && user ? user.name || user.login : t('app.anonymous')}
                  </div>
                  <div className="setting-row-desc">
                    {authenticated && user ? `@${user.login} · ${t('settings.tokenStored')}` : t('settings.limitedDesc')}
                  </div>
                </div>
              </div>
              <div className="setting-row-control">
                {authenticated ? (
                  <button className="btn danger small" onClick={() => void doSignOut()}>
                    <LogOut size={13} />
                    {t('settings.signOutHere')}
                  </button>
                ) : (
                  <button className="btn primary small" onClick={openLogin}>
                    {t('settings.signInHere')}
                  </button>
                )}
              </div>
            </div>

            <div className="field" style={{ marginTop: 14 }}>
              <label className="field-label" htmlFor="settings-client-id">
                {t('settings.clientId')}
              </label>
              <div className="row">
                <input
                  id="settings-client-id"
                  className="input mono"
                  value={draftClientId}
                  onChange={(event) => setDraftClientId(event.target.value)}
                  placeholder={t('auth.clientIdPlaceholder')}
                  spellCheck={false}
                />
                <button className="btn" onClick={save}>
                  {t('settings.save')}
                </button>
              </div>
              <div className="field-hint">{t('settings.clientIdHint')}</div>
            </div>

            <div className="note" style={{ marginTop: 14 }}>
              <ExternalLink size={14} />
              <div>
                {t('settings.oauthAppHint')}{' '}
                <button
                  className="btn small ghost"
                  style={{ height: 'auto', padding: 0, color: 'var(--accent)' }}
                  onClick={() => void openExternal('https://github.com/settings/applications/new')}
                >
                  {t('settings.oauthApp')}
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <div className="card-title">
              <CircleDot size={15} />
              {L('GitHub profile', 'GitHub 资料')}
            </div>
            {authenticated && user ? <Badge tone="green">@{user.login}</Badge> : null}
          </div>
          <div className="card-body">
            {!authenticated ? (
              <div className="field-hint">{L('Sign in to edit your GitHub profile.', '登录后可编辑 GitHub 资料。')}</div>
            ) : (
              <>
                <div className="field">
                  <label className="field-label">{L('Name', '姓名')}</label>
                  <input className="input" value={ghName} onChange={(event) => setGhName(event.target.value)} />
                </div>
                <div className="field">
                  <label className="field-label">{L('Bio', '简介')}</label>
                  <textarea className="textarea" value={ghBio} onChange={(event) => setGhBio(event.target.value)} />
                </div>
                <div className="field">
                  <label className="field-label">{L('Company', '公司')}</label>
                  <input className="input" value={ghCompany} onChange={(event) => setGhCompany(event.target.value)} />
                </div>
                <div className="field">
                  <label className="field-label">{L('Location', '所在地')}</label>
                  <input className="input" value={ghLocation} onChange={(event) => setGhLocation(event.target.value)} />
                </div>
                <div className="field">
                  <label className="field-label">{L('Website', '网站')}</label>
                  <input className="input" value={ghBlog} onChange={(event) => setGhBlog(event.target.value)} />
                </div>
                <div className="field">
                  <label className="field-label">{L('X / Twitter username', 'X / Twitter 用户名')}</label>
                  <input
                    className="input"
                    value={ghTwitter}
                    onChange={(event) => setGhTwitter(event.target.value)}
                  />
                </div>
                <div className="action-row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
                  <button className="btn primary" onClick={() => void saveGithubProfile()} disabled={profileBusy}>
                    {profileBusy ? <span className="spinner" /> : null}
                    {t('settings.save')}
                  </button>
                </div>
                <div className="note" style={{ marginTop: 12 }}>
                  <ExternalLink size={14} />
                  <div>
                    {L('Manage emails, SSH keys and tokens on GitHub.', '在 GitHub 上管理邮箱、SSH 密钥和令牌。')}{' '}
                    <button
                      className="btn small ghost"
                      style={{ height: 'auto', padding: 0, color: 'var(--accent)' }}
                      onClick={() => void openExternal('https://github.com/settings/profile')}
                    >
                      GitHub settings
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </section>
        </div>

        <div className="settings-col">
        <section className="card">
          <div className="card-head">
            <div className="card-title">
              <Network size={15} />
              {t('settings.network')}
            </div>
            {proxy ? (
              <Badge tone={proxy.mode === 'manual' ? 'blue' : proxy.mode === 'direct' ? 'default' : 'green'}>
                {proxy.mode === 'manual'
                  ? `${proxy.protocol}://${proxy.host || '—'}:${proxy.port}`
                  : proxy.mode === 'direct'
                    ? t('settings.proxyDirect')
                    : t('settings.proxySystem')}
              </Badge>
            ) : null}
          </div>
          <div className="card-body">
            {!desktop || !proxy ? (
              <div className="field-hint">{t('settings.proxyUnsupported')}</div>
            ) : (
              <>
                <div className="setting-row" style={{ paddingTop: 0 }}>
                  <div className="setting-row-copy">
                    <div className="setting-row-title">{t('settings.proxyMode')}</div>
                    <div className="setting-row-desc">{t('settings.proxyHint')}</div>
                  </div>
                  <div className="setting-row-control">
                    <div className="segmented">
                      {(['system', 'direct', 'manual'] as const).map((mode) => (
                        <button
                          key={mode}
                          className={proxy.mode === mode ? 'active' : ''}
                          onClick={() => {
                            patchProxy({ mode })
                            setProxyResult(null)
                          }}
                        >
                          {mode === 'system'
                            ? t('settings.proxySystem')
                            : mode === 'direct'
                              ? t('settings.proxyDirect')
                              : t('settings.proxyManual')}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {proxy.mode === 'manual' ? (
                  <>
                    <div className="form-grid" style={{ marginTop: 14 }}>
                      <div className="field">
                        <label className="field-label">{t('settings.proxyProtocol')}</label>
                        <select
                          className="select"
                          value={proxy.protocol}
                          onChange={(event) => patchProxy({ protocol: event.target.value as ProxyConfig['protocol'] })}
                        >
                          <option value="http">HTTP</option>
                          <option value="https">HTTPS</option>
                          <option value="socks5">SOCKS5</option>
                        </select>
                      </div>
                      <div className="field">
                        <label className="field-label">{t('settings.proxyBypass')}</label>
                        <input
                          className="input mono"
                          value={proxy.bypass}
                          onChange={(event) => patchProxy({ bypass: event.target.value })}
                          placeholder="<local>, *.corp.example.com"
                        />
                      </div>
                    </div>
                    <div className="form-grid" style={{ marginTop: 12 }}>
                      <div className="field">
                        <label className="field-label">{t('settings.proxyHost')}</label>
                        <input
                          className="input mono"
                          value={proxy.host}
                          onChange={(event) => patchProxy({ host: event.target.value })}
                          placeholder="127.0.0.1"
                          spellCheck={false}
                        />
                      </div>
                      <div className="field">
                        <label className="field-label">{t('settings.proxyPort')}</label>
                        <input
                          className="input mono"
                          type="number"
                          min={1}
                          max={65535}
                          value={proxy.port}
                          onChange={(event) => patchProxy({ port: Number(event.target.value) })}
                        />
                      </div>
                      <div className="field">
                        <label className="field-label">
                          {t('settings.proxyUsername')} <span className="muted">({t('app.optional')})</span>
                        </label>
                        <input
                          className="input"
                          value={proxy.username}
                          onChange={(event) => patchProxy({ username: event.target.value })}
                          autoComplete="off"
                        />
                      </div>
                      <div className="field">
                        <label className="field-label">
                          {t('settings.proxyPassword')} <span className="muted">({t('app.optional')})</span>
                        </label>
                        <input
                          className="input"
                          type="password"
                          value={proxy.password}
                          onChange={(event) => patchProxy({ password: event.target.value })}
                          autoComplete="new-password"
                        />
                      </div>
                    </div>
                    <div className="field-hint" style={{ marginTop: 6 }}>
                      {t('settings.proxyBypassHint')}
                    </div>
                  </>
                ) : null}

                <div className="action-row" style={{ marginTop: 16, alignItems: 'center' }}>
                  <button className="btn primary" onClick={() => void applyProxy()} disabled={proxyBusy !== null}>
                    {proxyBusy === 'save' ? <span className="spinner" /> : null}
                    {t('settings.proxyApply')}
                  </button>
                  <button className="btn" onClick={() => void testProxy()} disabled={proxyBusy !== null}>
                    {proxyBusy === 'test' ? <span className="spinner" /> : <Network size={14} />}
                    {proxyBusy === 'test' ? t('settings.proxyTesting') : t('settings.proxyTest')}
                  </button>
                  <span className="spacer" />
                  <span className="field-hint" style={{ margin: 0 }}>
                    {t('settings.proxyEncrypted')}
                  </span>
                </div>

                {proxyResult ? (
                  <div className={proxyResult.ok ? 'note' : 'error-block'} style={{ marginTop: 12 }}>
                    {proxyResult.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                    <span>{proxyResult.text}</span>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <div className="card-title">
              <CircleDot size={15} />
              {t('settings.rateNow')}
            </div>
          </div>
          <div className="card-body">
            <div className="kv">
              <span>{t('app.rateLimit')}</span>
              <span className="mono">
                {rate ? `${rate.remaining.toLocaleString()} / ${rate.limit.toLocaleString()}` : '—'}
              </span>
            </div>
            <div className="kv">
              <span>{t('settings.fullStatus')}</span>
              <span>{authenticated ? t('settings.fullStatusOn') : t('settings.fullStatusOff')}</span>
            </div>
            <div className="kv">
              <span>{t('settings.git')}</span>
              <span className="mono">{gitVersion || t('local.gitMissing')}</span>
            </div>
            <div className="kv">
              <span>{t('settings.deviceFlowNote')}</span>
              <CheckCircle2 size={14} color="var(--green)" />
            </div>
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <div className="card-title">
              <GitBranch size={15} />
              {t('settings.about')}
            </div>
          </div>
          <div className="card-body">
            <p className="field-hint" style={{ marginTop: 0 }}>
              {t('settings.aboutText')}
            </p>
            <div className="kv">
              <span>{t('settings.version')}</span>
              <span className="mono">v{info?.version || '1.0.0'}</span>
            </div>
            <div className="kv">
              <span>{t('settings.platform')}</span>
              <span className="mono">
                {info ? `${info.platform} ${info.arch}` : '—'}
              </span>
            </div>
            <div className="kv">
              <span>Electron</span>
              <span className="mono">{info?.electron || '—'}</span>
            </div>
            <div className="kv">
              <span>Chrome</span>
              <span className="mono">{info?.chrome || '—'}</span>
            </div>
            <div className="kv">
              <span>Node</span>
              <span className="mono">{info?.node || '—'}</span>
            </div>
            <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn small" onClick={() => void openExternal('https://github.com')}>
                <ExternalLink size={12} />
                GitHub
              </button>
              <button className="btn small" onClick={() => void openExternal('https://docs.github.com/rest')}>
                <ExternalLink size={12} />
                REST API
              </button>
            </div>
          </div>
        </section>
        </div>
      </div>
    </div>
  )
}
