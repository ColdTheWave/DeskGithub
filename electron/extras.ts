import { dialog, net } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import AdmZip from 'adm-zip'
import { getToken } from './auth'

function githubHeaders(token: string, accept = 'application/vnd.github+json') {
  return {
    Authorization: `Bearer ${token}`,
    'User-Agent': 'DeskGitHub',
    Accept: accept,
  }
}

export async function fetchRunLogs(owner: string, repo: string, runId: number) {
  const token = getToken()
  if (!token) return { ok: false, error: 'Sign in required' }
  const res = await net.fetch(
    `https://api.github.com/repos/${owner}/${repo}/actions/runs/${runId}/logs`,
    { headers: githubHeaders(token) },
  )
  if (!res.ok) {
    return { ok: false, status: res.status, error: `HTTP ${res.status}` }
  }
  const buffer = Buffer.from(await res.arrayBuffer())
  try {
    const zip = new AdmZip(buffer)
    const files = zip
      .getEntries()
      .filter((entry) => !entry.isDirectory)
      .map((entry) => ({ name: entry.entryName, content: entry.getData().toString('utf8') }))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 300)
    return { ok: true, files }
  } catch {
    return { ok: false, error: 'Could not read the logs archive' }
  }
}

export async function downloadArtifact(
  owner: string,
  repo: string,
  artifactId: number,
  artifactName: string,
) {
  const token = getToken()
  if (!token) return { ok: false, error: 'Sign in required' }
  const res = await net.fetch(
    `https://api.github.com/repos/${owner}/${repo}/actions/artifacts/${artifactId}/zip`,
    { headers: githubHeaders(token) },
  )
  if (!res.ok) {
    return { ok: false, status: res.status, error: `HTTP ${res.status}` }
  }
  const buffer = Buffer.from(await res.arrayBuffer())
  const target = await dialog.showSaveDialog({
    title: 'Save artifact',
    defaultPath: `${artifactName || 'artifact'}.zip`,
  })
  if (target.canceled || !target.filePath) return { ok: false, canceled: true }
  fs.writeFileSync(target.filePath, buffer)
  return { ok: true, path: target.filePath }
}

export async function uploadReleaseAsset(owner: string, repo: string, releaseId: number) {
  const token = getToken()
  if (!token) return { ok: false, error: 'Sign in required' }
  const picked = await dialog.showOpenDialog({
    title: 'Select release asset',
    properties: ['openFile'],
  })
  if (picked.canceled || picked.filePaths.length === 0) return { ok: false, canceled: true }
  const filePath = picked.filePaths[0]
  const name = path.basename(filePath)
  const data = fs.readFileSync(filePath)
  const res = await net.fetch(
    `https://uploads.github.com/repos/${owner}/${repo}/releases/${releaseId}/assets?name=${encodeURIComponent(name)}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'DeskGitHub',
        'Content-Type': 'application/octet-stream',
      },
      body: data,
    },
  )
  const json = await res.json().catch(() => null)
  if (!res.ok) {
    return { ok: false, status: res.status, error: json?.message || `HTTP ${res.status}` }
  }
  return { ok: true, asset: json }
}

export async function fetchWikiPage(owner: string, repo: string, page: string) {
  const name = page.trim() || 'Home'
  const url = `https://raw.githubusercontent.com/wiki/${owner}/${repo}/${encodeURIComponent(name)}.md`
  const res = await net.fetch(url, { headers: { 'User-Agent': 'DeskGitHub' } })
  if (res.status === 404) {
    if (name.toLowerCase() !== 'home') return fetchWikiPage(owner, repo, 'Home')
    return { ok: false, status: 404, error: 'This repository has no wiki page yet' }
  }
  if (!res.ok) {
    return { ok: false, status: res.status, error: `HTTP ${res.status}` }
  }
  return { ok: true, page: name, content: await res.text() }
}
