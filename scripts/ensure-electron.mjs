import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const distDir = path.join('node_modules', 'electron', 'dist')
if (existsSync(distDir)) process.exit(0)

const installScript = path.join('node_modules', 'electron', 'install.js')
if (!existsSync(installScript)) process.exit(0)

console.log('[deskgithub] Electron runtime missing, downloading it now…')
const result = spawnSync(process.execPath, [installScript], {
  stdio: 'inherit',
  env: {
    ...process.env,
    ELECTRON_MIRROR: process.env.ELECTRON_MIRROR || 'https://npmmirror.com/mirrors/electron/',
  },
})
process.exit(result.status ?? 1)
