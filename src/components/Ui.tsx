import { useEffect, type MouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, LoaderCircle, Search, X } from 'lucide-react'
import { labelStatus } from '../lib/format'

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return <div className="page-header"><div><h1>{title}</h1>{description && <p>{description}</p>}</div>{actions && <div className="page-header__actions">{actions}</div>}</div>
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) { return <section className={`card ${className}`}>{children}</section> }

export function Loading({ label = 'در حال دریافت اطلاعات…' }: { label?: string }) { return <div className="loading"><LoaderCircle className="spin" size={22} /><span>{label}</span></div> }
export function Empty({ title = 'موردی پیدا نشد', text = 'با فیلترهای فعلی اطلاعاتی برای نمایش وجود ندارد.' }: { title?: string; text?: string }) { return <div className="empty"><strong>{title}</strong><span>{text}</span></div> }
export function ErrorState({ message, retry }: { message: string; retry?: () => void }) { return <div className="error-state"><strong>دریافت اطلاعات ناموفق بود</strong><span>{message}</span>{retry && <button className="button button--ghost" onClick={retry}>تلاش دوباره</button>}</div> }

export function StatusBadge({ value, tone }: { value?: string | null; tone?: 'success' | 'danger' | 'warning' | 'neutral' }) {
  const inferred = tone || (['success','approved','accepted','done','published','live','answered','active','running'].includes(value || '') ? 'success' : ['failed','rejected','banned','deleted','taken_down'].includes(value || '') ? 'danger' : ['pending','in_progress','scheduled','upcoming','changes_requested'].includes(value || '') ? 'warning' : 'neutral')
  return <span className={`status status--${inferred}`}>{labelStatus(value)}</span>
}

export function SearchBox({ value, onChange, placeholder = 'جستجو…' }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <label className="search-box"><Search size={18} /><input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} /><button type="button" aria-label="پاک کردن جستجو" className={value ? 'search-box__clear is-visible' : 'search-box__clear'} onClick={() => onChange('')}><X size={15} /></button></label>
}

export function Pagination({ count, page, pageSize, onPage }: { count: number; page: number; pageSize: number; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(count / pageSize))
  return <div className="pagination"><span>صفحه {page.toLocaleString('fa-IR')} از {pages.toLocaleString('fa-IR')} · {count.toLocaleString('fa-IR')} مورد</span><div><button className="icon-button" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="صفحه قبل"><ChevronRight size={18} /></button><button className="icon-button" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="صفحه بعد"><ChevronLeft size={18} /></button></div></div>
}

let openModalCount = 0
let bodyOverflowBeforeModal = ''

export function Modal({ open, title, children, onClose, wide = false, workspace = false, className = '' }: { open: boolean; title: string; children: ReactNode; onClose: () => void; wide?: boolean; workspace?: boolean; className?: string }) {
  useEffect(() => {
    if (!open) return
    if (openModalCount === 0) {
      bodyOverflowBeforeModal = document.body.style.overflow
      document.body.style.overflow = 'hidden'
    }
    openModalCount += 1
    return () => {
      openModalCount = Math.max(0, openModalCount - 1)
      if (openModalCount === 0) document.body.style.overflow = bodyOverflowBeforeModal
    }
  }, [open])

  if (!open) return null
  const modeClass = workspace ? 'modal--workspace' : wide ? 'modal--wide' : ''
  const layer = <div className="modal-layer" role="presentation" onMouseDown={(e: MouseEvent<HTMLDivElement>) => e.target === e.currentTarget && onClose()}><section className={`modal ${modeClass} ${className}`.trim()} role="dialog" aria-modal="true" aria-label={title}><header><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="بستن"><X size={19} /></button></header><div className="modal__body">{children}</div></section></div>
  return createPortal(layer, document.body)
}

export function Confirm({ open, title, text, confirmLabel = 'تأیید', danger = false, busy = false, onConfirm, onClose }: { open: boolean; title: string; text: string; confirmLabel?: string; danger?: boolean; busy?: boolean; onConfirm: () => void; onClose: () => void }) {
  return <Modal open={open} title={title} onClose={onClose}><p className="dialog-text">{text}</p><div className="dialog-actions"><button className="button button--ghost" onClick={onClose} disabled={busy}>انصراف</button><button className={`button ${danger ? 'button--danger' : 'button--primary'}`} onClick={onConfirm} disabled={busy}>{busy && <LoaderCircle className="spin" size={17} />}{confirmLabel}</button></div></Modal>
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) { return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label> }
