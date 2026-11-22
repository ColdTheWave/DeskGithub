import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { GhUser, RateInfo } from './types'
import { translate, type Lang } from './i18n'
import { getSession, gh, RATE_EVENT } from './api'
import { invalidateGhCache } from './hooks'
import { getDesktop } from './desktop'

export type Theme = 'dark' | 'light'

export type Route =
  | { name: 'dashboard' }
  | { name: 'explore'; query?: string; tab?: 'repos' | 'users' | 'issues' | 'code' }
  | { name: 'repos' }
  | { name: 'repo'; owner: string; repo: string }
  | { name: 'issues' }
  | { name: 'pulls' }
  | { name: 'notifications' }
  | { name: 'local' }
  | { name: 'gists' }
  | { name: 'settings' }
  | { name: 'user'; login: string }
  | { name: 'org'; org: string }
  | { name: 'commit'; owner: string; repo: string; sha: string }
  | { name: 'issue'; owner: string; repo: string; number: number; kind: 'issue' | 'pull' }

export type ToastKind = 'success' | 'error' | 'info'
type Toast = { id: number; message: string; kind: ToastKind }

type AppContextValue = {
  lang: Lang
  setLang: (lang: Lang) => void
  t: (key: string, vars?: Record<string, string | number>) => string
  theme: Theme
  setTheme: (theme: Theme) => void
  route: Route
  navigate: (route: Route) => void
  back: () => void
  canGoBack: boolean
  authenticated: boolean
  user: GhUser | null
  sessionLoading: boolean
  sessionVersion: number
  refreshSession: () => Promise<void>
  completeLogin: (user: GhUser) => void
  signOut: () => Promise<void>
  rate: RateInfo | null
  loginOpen: boolean
  openLogin: () => void
  closeLogin: () => void
  toast: (message: string, kind?: ToastKind) => void
  toasts: Toast[]
  clientId: string
  saveClientId: (id: string) => void
}

const AppContext = createContext<AppContextValue | null>(null)

function readLocal(key: string, fallback: string) {
  try {
    return localStorage.getItem(key) || fallback
  } catch {
    return fallback
  }
}

function writeLocal(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* ignore */
  }
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => (readLocal('dg.lang', 'zh') === 'en' ? 'en' : 'zh'))
  const [theme, setThemeState] = useState<Theme>(() =>
    readLocal('dg.theme', 'dark') === 'light' ? 'light' : 'dark',
  )
  const [clientId, setClientId] = useState(() => readLocal('dg.clientId', ''))
  const [nav, setNav] = useState<{ route: Route; stack: Route[] }>({
    route: { name: 'dashboard' },
    stack: [],
  })
  const route = nav.route
  const [user, setUser] = useState<GhUser | null>(null)
  const [sessionLoading, setSessionLoading] = useState(true)
  const [sessionVersion, setSessionVersion] = useState(0)
  const [rate, setRate] = useState<RateInfo | null>(null)
  const [loginOpen, setLoginOpen] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const toastId = useRef(1)

  const setLang = useCallback((next: Lang) => {
    setLangState(next)
    writeLocal('dg.lang', next)
  }, [])

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    writeLocal('dg.theme', next)
  }, [])

  const saveClientId = useCallback((id: string) => {
    const trimmed = id.trim()
    setClientId(trimmed)
    writeLocal('dg.clientId', trimmed)
  }, [])

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => translate(lang, key, vars),
    [lang],
  )

  const navigate = useCallback((next: Route) => {
    setNav((prev) => ({ route: next, stack: [...prev.stack, prev.route] }))
    window.scrollTo({ top: 0 })
  }, [])

  const back = useCallback(() => {
    setNav((prev) => {
      if (prev.stack.length === 0) return prev
      return {
        route: prev.stack[prev.stack.length - 1],
        stack: prev.stack.slice(0, -1),
      }
    })
    window.scrollTo({ top: 0 })
  }, [])

  const toast = useCallback((message: string, kind: ToastKind = 'info') => {
    const id = toastId.current++
    setToasts((prev) => [...prev, { id, message, kind }])
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id))
    }, 3400)
  }, [])

  const refreshSession = useCallback(async () => {
    const session = await getSession()
    setUser(session.authenticated ? session.user : null)
    setSessionLoading(false)
    setSessionVersion((v) => v + 1)
  }, [])

  useEffect(() => {
    void refreshSession()
  }, [refreshSession])

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<RateInfo>).detail
      if (detail) setRate(detail)
    }
    window.addEventListener(RATE_EVENT, handler)
    return () => window.removeEventListener(RATE_EVENT, handler)
  }, [])

  useEffect(() => {
    let alive = true
    const load = async () => {
      const res = await gh<any>('/rate_limit')
      const core = res.data?.resources?.core
      if (!alive || !core) return
      setRate({ limit: core.limit, remaining: core.remaining, used: core.used, reset: core.reset })
    }
    void load()
    const timer = window.setInterval(load, 60_000)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [sessionVersion])

  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en'
  }, [lang])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    delete document.documentElement.dataset.skin
  }, [theme])

  const completeLogin = useCallback(
    (nextUser: GhUser) => {
      invalidateGhCache()
      setUser(nextUser)
      setLoginOpen(false)
      setSessionVersion((v) => v + 1)
      toast(translate(lang, 'auth.success'), 'success')
    },
    [lang, toast],
  )

  const signOut = useCallback(async () => {
    const desktop = getDesktop()
    if (desktop) await desktop.auth.logout()
    invalidateGhCache()
    setUser(null)
    setRate(null)
    setSessionVersion((v) => v + 1)
    toast(translate(lang, 'auth.signOutDone'), 'info')
  }, [lang, toast])

  const value = useMemo<AppContextValue>(
    () => ({
      lang,
      setLang,
      t,
      theme,
      setTheme,
      route,
      navigate,
      back,
      canGoBack: nav.stack.length > 0,
      authenticated: Boolean(user),
      user,
      sessionLoading,
      sessionVersion,
      refreshSession,
      completeLogin,
      signOut,
      rate,
      loginOpen,
      openLogin: () => setLoginOpen(true),
      closeLogin: () => setLoginOpen(false),
      toast,
      toasts,
      clientId,
      saveClientId,
    }),
    [
      lang,
      setLang,
      t,
      theme,
      setTheme,
      route,
      navigate,
      back,
      nav.stack.length,
      user,
      sessionLoading,
      sessionVersion,
      refreshSession,
      completeLogin,
      signOut,
      rate,
      loginOpen,
      toast,
      toasts,
      clientId,
      saveClientId,
    ],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside AppProvider')
  return ctx
}
