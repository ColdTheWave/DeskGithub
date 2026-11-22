import { dialog, shell } from 'electron'
import { execFile } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { getToken } from './auth'
import { getGitProxyEnv } from './proxy'

export type GitResult = {
  ok: boolean
  stdout: string
  stderr: string
  code: number | string | null
}

async function runGit(args: string[], cwd?: string, withAuth = false): Promise<GitResult> {
  const proxyEnv = await getGitProxyEnv()
  return new Promise((resolve) => {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      GIT_TERMINAL_PROMPT: '0',
      ...proxyEnv,
    }
    const token = withAuth ? getToken() : null
    if (token) {
      env.GIT_CONFIG_COUNT = '1'
      env.GIT_CONFIG_KEY_0 = 'http.extraheader'
      env.GIT_CONFIG_VALUE_0 =
        'AUTHORIZATION: basic ' + Buffer.from(`x-access-token:${token}`, 'utf8').toString('base64')
    }
    execFile(
      'git',
      args,
      { cwd, env, timeout: 180_000, maxBuffer: 20 * 1024 * 1024, windowsHide: true },
      (error, stdout, stderr) => {
        resolve({
          ok: !error,
          stdout: String(stdout || ''),
          stderr: String(stderr || ''),
          code: error ? ((error as any).code ?? 1) : 0,
        })
      },
    )
  })
}

export async function gitVersion(): Promise<GitResult> {
  return runGit(['--version'])
}

export async function pickDirectory(): Promise<string | null> {
  const result = await dialog.showOpenDialog({
    title: 'Select folder',
    properties: ['openDirectory', 'createDirectory'],
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
}

export async function validateRepo(dir: string) {
  if (!dir || !fs.existsSync(dir)) return { ok: false, error: 'Folder does not exist' }
  const res = await runGit(['rev-parse', '--is-inside-work-tree'], dir)
  return { ok: res.ok && res.stdout.trim() === 'true', error: res.stderr.trim() || null }
}

export async function cloneRepo(url: string, parentDir: string) {
  const cleanUrl = url.trim()
  if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+?(\.git)?$/.test(cleanUrl) && !/^git@github\.com:[\w.-]+\/[\w.-]+?(\.git)?$/.test(cleanUrl)) {
    return { ok: false, stdout: '', stderr: 'Only GitHub repository URLs are supported', code: 1, path: null as string | null }
  }
  const name = cleanUrl
    .replace(/\.git$/, '')
    .split(/[/:]/)
    .pop() as string
  const target = path.join(parentDir, name)
  if (fs.existsSync(target) && fs.readdirSync(target).length > 0) {
    return { ok: false, stdout: '', stderr: `Target folder already exists: ${target}`, code: 1, path: null as string | null }
  }
  const res = await runGit(['clone', '--progress', cleanUrl, target], parentDir, true)
  return { ...res, path: res.ok ? target : null }
}

export type GitFileChange = { x: string; y: string; path: string }

export async function gitStatus(dir: string) {
  const validation = await validateRepo(dir)
  if (!validation.ok) return { ok: false, error: validation.error || 'Not a git repository' }

  const [branchRes, statusRes, logRes, upstreamRes] = await Promise.all([
    runGit(['rev-parse', '--abbrev-ref', 'HEAD'], dir),
    runGit(['status', '--porcelain=v1'], dir),
    runGit(['log', '-1', '--pretty=format:%h%x1f%s%x1f%an%x1f%ar'], dir),
    runGit(['rev-list', '--left-right', '--count', 'HEAD...@{upstream}'], dir),
  ])

  const files: GitFileChange[] = statusRes.stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => ({ x: line[0], y: line[1], path: line.slice(3) }))

  let ahead = 0
  let behind = 0
  if (upstreamRes.ok) {
    const parts = upstreamRes.stdout.trim().split(/\s+/)
    ahead = Number(parts[0] || 0)
    behind = Number(parts[1] || 0)
  }

  let lastCommit: { hash: string; subject: string; author: string; date: string } | null = null
  if (logRes.ok && logRes.stdout) {
    const [hash, subject, author, date] = logRes.stdout.split('\x1f')
    lastCommit = { hash, subject, author, date }
  }

  const name = path.basename(dir)
  return {
    ok: true,
    name,
    path: dir,
    branch: branchRes.ok ? branchRes.stdout.trim() : 'HEAD',
    hasUpstream: upstreamRes.ok,
    files,
    ahead,
    behind,
    lastCommit,
    error: null as string | null,
  }
}

export async function gitLog(dir: string, limit = 25) {
  const res = await runGit(
    ['log', `-n${limit}`, '--pretty=format:%H%x1f%h%x1f%s%x1f%an%x1f%ar%x1f%D'],
    dir,
  )
  if (!res.ok) return { ok: false, commits: [], stderr: res.stderr }
  const commits = res.stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [sha, short, subject, author, date, refs] = line.split('\x1f')
      return { sha, short, subject, author, date, refs }
    })
  return { ok: true, commits, stderr: '' }
}

export async function gitBranches(dir: string) {
  const res = await runGit(['branch', '--format=%(refname:short)'], dir)
  const branches = res.ok ? res.stdout.split('\n').filter(Boolean) : []
  return { ok: res.ok, branches, stderr: res.stderr }
}

export async function gitCheckout(dir: string, branch: string) {
  return runGit(['checkout', branch], dir)
}

export async function gitDiffStat(dir: string) {
  const unstaged = await runGit(['diff', '--stat'], dir)
  const staged = await runGit(['diff', '--cached', '--stat'], dir)
  return { ok: true, unstaged: unstaged.stdout, staged: staged.stdout }
}

export async function gitCommitAll(dir: string, message: string) {
  if (!message.trim()) return { ok: false, stdout: '', stderr: 'Commit message is required', code: 1 }
  const add = await runGit(['add', '-A'], dir)
  if (!add.ok) return add
  return runGit(['commit', '-m', message], dir)
}

export async function gitPush(dir: string) {
  let result = await runGit(['push'], dir, true)
  if (!result.ok && /no upstream|set-upstream|no tracking/i.test(result.stderr)) {
    const branch = await runGit(['rev-parse', '--abbrev-ref', 'HEAD'], dir)
    if (branch.ok) {
      result = await runGit(['push', '-u', 'origin', branch.stdout.trim()], dir, true)
    }
  }
  return result
}

export async function gitPull(dir: string) {
  return runGit(['pull', '--ff-only'], dir, true)
}

export async function openFolder(dir: string) {
  return shell.openPath(dir)
}

export async function revealInFolder(dir: string) {
  shell.showItemInFolder(dir)
  return { ok: true }
}

export async function listWikiPages(owner: string, repo: string) {
  if (!/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo)) {
    return { ok: false, error: 'Invalid repository', pages: [] as string[] }
  }
  const remote = `https://github.com/${owner}/${repo}.wiki.git`
  const dir = path.join(os.tmpdir(), `deskgithub-wikilist-${owner}-${repo}-${Date.now()}`)
  try {
    fs.mkdirSync(dir, { recursive: true })
    const clone = await runGit(['clone', '--depth', '1', remote, dir], undefined, true)
    if (!clone.ok) {
      return { ok: false, error: clone.stderr.trim() || 'Could not clone wiki repository', pages: [] as string[] }
    }
    const pages = fs
      .readdirSync(dir)
      .filter((file) => file.endsWith('.md'))
      .map((file) => file.replace(/\.md$/, ''))
      .sort((a, b) => a.localeCompare(b))
    return { ok: true, pages }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to list wiki pages',
      pages: [] as string[],
    }
  } finally {
    try {
      fs.rmSync(dir, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
  }
}

export async function deleteWikiPage(owner: string, repo: string, page: string) {
  if (!/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo)) {
    return { ok: false, error: 'Invalid repository' }
  }
  const name = (page.trim() || 'Home').replace(/[\\/:*?"<>|]/g, '-')
  const remote = `https://github.com/${owner}/${repo}.wiki.git`
  const dir = path.join(os.tmpdir(), `deskgithub-wikidel-${owner}-${repo}-${Date.now()}`)
  try {
    fs.mkdirSync(dir, { recursive: true })
    const clone = await runGit(['clone', '--depth', '1', remote, dir], undefined, true)
    if (!clone.ok) return { ok: false, error: clone.stderr.trim() || 'Could not clone wiki repository' }
    const file = path.join(dir, `${name}.md`)
    if (!fs.existsSync(file)) return { ok: false, error: 'Page not found' }
    await runGit(['rm', `${name}.md`], dir)
    await runGit(
      [
        '-c',
        'user.name=DeskGitHub',
        '-c',
        'user.email=dev@deskgithub.app',
        'commit',
        '-m',
        `Delete ${name}`,
      ],
      dir,
    )
    const push = await runGit(['push', 'origin', 'HEAD'], dir, true)
    return push.ok ? { ok: true } : { ok: false, error: push.stderr.trim() || 'Failed to push wiki changes' }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to delete wiki page' }
  } finally {
    try {
      fs.rmSync(dir, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
  }
}

export async function saveWikiPage(
  owner: string,
  repo: string,
  page: string,
  content: string,
  message?: string,
) {
  if (!/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo)) {
    return { ok: false, error: 'Invalid repository' }
  }
  const name = (page.trim() || 'Home').replace(/[\\/:*?"<>|]/g, '-')
  const remote = `https://github.com/${owner}/${repo}.wiki.git`
  const dir = path.join(os.tmpdir(), `deskgithub-wiki-${owner}-${repo}-${Date.now()}`)
  try {
    fs.mkdirSync(dir, { recursive: true })
    const clone = await runGit(['clone', '--depth', '1', remote, dir], undefined, true)
    if (!clone.ok) {
      return {
        ok: false,
        error:
          clone.stderr.trim() ||
          'Could not clone the wiki repository. Create the first wiki page on GitHub, then retry.',
      }
    }
    fs.writeFileSync(path.join(dir, `${name}.md`), content, 'utf8')
    await runGit(['add', '.'], dir)
    await runGit(
      [
        '-c',
        'user.name=DeskGitHub',
        '-c',
        'user.email=dev@deskgithub.app',
        'commit',
        '-m',
        message?.trim() || `Update ${name}`,
      ],
      dir,
    )
    const push = await runGit(['push', 'origin', 'HEAD'], dir, true)
    return push.ok
      ? { ok: true, page: name }
      : { ok: false, error: push.stderr.trim() || 'Failed to push wiki changes' }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to save wiki page' }
  } finally {
    try {
      fs.rmSync(dir, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
  }
}
