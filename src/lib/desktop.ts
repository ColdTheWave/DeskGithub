import type {
  GhResponse,
  LocalGitResult,
  LocalGitStatus,
  LocalGitCommit,
  SessionState,
} from './types'

export type AppInfo = {
  version: string
  platform: string
  arch: string
  home: string
  electron: string
  chrome: string
  node: string
}

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
export type ProxyTestResult = { ok: boolean; status: number; message: string }

export type DeviceFlow = {
  device_code: string
  user_code: string
  verification_uri: string
  expires_in: number
  interval: number
}

export type DesktopApi = {
  platform: string
  request: (req: {
    path: string
    method?: string
    body?: unknown
    accept?: string
    noAuth?: boolean
  }) => Promise<GhResponse>
  auth: {
    session: () => Promise<SessionState>
    start: (payload: { clientId: string }) => Promise<{ ok: boolean; flow?: DeviceFlow; error?: string }>
    poll: (payload: { clientId: string; deviceCode: string }) => Promise<
      { status: 'ok'; user: any } | { status: string; error?: string }
    >
    logout: () => Promise<{ ok: boolean }>
  }
  app: {
    info: () => Promise<AppInfo>
    openExternal: (url: string) => Promise<{ ok: boolean }>
  }
  proxy: {
    get: () => Promise<ProxyConfig>
    set: (config: ProxyConfig) => Promise<{ ok: boolean; config?: ProxyConfig; error?: string }>
    test: () => Promise<ProxyTestResult>
  }
  actions: {
    logs: (payload: {
      owner: string
      repo: string
      runId: number
    }) => Promise<{ ok: boolean; files?: { name: string; content: string }[]; error?: string; status?: number }>
    downloadArtifact: (payload: {
      owner: string
      repo: string
      artifactId: number
      name: string
    }) => Promise<{ ok: boolean; path?: string; canceled?: boolean; error?: string; status?: number }>
  }
  releases: {
    uploadAsset: (payload: {
      owner: string
      repo: string
      releaseId: number
    }) => Promise<{ ok: boolean; asset?: any; canceled?: boolean; error?: string; status?: number }>
  }
  wiki: {
    page: (payload: {
      owner: string
      repo: string
      page: string
    }) => Promise<{ ok: boolean; page?: string; content?: string; error?: string; status?: number }>
    save: (payload: {
      owner: string
      repo: string
      page: string
      content: string
      message?: string
    }) => Promise<{ ok: boolean; page?: string; error?: string }>
    pages: (payload: {
      owner: string
      repo: string
    }) => Promise<{ ok: boolean; pages: string[]; error?: string }>
    delete: (payload: {
      owner: string
      repo: string
      page: string
    }) => Promise<{ ok: boolean; error?: string }>
  }
  git: {
    version: () => Promise<LocalGitResult>
    pickDirectory: () => Promise<string | null>
    validate: (dir: string) => Promise<{ ok: boolean; error: string | null }>
    clone: (payload: { url: string; parentDir: string }) => Promise<LocalGitResult>
    status: (dir: string) => Promise<LocalGitStatus>
    log: (dir: string) => Promise<{ ok: boolean; commits: LocalGitCommit[]; stderr: string }>
    branches: (dir: string) => Promise<{ ok: boolean; branches: string[]; stderr: string }>
    checkout: (payload: { dir: string; branch: string }) => Promise<LocalGitResult>
    commitAll: (payload: { dir: string; message: string }) => Promise<LocalGitResult>
    push: (dir: string) => Promise<LocalGitResult>
    pull: (dir: string) => Promise<LocalGitResult>
    diff: (dir: string) => Promise<{ ok: boolean; unstaged: string; staged: string }>
    openFolder: (dir: string) => Promise<string>
    reveal: (dir: string) => Promise<{ ok: boolean }>
  }
}

declare global {
  interface Window {
    deskgithub?: DesktopApi
  }
}

export function getDesktop(): DesktopApi | undefined {
  return typeof window !== 'undefined' ? window.deskgithub : undefined
}

export async function openExternal(url: string) {
  const desktop = getDesktop()
  if (desktop) {
    await desktop.app.openExternal(url)
  } else {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const el = document.createElement('textarea')
      el.value = text
      el.style.position = 'fixed'
      el.style.opacity = '0'
      document.body.appendChild(el)
      el.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(el)
      return ok
    } catch {
      return false
    }
  }
}
