import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import { useApp } from '../lib/store'

export function Toasts() {
  const { toasts } = useApp()
  if (toasts.length === 0) return null
  return (
    <div className="toasts">
      {toasts.map((toast) => (
        <div className={`toast ${toast.kind}`} key={toast.id}>
          {toast.kind === 'success' ? <CheckCircle2 size={15} /> : toast.kind === 'error' ? <AlertCircle size={15} /> : <Info size={15} />}
          <span style={{ flex: 1 }}>{toast.message}</span>
          <span className="toast-close">
            <X size={12} />
          </span>
        </div>
      ))}
    </div>
  )
}
