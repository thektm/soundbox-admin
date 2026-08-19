import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ToastProvider } from './components/Toast'
import { AuthProvider } from './lib/auth'
import { ImageCropperProvider } from './contexts/ImageCropperContext'
import App from './app/App'
import './styles.css'

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('ریشه رابط مدیریت پیدا نشد.')

createRoot(rootElement).render(
  <ErrorBoundary>
    <BrowserRouter>
      <AuthProvider><ToastProvider><ImageCropperProvider><App /></ImageCropperProvider></ToastProvider></AuthProvider>
    </BrowserRouter>
  </ErrorBoundary>,
)
