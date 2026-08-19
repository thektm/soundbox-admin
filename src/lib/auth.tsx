import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { adminLogout, adminPanelSession, ApiError, session, sessionEventName, type StoredAdmin } from './api'
import { AuthContext, type AuthValue } from './authContext'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<StoredAdmin | null>(() => session.user())
  useEffect(() => {
    const sync = () => setUser(session.user())
    window.addEventListener(sessionEventName, sync)
    if(session.access()) void adminPanelSession().then(profile=>{session.updateUser(profile);setUser(profile)}).catch(error=>{
      // A temporary network outage must not masquerade as an authorization loss.
      if(error instanceof ApiError&&error.status===0)return
      session.clear();setUser(null)
    })
    return () => window.removeEventListener(sessionEventName, sync)
  }, [])
  const value = useMemo<AuthValue>(() => ({
    user,
    signedIn: Boolean(user && session.access()),
    setUser,
    logout: async () => { await adminLogout(); setUser(null) },
  }), [user])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
