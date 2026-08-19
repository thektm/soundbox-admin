import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { Loading } from '../components/Ui'
import { useAuth } from '../lib/authContext'
import { canView, firstAllowedPath, isOwnerAdmin, type ScreenKey } from '../lib/permissions'

const LoginPage=lazy(()=>import('../pages/LoginPage')), DashboardPage=lazy(()=>import('../pages/DashboardPage')), UsersPage=lazy(()=>import('../pages/UsersPage')), ArtistsPage=lazy(()=>import('../pages/ArtistsPage')), ReleasesPage=lazy(()=>import('../pages/ReleasesPage')), AddReleasePage=lazy(()=>import('../pages/AddReleasePage')), SongsPage=lazy(()=>import('../pages/SongsPage')), AlbumsPage=lazy(()=>import('../pages/AlbumsPage')), TagsPage=lazy(()=>import('../pages/TagsPage')), PlansPage=lazy(()=>import('../pages/PlansPage')), FinancePage=lazy(()=>import('../pages/FinancePage')), ContentPage=lazy(()=>import('../pages/ContentPage')), PlaylistsSectionsPage=lazy(()=>import('../pages/PlaylistsSectionsPage')), SupportPage=lazy(()=>import('../pages/SupportPage')), EmployeesPage=lazy(()=>import('../pages/EmployeesPage')), NotFoundPage=lazy(()=>import('../pages/NotFoundPage'))

function NoAccess(){return <div className="no-access"><div className="card"><strong>در حال حاضر موردی برای نمایش وجود ندارد.</strong><span>برای خروج از حساب از منوی پنل استفاده کنید.</span></div></div>}
function Protected({children,screen,adminOnly=false}:{children:React.ReactNode;screen?:ScreenKey;adminOnly?:boolean}){
 const{signedIn,user}=useAuth();const location=useLocation()
 if(!signedIn)return <Navigate to="/login" replace state={{from:location.pathname}}/>
 if(adminOnly&&!isOwnerAdmin(user))return <Navigate to={firstAllowedPath(user)} replace/>
 if(screen&&!canView(user,screen))return <Navigate to={firstAllowedPath(user)} replace/>
 return <AppShell>{children}</AppShell>
}
export default function App(){const{signedIn,user}=useAuth();return <Suspense fallback={<div className="route-loading"><Loading label="در حال آماده‌سازی پنل…"/></div>}><Routes>
 <Route path="/login" element={signedIn?<Navigate to={firstAllowedPath(user)} replace/>:<LoginPage/>}/>
 <Route path="/" element={<Protected adminOnly><DashboardPage/></Protected>}/>
 <Route path="/users" element={<Protected screen="users"><UsersPage/></Protected>}/><Route path="/artists" element={<Protected screen="artists"><ArtistsPage/></Protected>}/>
 <Route path="/releases" element={<Protected screen="releases"><ReleasesPage/></Protected>}/><Route path="/releases/add" element={<Protected screen="release_add"><AddReleasePage/></Protected>}/><Route path="/releases/add/:releaseId" element={<Protected screen="release_add"><AddReleasePage/></Protected>}/>
 <Route path="/songs" element={<Protected screen="songs"><SongsPage/></Protected>}/><Route path="/albums" element={<Protected screen="albums"><AlbumsPage/></Protected>}/><Route path="/tags" element={<Protected screen="tags"><TagsPage/></Protected>}/><Route path="/plans" element={<Protected screen="plans"><PlansPage/></Protected>}/><Route path="/finance" element={<Protected screen="finance"><FinancePage/></Protected>}/><Route path="/content" element={<Protected screen="content"><ContentPage/></Protected>}/><Route path="/playlists-sections" element={<Protected screen="playlists"><PlaylistsSectionsPage/></Protected>}/><Route path="/support" element={<Protected screen="support"><SupportPage/></Protected>}/>
 <Route path="/employees" element={<Protected adminOnly><EmployeesPage/></Protected>}/><Route path="/no-access" element={<Protected><NoAccess/></Protected>}/><Route path="*" element={<Protected><NotFoundPage/></Protected>}/>
 </Routes></Suspense>}
