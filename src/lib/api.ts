import { hasPersian } from './format'

const API_BASE = (import.meta.env.VITE_API_BASE_URL?.trim() || 'https://api.sedabox.com/api').replace(/\/$/, '')
const ACCESS_KEY = 'sedabox_admin_access'
const REFRESH_KEY = 'sedabox_admin_refresh'
const USER_KEY = 'sedabox_admin_user'
const SESSION_EVENT = 'sedabox:admin-session'

export type StoredAdmin = { id:number; phone_number:string; first_name?:string; last_name?:string; roles?:string[]; is_staff?:boolean; is_owner_admin?:boolean; is_employee?:boolean; employee_role?:'manager'|'supervisor'|null; permissions?:Record<string,boolean> }

export const session = {
  access: () => localStorage.getItem(ACCESS_KEY),
  refresh: () => localStorage.getItem(REFRESH_KEY),
  user: (): StoredAdmin | null => {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null') as StoredAdmin | null } catch { return null }
  },
  save(access: string, refresh: string, user: StoredAdmin) {
    localStorage.setItem(ACCESS_KEY, access)
    localStorage.setItem(REFRESH_KEY, refresh)
    localStorage.setItem(USER_KEY, JSON.stringify(user))
    window.dispatchEvent(new Event(SESSION_EVENT))
  },
  updateTokens(access: string, refresh: string) {
    localStorage.setItem(ACCESS_KEY, access)
    localStorage.setItem(REFRESH_KEY, refresh)
  },
  updateUser(user: StoredAdmin) {
    localStorage.setItem(USER_KEY, JSON.stringify(user))
    window.dispatchEvent(new Event(SESSION_EVENT))
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY)
    localStorage.removeItem(REFRESH_KEY)
    localStorage.removeItem(USER_KEY)
    window.dispatchEvent(new Event(SESSION_EVENT))
  },
}

function flattenMessages(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(flattenMessages)
  if (value && typeof value === 'object') return Object.values(value as Record<string, unknown>).flatMap(flattenMessages)
  return []
}

export function errorMessageFa(error: unknown, fallback = 'عملیات انجام نشد. دوباره تلاش کنید.'): string {
  if (error instanceof ApiError) {
    const messages = flattenMessages(error.body)
    const persian = messages.find(hasPersian)
    if (persian) return persian
    if (error.status === 400) return 'اطلاعات واردشده معتبر نیست. فیلدها را بررسی کنید.'
    if (error.status === 401) return 'نشست شما منقضی شده است. دوباره وارد شوید.'
    if (error.status === 403) return 'شما اجازه انجام این عملیات را ندارید.'
    if (error.status === 404) return 'اطلاعات موردنظر پیدا نشد.'
    if (error.status === 409) return 'این عملیات با وضعیت فعلی اطلاعات سازگار نیست.'
    if (error.status >= 500) return 'خطایی در سرور رخ داد. کمی بعد دوباره تلاش کنید.'
  }
  return fallback
}

export class ApiError extends Error {
  status: number
  body: unknown
  constructor(status: number, body: unknown) {
    super('api_error')
    this.status = status
    this.body = body
  }
}

let refreshPromise: Promise<boolean> | null = null
async function refreshSession(): Promise<boolean> {
  if (refreshPromise) return refreshPromise
  refreshPromise = (async () => {
    const refreshToken = session.refresh()
    if (!refreshToken) return false
    try {
      const response = await fetch(`${API_BASE}/auth/token/refresh/`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept-Language': 'fa' },
        body: JSON.stringify({ refreshToken }),
      })
      if (!response.ok) return false
      const data = await response.json() as { accessToken: string; refreshToken: string }
      session.updateTokens(data.accessToken, data.refreshToken)
      return true
    } catch { return false }
    finally { refreshPromise = null }
  })()
  return refreshPromise
}

async function parseBody(response: Response): Promise<unknown> {
  if (response.status === 204) return null
  const type = response.headers.get('content-type') || ''
  if (type.includes('application/json')) return response.json().catch(() => null)
  return response.text().catch(() => '')
}

type RequestOptions = RequestInit & { auth?: boolean; retry?: boolean }
export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { auth = true, retry = true, ...init } = options
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  headers.set('Accept-Language', 'fa')
  if (!(init.body instanceof FormData) && init.body !== undefined && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  if (auth && session.access()) headers.set('Authorization', `Bearer ${session.access()}`)

  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, { ...init, headers })
  } catch {
    throw new ApiError(0, { detail: 'ارتباط با سرور برقرار نشد.' })
  }

  if (response.status === 401 && auth && retry && await refreshSession()) {
    return api<T>(path, { ...options, retry: false })
  }
  const body = await parseBody(response)
  if (!response.ok) {
    if (response.status === 401) session.clear()
    throw new ApiError(response.status, body)
  }
  return body as T
}

export const sessionEventName = SESSION_EVENT

export const jsonBody = (value: unknown) => JSON.stringify(value)

export function resolveMediaUrl(value?: string | null): string {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (/^(https?:|blob:|data:)/i.test(raw)) return raw
  try {
    const origin = new URL(API_BASE).origin
    return `${origin}/${raw.replace(/^\/+/, '')}`
  } catch {
    return raw
  }
}

export function queryString(params: Record<string, string | number | boolean | undefined | null>) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') query.set(key, String(value))
  })
  const result = query.toString()
  return result ? `?${result}` : ''
}

export async function adminPanelSession() {
  return api<StoredAdmin>('/admin/session/')
}

export async function adminLogin(phone: string, password: string) {
  const result = await api<{ accessToken:string; refreshToken:string; user:StoredAdmin }>('/auth/login/password/', { method:'POST', auth:false, body:jsonBody({phone,password}) })
  const roles=result.user?.roles||[]
  const looksLikeEmployee=roles.includes('manager')||roles.includes('supervisor')
  if(!result.user?.is_staff&&!looksLikeEmployee) throw new ApiError(403,{detail:'این حساب دسترسی به پنل مدیریت ندارد.'})
  session.save(result.accessToken,result.refreshToken,result.user)
  try { const profile=await adminPanelSession(); session.updateUser(profile); return profile }
  catch(error){ session.clear(); throw error }
}

export async function adminLogout() {
  const refreshToken = session.refresh()
  try {
    if (refreshToken) await api('/auth/logout/', { method: 'POST', body: jsonBody({ refreshToken }) })
  } finally { session.clear() }
}
