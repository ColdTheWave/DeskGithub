import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Check, CheckCircle2, Copy, ExternalLink, Info, KeyRound, Lock, ShieldCheck } from 'lucide-react'
import { useApp } from '../lib/store'
import { Modal } from './ui'
import { copyText, getDesktop, openExternal, type DeviceFlow } from '../lib/desktop'

type Phase = 'client' | 'waiting' | 'error'

export function LoginModal() {
  const { t, loginOpen, closeLogin, clientId, saveClientId, completeLogin, toast } = useApp()
  const [localClientId, setLocalClientId] = useState(clientId)
  const [flow, setFlow] = useState<DeviceFlow | null>(null)
  const [phase, setPhase] = useState<Phase>('client')
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')
  const [remaining, setRemaining] = useState(0)
  const [copied, setCopied] = useState(false)
  const pollToken = useRef(0)

  useEffect(() => {
    if (loginOpen) {
      setLocalClientId(clientId)
      setFlow(null)
      setPhase('client')
      setError('')
      setStarting(false)
      setCopied(false)
    }
    // Only reset when the modal opens; saving the client id must not interrupt the flow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loginOpen])

  useEffect(() => {
    if (!flow || phase !== 'waiting') return
    const desktop = getDesktop()
    if (!desktop) return
    setRemaining(flow.expires_in)
    const countdown = window.setInterval(() => {
      setRemaining((value) => (value > 0 ? value - 1 : 0))
    }, 1000)
    return () => window.clearInterval(countdown)
  }, [flow, phase])

  useEffect(() => {
    if (!flow || phase !== 'waiting') return
    const desktop = getDesktop()
    if (!desktop) return
    const token = ++pollToken.current
    let timer = 0
    let cancelled = false

    const tick = async () => {
      if (cancelled) return
      try {
        const result = await desktop.auth.poll({ clientId: localClientId, deviceCode: flow.device_code })
        if (cancelled || token !== pollToken.current) return
        if (result.status === 'ok' && 'user' in result) {
          completeLogin(result.user)
          return
        }
        if (result.status === 'pending') {
          timer = window.setTimeout(tick, Math.max(4, flow.interval) * 1000)
          return
        }
        if (result.status === 'slow_down') {
          timer = window.setTimeout(tick, (Math.max(4, flow.interval) + 5) * 1000)
          return
        }
        if (result.status === 'expired') {
          setPhase('error')
          setError(t('auth.expired'))
          return
        }
        setPhase('error')
        setError(('error' in result && result.error) || t('auth.denied'))
      } catch (err) {
        if (cancelled) return
        setPhase('error')
        setError(err instanceof Error ? err.message : t('auth.denied'))
      }
    }

    timer = window.setTimeout(tick, Math.max(4, flow.interval) * 1000)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [flow, phase, localClientId, completeLogin, t])

  if (!loginOpen) return null

  const desktop = getDesktop()

  const start = async () => {
    const id = localClientId.trim()
    if (!id) {
      setError(t('auth.enterClientFirst'))
      return
    }
    if (!desktop) {
      setError(t('auth.notSupportedBrowser'))
      return
    }
    saveClientId(id)
    setStarting(true)
    setError('')
    const res = await desktop.auth.start({ clientId: id })
    setStarting(false)
    if (!res.ok || !res.flow) {
      setError(res.error || t('auth.failed'))
      return
    }
    setFlow(res.flow)
    setPhase('waiting')
    void openExternal(res.flow.verification_uri)
  }

  const copyCode = async () => {
    if (!flow) return
    const ok = await copyText(flow.user_code)
    if (ok) {
      setCopied(true)
      toast(t('app.copied'), 'success')
      window.setTimeout(() => setCopied(false), 1800)
    }
  }

  const reset = () => {
    pollToken.current += 1
    setFlow(null)
    setPhase('client')
    setError('')
  }

  const stepOne = phase === 'client' ? 'active' : 'done'
  const stepTwo = phase === 'client' ? '' : phase === 'error' ? 'active' : 'active'

  return (
    <Modal wide onClose={closeLogin} title={t('auth.signInTitle')} subtitle={t('auth.signInSubtitle')} icon={<Lock size={17} />}>
      <div className="login-hero">
        <div className="benefits" style={{ margin: 0 }}>
          {[t('auth.benefitPrivate'), t('auth.benefitIssues'), t('auth.benefitNotif'), t('auth.benefitGit')].map((item) => (
            <div className="benefit" key={item}>
              <Check size={13} />
              <span>{item}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="steps">
        <div className={`step ${stepOne}`}>
          <span className="step-dot">{phase === 'client' ? '1' : <Check size={11} />}</span>
          <span>{t('auth.stepClient')}</span>
        </div>
        <div className="step-line" />
        <div className={`step ${stepTwo}`}>
          <span className="step-dot">2</span>
          <span>{t('auth.stepAuthorize')}</span>
        </div>
        <div className="step-line" />
        <div className="step">
          <span className="step-dot">3</span>
          <span>{t('auth.stepDone')}</span>
        </div>
      </div>

      {phase === 'client' ? (
        <>
          <div className="field">
            <label className="field-label" htmlFor="client-id">
              {t('auth.clientIdLabel')}
            </label>
            <div className="row">
              <input
                id="client-id"
                className="input mono"
                value={localClientId}
                onChange={(event) => setLocalClientId(event.target.value)}
                placeholder={t('auth.clientIdPlaceholder')}
                spellCheck={false}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void start()
                }}
              />
              <button
                className="btn"
                type="button"
                onClick={() => void openExternal('https://github.com/settings/applications/new')}
                title={t('auth.createOAuthApp')}
              >
                <ExternalLink size={14} />
              </button>
            </div>
            <div className="field-hint">{t('auth.clientIdHelp')}</div>
          </div>

          <div className="note" style={{ marginTop: 14 }}>
            <Info size={14} />
            <div>
              {t('auth.scopeNote')}
              <br />
              {t('auth.secureStorage')}
            </div>
          </div>

          {error ? (
            <div style={{ marginTop: 12 }}>
              <div className="error-block">
                <span>{error}</span>
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <>
          {phase === 'waiting' && flow ? (
            <>
              <div className="code-display">
                <div>
                  <div className="field-hint" style={{ marginBottom: 4 }}>
                    {t('auth.deviceCodeTitle')}
                  </div>
                  <div className="code-value">{flow.user_code}</div>
                </div>
                <button className="btn" onClick={() => void copyCode()}>
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? t('app.copied') : t('auth.copyCode')}
                </button>
              </div>
              <div className="row" style={{ marginTop: 10 }}>
                <button className="btn" onClick={() => void openExternal(flow.verification_uri)}>
                  <ExternalLink size={14} />
                  {t('auth.openGitHub')}
                </button>
                <span className="muted" style={{ fontSize: 11.5 }}>
                  {t('auth.deviceCodeHelp')}
                </span>
              </div>
              <div className="device-wait">
                <span className="spinner" />
                <span>{t('auth.waiting')}</span>
                {remaining > 0 ? (
                  <span className="muted">
                    ({Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')})
                  </span>
                ) : null}
              </div>
              <div className="note" style={{ marginTop: 14 }}>
                <ShieldCheck size={14} />
                <div>{t('settings.deviceFlowNote')}</div>
              </div>
            </>
          ) : (
            <>
              <div className="error-block" style={{ marginTop: 4 }}>
                <span>{error || t('auth.denied')}</span>
              </div>
              <div className="device-wait">
                <button className="btn" onClick={reset}>
                  <KeyRound size={14} />
                  {t('app.retry')}
                </button>
              </div>
            </>
          )}
        </>
      )}

      <div className="modal-foot" style={{ paddingLeft: 0, paddingRight: 0 }}>
        <button className="btn ghost" onClick={closeLogin}>
          {t('app.cancel')}
        </button>
        {phase === 'client' ? (
          <button className="btn primary" onClick={() => void start()} disabled={starting}>
            {starting ? <span className="spinner" /> : <ArrowRight size={14} />}
            {t('auth.stepAuthorize')}
          </button>
        ) : phase === 'waiting' ? (
          <button className="btn ghost" onClick={closeLogin}>
            {t('app.close')}
          </button>
        ) : (
          <button className="btn primary" onClick={reset}>
            {t('app.retry')}
          </button>
        )}
      </div>

      <div className="note" style={{ marginBottom: 16 }}>
        <CheckCircle2 size={14} />
        <div>{t('auth.anonymousNote')}</div>
      </div>
    </Modal>
  )
}
