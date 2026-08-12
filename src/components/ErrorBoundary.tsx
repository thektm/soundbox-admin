import { Component, type ErrorInfo, type ReactNode } from 'react'
import { CircleAlert, RefreshCw } from 'lucide-react'

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: Error, info: ErrorInfo) { void error; void info /* جزئیات فنی عمداً روی رابط کاربری نمایش داده نمی‌شود. */ }
  render() {
    if (!this.state.failed) return this.props.children
    return <main className="fatal-error" dir="rtl">
      <div className="fatal-error__card">
        <CircleAlert size={42} />
        <h1>نمایش این بخش با مشکل روبه‌رو شد</h1>
        <p>اطلاعات شما تغییری نکرده است. صفحه را دوباره بارگذاری کنید.</p>
        <button className="button button--primary" type="button" onClick={() => window.location.reload()}><RefreshCw size={18} /> بارگذاری دوباره</button>
      </div>
    </main>
  }
}
