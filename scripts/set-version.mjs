import fs from 'node:fs'

const raw = (process.argv[2] ?? process.env.APP_VERSION ?? '').trim().replace(/^v/i, '')

if (!raw) {
  console.error('用法: node scripts/set-version.mjs <版本号>')
  console.error('示例: node scripts/set-version.mjs 1.2.0')
  process.exit(1)
}

if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(raw)) {
  console.error(`版本号格式不正确: ${raw}`)
  console.error('请使用 SemVer 格式，例如 1.2.0 或 2.0.0-beta.1')
  process.exit(1)
}

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const previous = pkg.version
pkg.version = raw
fs.writeFileSync('package.json', `${JSON.stringify(pkg, null, 2)}\n`)

if (fs.existsSync('package-lock.json')) {
  const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'))
  lock.version = raw
  if (lock.packages && lock.packages['']) lock.packages[''].version = raw
  fs.writeFileSync('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`)
}

console.log(`版本号已更新: ${previous} → ${raw}`)
