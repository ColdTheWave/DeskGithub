import { app, net, safeStorage } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

export type GitHubUser = {
  login: string
  id: number
  name: string | null
  avatar_url: string
  html_url: string
  bio: string | null
  company: string | null
  location: string | null
  public_repos: number
  followers: number
  following: number
  created_at: string
}

type StoredSession = {
  token: string
  login: string
  user: GitHubUser | null
}

let cached: StoredSession | null | undefined

function sessionFile() {
  return path.join(app.getPath('userData'), 'session.dat')
}

function encrypt(value: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    return 'enc:' + safeStorage.encryptString(value).toString('base64')
  }
  return 'b64:' + Buffer.from(value, 'utf8').toString('base64')
}

function decrypt(value: string): string | null {
  try {
    if (value.startsWith('enc:')) {
      return safeStorage.decryptString(Buffer.from(value.slice(4), 'base64'))
    }
    if (value.startsWith('b64:')) {
      return Buffer.from(value.slice(4), 'base64').toString('utf8')
    }
  } catch {
    return null
  }
  return null
}

function load(): StoredSession | null {
  if (cached !== undefined) return cached
  try {
    if (!fs.existsSync(sessionFile())) {
      cached = null
      return cached
    }
    const raw = JSON.parse(fs.readFileSync(sessionFile(), 'utf8')) as { token: string; login: string; user: GitHubUser | null }
    const token = decrypt(raw.token)
    if (!token) {
      cached = null
      return cached
    }
    cached = { token, login: raw.login, user: raw.user ?? null }
    return cached
  } catch {
    cached = null
    return cached
  }
}

export function encryptSecret(value: string): string {
  return encrypt(value)
}

export function decryptSecret(value: string): string | null {
  return decrypt(value)
}

function persist(session: StoredSession) {
  cached = session
  fs.mkdirSync(path.dirname(sessionFile()), { recursive: true })
  fs.writeFileSync(
    sessionFile(),
    JSON.stringify({
      token: encrypt(session.token),
      login: session.login,
      user: session.user,
    }),
    { mode: 0o600 },
  )
}

export function getToken(): string | null {
  return load()?.token ?? null
}

export function getStoredUser(): GitHubUser | null {
  return load()?.user ?? null
}

export function clearSession() {
  cached = null
  try {
    if (fs.existsSync(sessionFile())) fs.unlinkSync(sessionFile())
  } catch {
    /* ignore */
  }
}

export async function fetchUser(token: string): Promise<GitHubUser> {
  const res = await net.fetch('https://api.github.com/user', {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'DeskGitHub',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })
  if (!res.ok) throw new Error(`GitHub /user failed with ${res.status}`)
  return (await res.json()) as GitHubUser
}

export async function setToken(token: string) {
  const user = await fetchUser(token)
  persist({ token, login: user.login, user })
  return user
}

export type DeviceFlowStart = {
  device_code: string
  user_code: string
  verification_uri: string
  expires_in: number
  interval: number
}

export async function startDeviceFlow(clientId: string, scope: string): Promise<DeviceFlowStart> {
  const res = await net.fetch('https://github.com/login/device/code', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'DeskGitHub',
    },
    body: new URLSearchParams({ client_id: clientId.trim(), scope }).toString(),
  })
  const data = (await res.json()) as Record<string, any>
  if (!res.ok || data.error) {
    throw new Error(data.error_description || data.error || `Device flow failed (${res.status})`)
  }
  return data as DeviceFlowStart
}

export type DevicePollResult =
  | { status: 'ok'; user: GitHubUser }
  | { status: 'pending' | 'slow_down' | 'expired' | 'denied'; error?: string }

export async function pollDeviceFlow(clientId: string, deviceCode: string): Promise<DevicePollResult> {
  const res = await net.fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'DeskGitHub',
    },
    body: new URLSearchParams({
      client_id: clientId.trim(),
      device_code: deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    }).toString(),
  })
  const data = (await res.json()) as Record<string, any>
  if (data.access_token) {
    const user = await setToken(String(data.access_token))
    return { status: 'ok', user }
  }
  const error = String(data.error || '')
  if (error === 'authorization_pending') return { status: 'pending' }
  if (error === 'slow_down') return { status: 'slow_down' }
  if (error === 'expired_token') return { status: 'expired', error }
  if (error === 'access_denied') return { status: 'denied', error }
  return { status: 'denied', error: data.error_description || error || `Poll failed (${res.status})` }
}
