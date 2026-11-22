import { app, BrowserWindow, ipcMain, Menu, nativeImage, session, shell, Tray } from 'electron'
import path from 'node:path'
import { clearSession, startDeviceFlow, pollDeviceFlow, getToken } from './auth'
import { ghRequest, getSession, type GhRequest } from './github'
import { applyProxyConfig, applyProxyToSession, getProxyConfig, setProxyConfig, testProxy } from './proxy'
import { downloadArtifact, fetchRunLogs, uploadReleaseAsset, fetchWikiPage } from './extras'
import * as git from './git'

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL)

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null

function createTray() {
  const iconPath = isDev
    ? path.join(__dirname, '..', 'build', 'icon.png')
    : path.join(process.resourcesPath, 'icon.png')
  const image = nativeImage.createFromPath(iconPath)
  if (image.isEmpty()) return
  tray = new Tray(image.resize({ width: 18, height: 18 }))
  tray.setToolTip('DeskGitHub')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: 'Open DeskGitHub',
        click: () => {
          if (!mainWindow) {
            createWindow()
            return
          }
          mainWindow.show()
          mainWindow.focus()
        },
      },
      {
        label: 'GitHub',
        click: () => void shell.openExternal('https://github.com'),
      },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ]),
  )
  tray.on('click', () => {
    if (!mainWindow) return
    if (mainWindow.isVisible()) {
      mainWindow.hide()
    } else {
      mainWindow.show()
      mainWindow.focus()
    }
  })
}

function installImageAuth() {
  session.defaultSession.webRequest.onBeforeSendHeaders(
    {
      urls: [
        'https://raw.githubusercontent.com/*',
        'https://media.githubusercontent.com/*',
      ],
    },
    (details, callback) => {
      const token = getToken()
      if (token) details.requestHeaders.Authorization = `Bearer ${token}`
      callback({ requestHeaders: details.requestHeaders })
    },
  )
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1040,
    minHeight: 680,
    backgroundColor: '#0a0d12',
    show: false,
    title: 'DeskGitHub',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 18, y: 20 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const devUrl = process.env.VITE_DEV_SERVER_URL
    if (devUrl && url.startsWith(devUrl)) return
    if (url.startsWith('file://')) return
    event.preventDefault()
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
  })

  if (isDev) {
    void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL as string)
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

function buildMenu() {
  const isMac = process.platform === 'darwin'
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const },
            ],
          },
        ]
      : []),
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'zoom' }, ...(isMac ? [{ role: 'front' as const }] : [{ role: 'close' as const }])],
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'GitHub',
          click: () => void shell.openExternal('https://github.com'),
        },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function registerIpc() {
  ipcMain.handle('gh:request', (_event, req: GhRequest) => ghRequest(req))

  ipcMain.handle('auth:session', () => getSession())
  ipcMain.handle('auth:start', async (_event, payload: { clientId: string }) => {
    try {
      const flow = await startDeviceFlow(
        payload.clientId,
        'repo read:user notifications read:org gist workflow user:follow project read:packages delete_repo write:discussion',
      )
      return { ok: true, flow }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Failed to start device flow' }
    }
  })
  ipcMain.handle('auth:poll', async (_event, payload: { clientId: string; deviceCode: string }) => {
    try {
      const result = await pollDeviceFlow(payload.clientId, payload.deviceCode)
      return result
    } catch (err) {
      return { status: 'denied', error: err instanceof Error ? err.message : 'Polling failed' }
    }
  })
  ipcMain.handle('auth:logout', () => {
    clearSession()
    return { ok: true }
  })

  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    home: app.getPath('home'),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  }))
  ipcMain.handle('app:openExternal', async (_event, url: string) => {
    if (/^https?:\/\//.test(url)) {
      await shell.openExternal(url)
      return { ok: true }
    }
    return { ok: false }
  })

  ipcMain.handle('proxy:get', () => getProxyConfig())
  ipcMain.handle('proxy:set', async (_event, config: Parameters<typeof setProxyConfig>[0]) => {
    try {
      const saved = await setProxyConfig(config)
      return { ok: true, config: saved }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Invalid proxy configuration' }
    }
  })
  ipcMain.handle('proxy:test', () => testProxy())

  ipcMain.handle('actions:logs', (_event, payload: { owner: string; repo: string; runId: number }) =>
    fetchRunLogs(payload.owner, payload.repo, payload.runId),
  )
  ipcMain.handle(
    'actions:downloadArtifact',
    (
      _event,
      payload: { owner: string; repo: string; artifactId: number; name: string },
    ) => downloadArtifact(payload.owner, payload.repo, payload.artifactId, payload.name),
  )
  ipcMain.handle(
    'releases:uploadAsset',
    (_event, payload: { owner: string; repo: string; releaseId: number }) =>
      uploadReleaseAsset(payload.owner, payload.repo, payload.releaseId),
  )
  ipcMain.handle(
    'wiki:page',
    (_event, payload: { owner: string; repo: string; page: string }) =>
      fetchWikiPage(payload.owner, payload.repo, payload.page),
  )
  ipcMain.handle(
    'wiki:save',
    (
      _event,
      payload: { owner: string; repo: string; page: string; content: string; message?: string },
    ) => git.saveWikiPage(payload.owner, payload.repo, payload.page, payload.content, payload.message),
  )
  ipcMain.handle(
    'wiki:pages',
    (_event, payload: { owner: string; repo: string }) => git.listWikiPages(payload.owner, payload.repo),
  )
  ipcMain.handle(
    'wiki:delete',
    (_event, payload: { owner: string; repo: string; page: string }) =>
      git.deleteWikiPage(payload.owner, payload.repo, payload.page),
  )

  ipcMain.handle('git:version', () => git.gitVersion())
  ipcMain.handle('git:pickDirectory', () => git.pickDirectory())
  ipcMain.handle('git:validate', (_event, dir: string) => git.validateRepo(dir))
  ipcMain.handle('git:clone', (_event, payload: { url: string; parentDir: string }) =>
    git.cloneRepo(payload.url, payload.parentDir),
  )
  ipcMain.handle('git:status', (_event, dir: string) => git.gitStatus(dir))
  ipcMain.handle('git:log', (_event, dir: string) => git.gitLog(dir))
  ipcMain.handle('git:branches', (_event, dir: string) => git.gitBranches(dir))
  ipcMain.handle('git:checkout', (_event, payload: { dir: string; branch: string }) =>
    git.gitCheckout(payload.dir, payload.branch),
  )
  ipcMain.handle('git:commitAll', (_event, payload: { dir: string; message: string }) =>
    git.gitCommitAll(payload.dir, payload.message),
  )
  ipcMain.handle('git:push', (_event, dir: string) => git.gitPush(dir))
  ipcMain.handle('git:pull', (_event, dir: string) => git.gitPull(dir))
  ipcMain.handle('git:diff', (_event, dir: string) => git.gitDiffStat(dir))
  ipcMain.handle('git:openFolder', (_event, dir: string) => git.openFolder(dir))
  ipcMain.handle('git:reveal', (_event, dir: string) => git.revealInFolder(dir))
}

app.setAppUserModelId('com.deskgithub.app')

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(async () => {
    buildMenu()
    registerIpc()
    try {
      await applyProxyConfig()
    } catch (err) {
      console.error('Failed to apply proxy configuration:', err)
    }
    installImageAuth()
    app.on('web-contents-created', (_event, contents) => {
      if (contents.session !== session.defaultSession) {
        void applyProxyToSession(contents.session).catch(() => {
          /* ignore secondary session failures */
        })
      }
    })
    createWindow()
    createTray()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
