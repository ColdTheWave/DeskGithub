import { net } from 'electron'
import { clearSession, getToken, getStoredUser, fetchUser } from './auth'

export type GhRequest = {
  path: string
  method?: string
  body?: unknown
  accept?: string
  noAuth?: boolean
}

export type RateLimitInfo = {
  limit: number
  remaining: number
  used: number
  reset: number
}

export type GhResponse = {
  ok: boolean
  status: number
  data: any
  rate: RateLimitInfo
  link: string | null
}

export async function ghRequest(req: GhRequest): Promise<GhResponse> {
  if (typeof req.path !== 'string' || !req.path.startsWith('/')) {
    return {
      ok: false,
      status: 400,
      data: { message: 'Invalid GitHub API path' },
      rate: { limit: 0, remaining: 0, used: 0, reset: 0 },
      link: null,
    }
  }

  const headers: Record<string, string> = {
    Accept: req.accept || 'application/vnd.github+json',
    'User-Agent': 'DeskGitHub',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  const token = getToken()
  if (!req.noAuth && token) headers.Authorization = `Bearer ${token}`

  const init: RequestInit = { method: req.method || 'GET', headers }
  if (req.body !== undefined && req.body !== null) {
    headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(req.body)
  }

  try {
    const res = await net.fetch('https://api.github.com' + req.path, init)
    const text = await res.text()
    let data: any = null
    if (text) {
      try {
        data = JSON.parse(text)
      } catch {
        data = text
      }
    }
    const rate: RateLimitInfo = {
      limit: Number(res.headers.get('x-ratelimit-limit') || 0),
      remaining: Number(res.headers.get('x-ratelimit-remaining') || 0),
      used: Number(res.headers.get('x-ratelimit-used') || 0),
      reset: Number(res.headers.get('x-ratelimit-reset') || 0),
    }
    return {
      ok: res.ok,
      status: res.status,
      data,
      rate,
      link: res.headers.get('link'),
    }
  } catch (err) {
    return {
      ok: false,
      status: 0,
      data: { message: err instanceof Error ? err.message : 'Network error' },
      rate: { limit: 0, remaining: 0, used: 0, reset: 0 },
      link: null,
    }
  }
}

export async function getSession() {
  const token = getToken()
  if (!token) return { authenticated: false, user: null }
  const cachedUser = getStoredUser()
  try {
    const user = await fetchUser(token)
    return { authenticated: true, user }
  } catch (err: any) {
    if (String(err?.message || '').includes('401')) {
      clearSession()
      return { authenticated: false, user: null }
    }
    return { authenticated: true, user: cachedUser }
  }
}
