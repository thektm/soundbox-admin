import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { Loading } from '../components/Ui'
import { useAuth } from '../lib/authContext'

const LoginPage = lazy(() => import('../pages/LoginPage'))
const DashboardPage = lazy(() => import('../pages/DashboardPage'))
const UsersPage = lazy(() => import('../pages/UsersPage'))
const ArtistsPage = lazy(() => import('../pages/ArtistsPage'))
const ReleasesPage = lazy(() => import('../pages/ReleasesPage'))
const SongsPage = lazy(() => import('../pages/SongsPage'))
const AlbumsPage = lazy(() => import('../pages/AlbumsPage'))
const PlansPage = lazy(() => import('../pages/PlansPage'))
const FinancePage = lazy(() => import('../pages/FinancePage'))
const ContentPage = lazy(() => import('../pages/ContentPage'))
const PlaylistsSectionsPage = lazy(() => import('../pages/PlaylistsSectionsPage'))
const SupportPage = lazy(() => import('../pages/SupportPage'))
const NotFoundPage = lazy(() => import('../pages/NotFoundPage'))

function Protected({ children }: { children: React.ReactNode }) {
  const { signedIn } = useAuth()
  const location = useLocation()
  if (!signedIn) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <AppShell>{children}</AppShell>
}

export default function App() {
  const { signedIn } = useAuth()
  return <Suspense fallback={<div className="route-loading"><Loading label="در حال آماده‌سازی پنل…" /></div>}>
    <Routes>
      <Route path="/login" element={signedIn ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/" element={<Protected><DashboardPage /></Protected>} />
      <Route path="/users" element={<Protected><UsersPage /></Protected>} />
      <Route path="/artists" element={<Protected><ArtistsPage /></Protected>} />
      <Route path="/releases" element={<Protected><ReleasesPage /></Protected>} />
      <Route path="/songs" element={<Protected><SongsPage /></Protected>} />
      <Route path="/albums" element={<Protected><AlbumsPage /></Protected>} />
      <Route path="/plans" element={<Protected><PlansPage /></Protected>} />
      <Route path="/finance" element={<Protected><FinancePage /></Protected>} />
      <Route path="/content" element={<Protected><ContentPage /></Protected>} />
      <Route path="/playlists-sections" element={<Protected><PlaylistsSectionsPage /></Protected>} />
      <Route path="/support" element={<Protected><SupportPage /></Protected>} />
      <Route path="*" element={<Protected><NotFoundPage /></Protected>} />
    </Routes>
  </Suspense>
}
