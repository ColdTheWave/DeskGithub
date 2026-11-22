import { app, net, session, type Session } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { decryptSecret, encryptSecret } from './auth'

export type ProxyMode = 'system' | 'direct' | 'manual'
export type ProxyProtocol = 'http' | 'https' | 'socks5'

export type ProxyConfig = {
  mode: ProxyMode
  protocol: ProxyProtocol
  host: string
  port: number
  username: string
  password: string
  bypass: string
}

const DEFAULT_CONFIG: ProxyConfig = {
  mode: 'system',
  protocol: 'http',
  host: '',
  port: 7890,
  username: '',
  password: '',
  bypass: '<local>',
}

let cached: ProxyConfig | null = null
let proxyCredentials: { username: string; password: string } | null = null
let loginHandlerInstalled = false

function configFile() {
  return path.join(app.getPath('userData'), 'proxy.json')
}

function normalize(input: Partial<ProxyConfig>): ProxyConfig {
  const mode: ProxyMode =
    input.mode === 'direct' || input.mode === 'manual' || input.mode === 'system' ? input.mode : 'system'
  const protocol: ProxyProtocol =
    input.protocol === 'https' || input.protocol === 'socks5' || input.protocol === 'http'
      ? input.protocol
      : 'http'
  const host = String(input.host ?? '').trim()
  const port = Number(input.port)
  const username = String(input.username ?? '').trim()
  const password = String(input.password ?? '')
  const bypass = String(input.bypass ?? '').trim()

  if (mode === 'manual') {
    if (!host) throw new Error('Proxy host is required')
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Proxy port must be between 1 and 65535')
  }

  return {
    mode,
    protocol,
    host,
    port: Number.isInteger(port) ? port : 0,
    username,
    password,
    bypass: bypass || '<local>',
  }
}

function load(): ProxyConfig {
  if (cached) return cached
  try {
    if (!fs.existsSync(configFile())) {
      cached = { ...DEFAULT_CONFIG }
      return cached
    }
    const raw = JSON.parse(fs.readFileSync(configFile(), 'utf8')) as Partial<ProxyConfig> & { password?: string }
    const password = raw.password ? decryptSecret(String(raw.password)) ?? '' : ''
    cached = normalize({ ...raw, password })
    return cached
  } catch {
    cached = { ...DEFAULT_CONFIG }
    return cached
  }
}

function persist(config: ProxyConfig) {
  fs.mkdirSync(path.dirname(configFile()), { recursive: true })
  fs.writeFileSync(
    configFile(),
    JSON.stringify({ ...config, password: config.password ? encryptSecret(config.password) : '' }, null, 2),
    { mode: 0o600 },
  )
}

function installLoginHandler() {
  if (loginHandlerInstalled) return
  loginHandlerInstalled = true
  app.on('login', (event, _webContents, _details, authInfo, callback) => {
    if (authInfo.isProxy && proxyCredentials) {
      event.preventDefault()
      callback(proxyCredentials.username, proxyCredentials.password)
    }
  })
}

export function getProxyConfig(): ProxyConfig {
  return { ...load() }
}

export async function applyProxyToSession(ses: Session, config: ProxyConfig = load()) {
  if (config.mode === 'direct') {
    await ses.setProxy({ mode: 'direct' })
    proxyCredentials = null
  } else if (config.mode === 'system') {
    await ses.setProxy({ mode: 'system' })
    proxyCredentials = null
  } else {
    const rules = `${config.protocol}://${config.host}:${config.port}`
    await ses.setProxy({
      mode: 'fixed_servers',
      proxyRules: rules,
      proxyBypassRules: config.bypass || '<local>',
    })
    proxyCredentials = config.username
      ? { username: config.username, password: config.password }
      : null
  }
  installLoginHandler()
  try {
    await ses.closeAllConnections()
  } catch {
    /* ignore */
  }
}

export async function applyProxyConfig(config: ProxyConfig = load()) {
  // Every window, the GitHub API client, device-flow login, images and remote
  // content share Electron's default session, so this covers the whole app.
  await applyProxyToSession(session.defaultSession, config)
}

export async function setProxyConfig(input: Partial<ProxyConfig>): Promise<ProxyConfig> {
  const config = normalize(input)
  persist(config)
  cached = config
  await applyProxyConfig(config)
  return { ...config }
}

function clearProxyEnv(): Record<string, string> {
  return {
    HTTP_PROXY: '',
    HTTPS_PROXY: '',
    ALL_PROXY: '',
    http_proxy: '',
    https_proxy: '',
    all_proxy: '',
    NO_PROXY: '*',
    no_proxy: '*',
  }
}

function envForProxyUrl(url: string, isSocks: boolean): Record<string, string> {
  const env: Record<string, string> = { ALL_PROXY: url, all_proxy: url }
  if (!isSocks) {
    env.HTTP_PROXY = url
    env.HTTPS_PROXY = url
    env.http_proxy = url
    env.https_proxy = url
  }
  return env
}

export async function getGitProxyEnv(): Promise<Record<string, string>> {
  const config = load()
  if (config.mode === 'direct') return clearProxyEnv()
  if (config.mode === 'manual') {
    if (!config.host) return {}
    const auth = config.username
      ? `${encodeURIComponent(config.username)}:${encodeURIComponent(config.password)}@`
      : ''
    const url = `${config.protocol}://${auth}${config.host}:${config.port}`
    return envForProxyUrl(url, config.protocol === 'socks5')
  }

  // System mode: resolve the OS proxy for the local Git subprocess as well.
  try {
    const resolved = await session.defaultSession.resolveProxy('https://github.com')
    const first = resolved.split(';')[0].trim()
    const [type, address] = first.split(/\s+/)
    if (!address || type === 'DIRECT') return {}
    const isSocks = type === 'SOCKS5' || type === 'SOCKS'
    return envForProxyUrl(`${isSocks ? 'socks5' : 'http'}://${address}`, isSocks)
  } catch {
    return {}
  }
}

export async function testProxy(): Promise<{ ok: boolean; status: number; message: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  try {
    const res = await net.fetch('https://api.github.com/rate_limit', {
      headers: { 'User-Agent': 'DeskGitHub', Accept: 'application/vnd.github+json' },
      signal: controller.signal,
    })
    return {
      ok: res.ok,
      status: res.status,
      message: res.ok ? 'OK' : `HTTP ${res.status}`,
    }
  } catch (err) {
    return {
      ok: false,
      status: 0,
      message: err instanceof Error ? err.message : 'Network error',
    }
  } finally {
    clearTimeout(timer)
  }
}
