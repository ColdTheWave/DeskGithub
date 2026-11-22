import { useCallback, useEffect, useState } from 'react'
import { apiErrorMessage, gh, gql } from './api'

type GhState<T> = {
  data: T | null
  loading: boolean
  error: string | null
  status: number
}

const CACHE_TTL = 20_000
const CACHE_LIMIT = 150
const responseCache = new Map<string, { data: unknown; at: number }>()
let cacheEpoch = 0

export function invalidateGhCache() {
  responseCache.clear()
  cacheEpoch += 1
}

function cacheKey(path: string) {
  return `${cacheEpoch}:${path}`
}

function readCache<T>(path: string) {
  const entry = responseCache.get(cacheKey(path))
  if (!entry) return null
  return { data: entry.data as T, fresh: Date.now() - entry.at < CACHE_TTL }
}

function writeCache(path: string, data: unknown) {
  if (responseCache.size >= CACHE_LIMIT) responseCache.clear()
  responseCache.set(cacheKey(path), { data, at: Date.now() })
}

export function useGh<T = any>(path: string | null, deps: unknown[] = []) {
  const initial = path ? readCache<T>(path) : null
  const [state, setState] = useState<GhState<T>>({
    data: initial?.data ?? null,
    loading: Boolean(path) && !initial,
    error: null,
    status: 0,
  })
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (!path) {
      setState({ data: null, loading: false, error: null, status: 0 })
      return
    }

    const cached = readCache<T>(path)
    if (cached?.fresh && nonce === 0) {
      setState({ data: cached.data, loading: false, error: null, status: 200 })
      return
    }

    let alive = true
    setState({ data: cached?.data ?? null, loading: true, error: null, status: 0 })

    gh<T>(path)
      .then((res) => {
        if (!alive) return
        if (res.ok) {
          writeCache(path, res.data)
          setState({ data: res.data, loading: false, error: null, status: res.status })
        } else {
          setState({
            data: null,
            loading: false,
            error: apiErrorMessage(res.data, `GitHub API error (${res.status})`),
            status: res.status,
          })
        }
      })
      .catch((err) => {
        if (!alive) return
        setState({
          data: null,
          loading: false,
          error: err instanceof Error ? err.message : 'Request failed',
          status: 0,
        })
      })

    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, nonce, ...deps])

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  return { ...state, reload }
}

export function useGql<T = any>(
  query: string | null,
  variables: Record<string, unknown> = {},
  deps: unknown[] = [],
) {
  const [nonce, setNonce] = useState(0)
  const variableKey = JSON.stringify(variables)
  const cacheId = query ? `gql:${query}:${variableKey}` : ''
  const initial = query ? readCache<T>(cacheId) : null
  const [state, setState] = useState<{ data: T | null; loading: boolean; error: string | null }>({
    data: initial?.data ?? null,
    loading: Boolean(query) && !initial,
    error: null,
  })

  useEffect(() => {
    if (!query) {
      setState({ data: null, loading: false, error: null })
      return
    }
    const cached = readCache<T>(cacheId)
    if (cached?.fresh && nonce === 0) {
      setState({ data: cached.data, loading: false, error: null })
      return
    }

    let alive = true
    setState({ data: cached?.data ?? null, loading: true, error: null })
    gql<T>(query, JSON.parse(variableKey) as Record<string, unknown>).then((res) => {
      if (!alive) return
      if (res.ok) {
        writeCache(cacheId, res.data)
        setState({ data: res.data, loading: false, error: null })
      } else {
        setState({ data: null, loading: false, error: res.error })
      }
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, variableKey, cacheId, nonce, ...deps])

  const reload = useCallback(() => setNonce((n) => n + 1), [])
  return { ...state, reload }
}
