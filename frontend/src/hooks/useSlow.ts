import { useEffect, useState } from 'react'

/** Becomes true once `active` has stayed true for `ms` milliseconds. Used for the cold-start notice. */
export function useSlow(active: boolean, ms: number): boolean {
  const [elapsed, setElapsed] = useState(false)
  useEffect(() => {
    if (!active) return
    const timer = setTimeout(() => setElapsed(true), ms)
    return () => {
      clearTimeout(timer)
      setElapsed(false)
    }
  }, [active, ms])
  return active && elapsed
}
