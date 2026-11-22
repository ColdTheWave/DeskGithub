import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import { getDesktop } from './lib/desktop'

const desktop = getDesktop()
const platform =
  desktop?.platform ||
  (navigator.userAgent.includes('Mac') ? 'darwin' : navigator.userAgent.includes('Win') ? 'win32' : 'linux')
document.documentElement.dataset.platform = platform
document.documentElement.dataset.theme = document.documentElement.dataset.theme || 'dark'

createRoot(document.getElementById('root') as HTMLElement).render(<App />)
