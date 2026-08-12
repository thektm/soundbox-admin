import { useState, type FormEvent } from 'react'
import { Eye, EyeOff, LoaderCircle, LockKeyhole, Phone } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { adminLogin, errorMessageFa } from '../lib/api'
import { useAuth } from '../lib/authContext'

export default function LoginPage() {
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const { setUser } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!phone.trim() || !password) { setError('شماره همراه و رمز عبور را وارد کنید.'); return }
    setBusy(true); setError('')
    try {
      const user = await adminLogin(phone.trim(), password)
      setUser(user)
      const from = (location.state as { from?: string } | null)?.from || '/'
      navigate(from, { replace: true })
    } catch (err) { setError(errorMessageFa(err, 'ورود انجام نشد. اطلاعات حساب را بررسی کنید.')) }
    finally { setBusy(false) }
  }

  return <main className="login-page">
    <section className="login-visual" aria-hidden="true"><div className="login-orb login-orb--one" /><div className="login-orb login-orb--two" /><div className="login-visual__copy"><span>مدیریت یکپارچه</span><h1>صداباکس</h1><p>کاربران، انتشارها، درآمد و محتوای پلتفرم در یک پنل سریع و متمرکز.</p></div></section>
    <section className="login-panel">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand"><img src="/sedabox-logo.png" alt="نشان صداباکس" /><div><strong>صداباکس</strong><span>پنل مدیریت</span></div></div>
        <div className="login-copy"><h2>ورود مدیر</h2><p>با حساب مدیریتی خود وارد شوید.</p></div>
        {error && <div className="inline-error" role="alert">{error}</div>}
        <label className="login-field"><span>شماره همراه</span><div><Phone size={18} /><input inputMode="tel" autoComplete="username" dir="ltr" value={phone} onChange={e => setPhone(e.target.value)} placeholder="۰۹۱۲۱۲۳۴۵۶۷" /></div></label>
        <label className="login-field"><span>رمز عبور</span><div><LockKeyhole size={18} /><input type={show ? 'text' : 'password'} autoComplete="current-password" dir="ltr" value={password} onChange={e => setPassword(e.target.value)} placeholder="رمز عبور" /><button type="button" className="password-toggle" onClick={() => setShow(value => !value)} aria-label={show ? 'پنهان کردن رمز' : 'نمایش رمز'}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>
        <button className="button button--primary button--full" type="submit" disabled={busy}>{busy && <LoaderCircle className="spin" size={18} />} ورود به پنل</button>
        <p className="login-note">دسترسی این بخش فقط برای حساب‌های مدیر فعال است.</p>
      </form>
    </section>
  </main>
}
