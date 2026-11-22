import { getDesktop } from './desktop'
import type { GhResponse, RateInfo, SessionState } from './types'

export type GhOptions = {
  method?: string
  body?: unknown
  accept?: string
  noAuth?: boolean
}

export const RATE_EVENT = 'deskgithub:rate'

function emitRate(rate: RateInfo | undefined) {
  // Search (10/min) and some scoped endpoints report their own limits;
  // only surface the general REST/GraphQL quota in the header.
  if (!rate || !rate.limit || rate.limit < 60) return
  window.dispatchEvent(new CustomEvent<RateInfo>(RATE_EVENT, { detail: rate }))
}

export async function gh<T = any>(path: string, opts: GhOptions = {}): Promise<GhResponse<T>> {
  const desktop = getDesktop()
  if (desktop) {
    const res = (await desktop.request({
      path,
      method: opts.method,
      body: opts.body,
      accept: opts.accept,
      noAuth: opts.noAuth,
    })) as GhResponse<T>
    emitRate(res.rate)
    return res
  }

  // Browser fallback (anonymous only) — useful for quick UI previews in `vite`.
  try {
    const res = await fetch('https://api.github.com' + path, {
      method: opts.method || 'GET',
      headers: {
        Accept: opts.accept || 'application/vnd.github+json',
        ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    })
    const text = await res.text()
    let data: any = null
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      data = text
    }
    const rate: RateInfo = {
      limit: Number(res.headers.get('x-ratelimit-limit') || 0),
      remaining: Number(res.headers.get('x-ratelimit-remaining') || 0),
      used: Number(res.headers.get('x-ratelimit-used') || 0),
      reset: Number(res.headers.get('x-ratelimit-reset') || 0),
    }
    emitRate(rate)
    return { ok: res.ok, status: res.status, data, rate, link: res.headers.get('link') }
  } catch (err) {
    return {
      ok: false,
      status: 0,
      data: { message: err instanceof Error ? err.message : 'Network error' } as T,
      rate: { limit: 0, remaining: 0, used: 0, reset: 0 },
      link: null,
    }
  }
}

export type GqlResponse<T> = {
  ok: boolean
  status: number
  data: T | null
  error: string | null
}

export async function gql<T = any>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<GqlResponse<T>> {
  const res = await gh<any>('/graphql', { method: 'POST', body: { query, variables } })
  const errors = res.data?.errors as { message?: string }[] | undefined
  if (res.ok && !errors?.length) {
    return { ok: true, status: res.status, data: res.data?.data as T, error: null }
  }
  return {
    ok: false,
    status: res.status,
    data: null,
    error:
      errors?.[0]?.message ||
      (typeof res.data?.message === 'string' ? res.data.message : null) ||
      `GitHub GraphQL error (${res.status})`,
  }
}

export function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  const chunk = 0x8000
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk))
  }
  return btoa(binary)
}

export async function getSession(): Promise<SessionState> {
  const desktop = getDesktop()
  if (!desktop) return { authenticated: false, user: null }
  try {
    return await desktop.auth.session()
  } catch {
    return { authenticated: false, user: null }
  }
}

export function apiErrorMessage(data: any, fallback: string): string {
  if (!data) return fallback
  if (typeof data === 'string') return data
  if (typeof data.message === 'string' && data.message) return data.message
  return fallback
}
