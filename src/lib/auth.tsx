import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { adminLogout, session, sessionEventName, type StoredAdmin } from './api'
import { AuthContext, type AuthValue } from './authContext'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<StoredAdmin | null>(() => session.user())
  useEffect(() => {
    const sync = () => setUser(session.user())
    window.addEventListener(sessionEventName, sync)
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
