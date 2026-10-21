import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, toApiError } from '../api/client'
import { deleteItem, getItem, retryItem } from '../api/items'
import { isActive } from '../lib/status'
import type { ItemDetail } from '../types'

export const POLL_INTERVAL_MS = 2000
/** After this long we stop refreshing and tell the visitor it is taking unusually long. */
export const STALL_AFTER_MS = 5 * 60 * 1000

/**
 * One item with all its details. While it is being processed the item refreshes itself, so the
 * summary and concepts appear as soon as they are ready. Render this inside a component that is
 * keyed by the item's id, so that opening a different item starts from a clean state.
 */
export function useItem(id: string) {
  const [item, setItem] = useState<ItemDetail | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [stalled, setStalled] = useState(false)
  const loadedItem = useRef<ItemDetail | null>(null)
  const startedAt = useRef(0) // set when polling begins

  const load = useCallback(async () => {
    try {
      const data = await getItem(id)
      loadedItem.current = data
      setItem(data)
      setError(null)
    } catch (caught) {
      const apiError = toApiError(caught)
      // A hiccup while refreshing should not wipe a page the visitor is already reading.
      if (!loadedItem.current || apiError.status === 404) setError(apiError)
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  const active = item ? isActive(item.status) : false
  useEffect(() => {
    if (!active) return
    startedAt.current = Date.now()
    const timer = setInterval(() => {
      if (Date.now() - startedAt.current > STALL_AFTER_MS) {
        setStalled(true)
        clearInterval(timer)
        return
      }
      void load()
    }, POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [active, load])

  const retry = useCallback(async () => {
    await retryItem(id)
    setStalled(false)
    await load()
  }, [id, load])

  const remove = useCallback(async () => {
    await deleteItem(id)
  }, [id])

  return { item, error, stalled, retry, remove }
}
