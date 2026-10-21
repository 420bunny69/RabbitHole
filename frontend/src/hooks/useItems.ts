import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, toApiError } from '../api/client'
import { listItems } from '../api/items'
import { isActive } from '../lib/status'
import type { Item } from '../types'

export const POLL_INTERVAL_MS = 2000

/**
 * The visitor's saved items, newest first. While any item is still being processed the list
 * refreshes itself every couple of seconds, so summaries appear without reloading the page.
 */
export function useItems(query: string) {
  const [items, setItems] = useState<Item[] | null>(null) // null until the first load finishes
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<ApiError | null>(null)
  const latestRequest = useRef(0)

  const load = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      const requestId = ++latestRequest.current
      if (!silent) setLoading(true)
      try {
        const data = await listItems({ q: query || undefined })
        if (requestId !== latestRequest.current) return // a newer request replaced this one
        setItems(data)
        setError(null)
      } catch (caught) {
        if (requestId !== latestRequest.current) return
        setError(toApiError(caught))
      } finally {
        if (requestId === latestRequest.current) setLoading(false)
      }
    },
    [query],
  )

  useEffect(() => {
    void load()
  }, [load])

  const anyActive = items?.some((item) => isActive(item.status)) ?? false
  useEffect(() => {
    if (!anyActive) return
    const timer = setInterval(() => void load({ silent: true }), POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [anyActive, load])

  /** Puts an item at the top, or replaces it in place if it is already listed. */
  const upsert = useCallback((item: Item, { toTop = false } = {}) => {
    setItems((current) => {
      if (!current) return [item]
      const exists = current.some((existing) => existing.id === item.id)
      if (exists && !toTop) return current.map((existing) => (existing.id === item.id ? item : existing))
      return [item, ...current.filter((existing) => existing.id !== item.id)]
    })
  }, [])

  return { items, loading, error, reload: load, upsert }
}
