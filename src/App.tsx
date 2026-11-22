import { AppProvider, useApp, type Route } from './lib/store'
import { Shell } from './components/Shell'
import { LoginModal } from './components/LoginModal'
import { Toasts } from './components/Toasts'
import { DashboardPage } from './pages/Dashboard'
import { ReposPage } from './pages/Repos'
import { RepoPage } from './pages/RepoDetail'
import { IssuesPage, PullsPage } from './pages/WorkItems'
import { IssueDetailPage } from './pages/IssueDetail'
import { NotificationsPage } from './pages/Notifications'
import { ExplorePage } from './pages/Explore'
import { LocalPage } from './pages/Local'
import { GistsPage } from './pages/Gists'
import { UserProfilePage } from './pages/UserProfile'
import { OrgPage } from './pages/Org'
import { CommitDetailPage } from './pages/CommitDetail'
import { SettingsPage } from './pages/Settings'

function routeKey(route: Route) {
  switch (route.name) {
    case 'repo':
      return `repo:${route.owner}/${route.repo}`
    case 'issue':
      return `issue:${route.owner}/${route.repo}/${route.number}/${route.kind}`
    case 'commit':
      return `commit:${route.owner}/${route.repo}/${route.sha}`
    case 'user':
      return `user:${route.login}`
    case 'org':
      return `org:${route.org}`
    case 'explore':
      return `explore:${route.query || ''}`
    default:
      return route.name
  }
}

function Pages() {
  const { route } = useApp()
  switch (route.name) {
    case 'dashboard':
      return <DashboardPage />
    case 'repos':
      return <ReposPage />
    case 'repo':
      return <RepoPage owner={route.owner} repo={route.repo} />
    case 'issues':
      return <IssuesPage />
    case 'pulls':
      return <PullsPage />
    case 'issue':
      return <IssueDetailPage owner={route.owner} repo={route.repo} number={route.number} kind={route.kind} />
    case 'notifications':
      return <NotificationsPage />
    case 'explore':
      return <ExplorePage query={route.query} />
    case 'local':
      return <LocalPage />
    case 'gists':
      return <GistsPage />
    case 'user':
      return <UserProfilePage login={route.login} />
    case 'org':
      return <OrgPage org={route.org} />
    case 'commit':
      return <CommitDetailPage owner={route.owner} repo={route.repo} sha={route.sha} />
    case 'settings':
      return <SettingsPage />
    default:
      return <DashboardPage />
  }
}

function Root() {
  const { route } = useApp()
  return (
    <>
      <Shell>
        <Pages key={routeKey(route)} />
      </Shell>
      <LoginModal />
      <Toasts />
    </>
  )
}

export default function App() {
  return (
    <AppProvider>
      <Root />
    </AppProvider>
  )
}
