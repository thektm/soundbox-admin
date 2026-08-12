import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { api, errorMessageFa } from './api'

type RefreshKey = string | number | boolean | null | undefined
type RemoteData<T> = { key: string | null; value: T | null }
type RemoteStatus = { key: string | null; loading: boolean; error: string }

export function useRemote<T>(path: string | null, refreshKey?: RefreshKey) {
  const requestKey = path === null ? null : `${path}\u0000${String(refreshKey ?? '')}`
  const [dataState, setDataState] = useState<RemoteData<T>>(() => ({ key: requestKey, value: null }))
  const [statusState, setStatusState] = useState<RemoteStatus>(() => ({ key: requestKey, loading: Boolean(path), error: '' }))
  const requestId = useRef(0)
  const silentRequestId = useRef(0)

  const data = dataState.key === requestKey ? dataState.value : null
  const loading = path ? (statusState.key === requestKey ? statusState.loading : true) : false
  const error = statusState.key === requestKey ? statusState.error : ''

  const setCurrentData = useCallback<Dispatch<SetStateAction<T | null>>>((value) => {
    ++silentRequestId.current
    setDataState(current => {
      const previous = current.key === requestKey ? current.value : null
      const next = typeof value === 'function' ? (value as (current: T | null) => T | null)(previous) : value
      return { key: requestKey, value: next }
    })
  }, [requestKey])

  const reload = useCallback(async () => {
    if (!path || requestKey === null) return null
    const id = ++requestId.current
    ++silentRequestId.current

    // Keep effect-triggered reloads asynchronous so render/commit does not cause
    // a synchronous state cascade; manual reloads still update on the next microtask.
    await Promise.resolve()
    if (id !== requestId.current) return null
    setStatusState({ key: requestKey, loading: true, error: '' })

    try {
      const result = await api<T>(path)
      if (id === requestId.current) setDataState({ key: requestKey, value: result })
      return result
    } catch (err) {
      if (id === requestId.current) setStatusState({ key: requestKey, loading: true, error: errorMessageFa(err) })
      return null
    } finally {
      if (id === requestId.current) {
        setStatusState(current => current.key === requestKey ? { ...current, loading: false } : current)
      }
    }
  }, [path, requestKey])

  const revalidate = useCallback(async (merge?: (current: T | null, incoming: T) => T) => {
    if (!path || requestKey === null) return null
    const visibleGeneration = requestId.current
    const silentId = ++silentRequestId.current
    try {
      const result = await api<T>(path)
      if (visibleGeneration === requestId.current && silentId === silentRequestId.current) {
        setDataState(current => {
          const currentValue = current.key === requestKey ? current.value : null
          return { key: requestKey, value: merge ? merge(currentValue, result) : result }
        })
      }
      return result
    } catch {
      return null
    }
  }, [path, requestKey])

  useEffect(() => { void reload() }, [reload])
  return { data, setData: setCurrentData, loading, error, reload, revalidate }
}
