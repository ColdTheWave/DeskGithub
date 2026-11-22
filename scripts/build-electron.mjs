import { build } from 'esbuild'
import { rmSync } from 'node:fs'

rmSync('dist-electron', { recursive: true, force: true })

await build({
  entryPoints: ['electron/main.ts', 'electron/preload.ts'],
  outdir: 'dist-electron',
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  sourcemap: false,
  minify: false,
  external: ['electron'],
  logLevel: 'info',
})
