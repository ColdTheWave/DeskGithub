export type RateInfo = {
  limit: number
  remaining: number
  used: number
  reset: number
}

export type GhResponse<T = any> = {
  ok: boolean
  status: number
  data: T
  rate: RateInfo
  link: string | null
}

export type GhUser = {
  login: string
  id: number
  avatar_url: string
  html_url: string
  name?: string | null
  bio?: string | null
  company?: string | null
  location?: string | null
  public_repos?: number
  followers?: number
  following?: number
  created_at?: string
}

export type GhRepo = {
  id: number
  name: string
  full_name: string
  owner: GhUser
  private: boolean
  description: string | null
  html_url: string
  stargazers_count: number
  watchers_count: number
  forks_count: number
  language: string | null
  updated_at: string
  pushed_at: string
  default_branch: string
  open_issues_count: number
  topics?: string[]
  archived?: boolean
  fork?: boolean
}

export type GhLabel = {
  name: string
  color: string
  description?: string | null
}

export type ReactionSummary = {
  total_count: number
  '+1': number
  '-1': number
  laugh: number
  hooray: number
  confused: number
  heart: number
  rocket: number
  eyes: number
}

export type GhIssue = {
  id: number
  number: number
  title: string
  state: 'open' | 'closed'
  user: GhUser | null
  labels: GhLabel[]
  comments: number
  created_at: string
  updated_at: string
  closed_at: string | null
  body: string | null
  html_url: string
  assignees?: GhUser[]
  milestone?: { number: number; title: string } | null
  locked?: boolean
  reactions?: ReactionSummary
  pull_request?: { url: string; html_url: string; merged_at: string | null }
}

export type GhPull = {
  id: number
  number: number
  title: string
  state: 'open' | 'closed'
  user: GhUser | null
  created_at: string
  updated_at: string
  body: string | null
  html_url: string
  draft: boolean
  merged_at: string | null
  additions: number
  deletions: number
  changed_files: number
  comments: number
  review_comments: number
  commits: number
  head: { ref: string; sha: string }
  base: { ref: string; sha: string }
  labels: GhLabel[]
}

export type GhComment = {
  id: number
  user: GhUser | null
  body: string | null
  created_at: string
  html_url: string
  author_association?: string
  reactions?: ReactionSummary
  path?: string
  line?: number | null
  original_line?: number | null
  side?: 'LEFT' | 'RIGHT' | null
  in_reply_to_id?: number | null
}

export type GhCommit = {
  sha: string
  html_url: string
  commit: {
    message: string
    author: { name: string; email: string; date: string }
  }
  author: GhUser | null
  stats?: { additions: number; deletions: number; total: number }
  files?: GhFileDiff[]
}

export type GhFileDiff = {
  filename: string
  status: string
  additions: number
  deletions: number
  changes: number
  patch?: string
}

export type GhNotificationSubject = {
  title: string
  type: string
  url: string | null
  latest_comment_url: string | null
}

export type GhNotification = {
  id: string
  unread: boolean
  reason: string
  updated_at: string
  subject: GhNotificationSubject
  repository: {
    id: number
    full_name: string
    name: string
    owner: GhUser
    private: boolean
    html_url: string
  }
}

export type GhContentItem = {
  type: 'file' | 'dir' | 'symlink' | 'submodule'
  name: string
  path: string
  sha: string
  size: number
  download_url: string | null
  html_url: string
  content?: string
  encoding?: string
}

export type GhSearchResult<T> = {
  total_count: number
  incomplete_results: boolean
  items: T[]
}

export type GhBranch = {
  name: string
  commit: { sha: string; url: string }
  protected: boolean
}

export type SessionState = {
  authenticated: boolean
  user: GhUser | null
}

export type LocalGitFile = { x: string; y: string; path: string }
export type LocalGitStatus = {
  ok: boolean
  name?: string
  path?: string
  branch?: string
  hasUpstream?: boolean
  files?: LocalGitFile[]
  ahead?: number
  behind?: number
  lastCommit?: { hash: string; subject: string; author: string; date: string } | null
  error?: string | null
}
export type LocalGitResult = {
  ok: boolean
  stdout: string
  stderr: string
  code: number | string | null
  path?: string | null
}
export type LocalGitCommit = {
  sha: string
  short: string
  subject: string
  author: string
  date: string
  refs: string
}
