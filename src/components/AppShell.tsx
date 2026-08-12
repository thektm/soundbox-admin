import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { BadgeDollarSign, Disc3, LayoutDashboard, Layers3, LifeBuoy, ListMusic, LogOut, Menu, Music2, PanelsTopLeft, ShieldCheck, Users, WalletCards, X } from 'lucide-react'
import { useAuth } from '../lib/authContext'

const nav = [
  { to: '/', label: 'داشبورد', icon: LayoutDashboard },
  { to: '/users', label: 'کاربران', icon: Users },
  { to: '/artists', label: 'هنرمندان', icon: ShieldCheck },
  { to: '/releases', label: 'بررسی انتشارها', icon: Music2 },
  { to: '/songs', label: 'آهنگ‌ها', icon: ListMusic },
  { to: '/albums', label: 'آلبوم‌ها', icon: Disc3 },
  { to: '/plans', label: 'پلن و قیمت‌گذاری', icon: BadgeDollarSign },
  { to: '/finance', label: 'مالی و تسویه', icon: WalletCards },
  { to: '/content', label: 'محتوا و پیشنهادها', icon: PanelsTopLeft },
  { to: '/playlists-sections', label: 'پلی‌لیست‌ها و بخش‌ها', icon: Layers3 },
  { to: '/support', label: 'پشتیبانی و گزارش‌ها', icon: LifeBuoy },
]

export function AppShell({ children }: { children: ReactNode }) {
  const [drawer, setDrawer] = useState(false)
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  useEffect(() => {
    if (!drawer) return
    const close = (e: KeyboardEvent) => e.key === 'Escape' && setDrawer(false)
    document.addEventListener('keydown', close)
    document.body.classList.add('drawer-open')
    return () => { document.removeEventListener('keydown', close); document.body.classList.remove('drawer-open') }
  }, [drawer])

  const doLogout = async () => { await logout(); navigate('/login', { replace: true }) }
  return <div className="app-shell">
    {drawer && <button className="drawer-backdrop" aria-label="بستن منو" onClick={() => setDrawer(false)} />}
    <aside className={`sidebar ${drawer ? 'is-open' : ''}`}>
      <div className="brand"><img src="/sedabox-logo.png" alt="نشان صداباکس" /><div><strong>صداباکس</strong><span>پنل مدیریت</span></div><button className="icon-button sidebar__close" onClick={() => setDrawer(false)} aria-label="بستن منو"><X size={20} /></button></div>
      <nav>{nav.map(item => <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => `nav-item ${isActive ? 'is-active' : ''}`} onClick={() => setDrawer(false)}><item.icon size={19} /><span>{item.label}</span></NavLink>)}</nav>
      <div className="sidebar__footer"><div className="admin-mini"><span className="admin-mini__avatar">{(user?.first_name?.[0] || 'م')}</span><div><strong>{[user?.first_name, user?.last_name].filter(Boolean).join(' ') || 'مدیر سیستم'}</strong><span>{user?.phone_number}</span></div></div><button className="nav-item nav-item--button" onClick={doLogout}><LogOut size={19} /><span>خروج از حساب</span></button></div>
    </aside>
    <div className="app-main">
      <header className="mobile-topbar"><button className="icon-button" onClick={() => setDrawer(true)} aria-label="باز کردن منو"><Menu size={22} /></button><div className="mobile-brand"><img src="/sedabox-logo.png" alt="" /><strong>مدیریت صداباکس</strong></div></header>
      <main className="content">{children}</main>
    </div>
  </div>
}
