import { createContext, useContext } from 'react'
import type { StoredAdmin } from './api'

export type AuthValue = {
  user: StoredAdmin | null
  signedIn: boolean
  setUser: (user: StoredAdmin | null) => void
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthValue | null>(null)

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('سامانه ورود آماده نیست.')
  return value
}
