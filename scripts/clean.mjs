import { rmSync } from 'node:fs'

for (const dir of ['dist', 'dist-electron', 'release']) {
  rmSync(dir, { recursive: true, force: true })
  console.log(`[clean] removed ${dir}`)
}
