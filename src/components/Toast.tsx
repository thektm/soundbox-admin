import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { CheckCircle2, CircleAlert, X } from 'lucide-react'

import { ToastContext, type ToastKind } from './toastContext'

type ToastItem = { id: number; message: string; kind: ToastKind }

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const show = useCallback((message: string, kind: ToastKind = 'info') => {
    const id = Date.now() + Math.random()
    setItems(current => [...current.slice(-3), { id, message, kind }])
    window.setTimeout(() => setItems(current => current.filter(item => item.id !== id)), 4200)
  }, [])
  const value = useMemo(() => ({ show }), [show])
  return <ToastContext.Provider value={value}>
    {children}
    <div className="toast-stack" aria-live="polite">
      {items.map(item => <div key={item.id} className={`toast toast--${item.kind}`}>
        {item.kind === 'success' ? <CheckCircle2 size={18} /> : <CircleAlert size={18} />}
        <span>{item.message}</span>
        <button type="button" className="icon-button icon-button--sm" onClick={() => setItems(current => current.filter(x => x.id !== item.id))} aria-label="بستن پیام"><X size={16} /></button>
      </div>)}
    </div>
  </ToastContext.Provider>
}

