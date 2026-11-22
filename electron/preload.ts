import { contextBridge, ipcRenderer } from 'electron'

const api = {
  platform: process.platform,
  request: (req: {
    path: string
    method?: string
    body?: unknown
    accept?: string
    noAuth?: boolean
  }) => ipcRenderer.invoke('gh:request', req),
  auth: {
    session: () => ipcRenderer.invoke('auth:session'),
    start: (payload: { clientId: string }) => ipcRenderer.invoke('auth:start', payload),
    poll: (payload: { clientId: string; deviceCode: string }) => ipcRenderer.invoke('auth:poll', payload),
    logout: () => ipcRenderer.invoke('auth:logout'),
  },
  app: {
    info: () => ipcRenderer.invoke('app:info'),
    openExternal: (url: string) => ipcRenderer.invoke('app:openExternal', url),
  },
  proxy: {
    get: () => ipcRenderer.invoke('proxy:get'),
    set: (config: unknown) => ipcRenderer.invoke('proxy:set', config),
    test: () => ipcRenderer.invoke('proxy:test'),
  },
  actions: {
    logs: (payload: { owner: string; repo: string; runId: number }) =>
      ipcRenderer.invoke('actions:logs', payload),
    downloadArtifact: (payload: { owner: string; repo: string; artifactId: number; name: string }) =>
      ipcRenderer.invoke('actions:downloadArtifact', payload),
  },
  releases: {
    uploadAsset: (payload: { owner: string; repo: string; releaseId: number }) =>
      ipcRenderer.invoke('releases:uploadAsset', payload),
  },
  wiki: {
    page: (payload: { owner: string; repo: string; page: string }) =>
      ipcRenderer.invoke('wiki:page', payload),
    save: (payload: { owner: string; repo: string; page: string; content: string; message?: string }) =>
      ipcRenderer.invoke('wiki:save', payload),
    pages: (payload: { owner: string; repo: string }) => ipcRenderer.invoke('wiki:pages', payload),
    delete: (payload: { owner: string; repo: string; page: string }) =>
      ipcRenderer.invoke('wiki:delete', payload),
  },
  git: {
    version: () => ipcRenderer.invoke('git:version'),
    pickDirectory: () => ipcRenderer.invoke('git:pickDirectory'),
    validate: (dir: string) => ipcRenderer.invoke('git:validate', dir),
    clone: (payload: { url: string; parentDir: string }) => ipcRenderer.invoke('git:clone', payload),
    status: (dir: string) => ipcRenderer.invoke('git:status', dir),
    log: (dir: string) => ipcRenderer.invoke('git:log', dir),
    branches: (dir: string) => ipcRenderer.invoke('git:branches', dir),
    checkout: (payload: { dir: string; branch: string }) => ipcRenderer.invoke('git:checkout', payload),
    commitAll: (payload: { dir: string; message: string }) => ipcRenderer.invoke('git:commitAll', payload),
    push: (dir: string) => ipcRenderer.invoke('git:push', dir),
    pull: (dir: string) => ipcRenderer.invoke('git:pull', dir),
    diff: (dir: string) => ipcRenderer.invoke('git:diff', dir),
    openFolder: (dir: string) => ipcRenderer.invoke('git:openFolder', dir),
    reveal: (dir: string) => ipcRenderer.invoke('git:reveal', dir),
  },
}

contextBridge.exposeInMainWorld('deskgithub', api)
