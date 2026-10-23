import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, toApiError } from '../api/client'
import { getGraph } from '../api/graph'
import type { GraphData } from '../types'

/**
 * The knowledge graph. `version` goes up every time fresh data arrives, so the screen can
 * start the drawing from scratch (new layout, nothing selected) instead of patching the old one.
 */
export function useGraph(minItems: number) {
  const [data, setData] = useState<GraphData | null>(null)
  const [version, setVersion] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<ApiError | null>(null)
  const latestRequest = useRef(0)

  const load = useCallback(async () => {
    const requestId = ++latestRequest.current
    setLoading(true)
    try {
      const result = await getGraph({ minItems })
      if (requestId !== latestRequest.current) return // a newer request replaced this one
      setData(result)
      setVersion((current) => current + 1)
      setError(null)
    } catch (caught) {
      if (requestId !== latestRequest.current) return
      setError(toApiError(caught))
    } finally {
      if (requestId === latestRequest.current) setLoading(false)
    }
  }, [minItems])

  useEffect(() => {
    void load()
  }, [load])

  return { data, version, loading, error, reload: load }
}