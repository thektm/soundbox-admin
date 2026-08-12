import { useEffect, useMemo, useState } from 'react'

export function useDebouncedValue<T>(value: T, delay = 320) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(id)
  }, [value, delay])
  return debounced
}

export function usePageState(initialPageSize = 20) {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(initialPageSize)
  return useMemo(() => ({ page, setPage, pageSize, setPageSize, resetPage: () => setPage(1) }), [page, pageSize])
}
