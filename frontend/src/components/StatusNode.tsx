import { useEffect, useRef, useState } from 'react'
import { isActive, statusLabel } from '../lib/status'
import type { ItemStatus } from '../types'

/** The small dot that shows where an item is: a pulsing ring, a solid dot, or a red cross. */
export function StatusDot({ status, celebrate = false }: { status: ItemStatus; celebrate?: boolean }) {
  if (isActive(status)) {
    return (
      <span
        aria-hidden
        className="block size-3 animate-pulse-ring rounded-full border-2 border-accent motion-reduce:animate-none"
      />
    )
  }
  if (status === 'failed') {
    return (
      <span aria-hidden className="grid size-3 place-items-center rounded-full bg-danger text-paper">
        <svg viewBox="0 0 8 8" className="size-2" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M2 2l4 4M6 2L2 6" />
        </svg>
      </span>
    )
  }
  return (
    <span
      aria-hidden
      className={`block size-3 rounded-full bg-burrow ${celebrate ? 'animate-settle motion-reduce:animate-none' : ''}`}
    />
  )
}

/**
 * A StatusDot placed on the library's vertical line. The paper-coloured backing hides the line
 * behind the dot. The dot lands (once) only when an item you were waiting on finishes.
 */
export function StatusNode({ status }: { status: ItemStatus }) {
  const previous = useRef(status)
  const [celebrate, setCelebrate] = useState(false)

  useEffect(() => {
    if (isActive(previous.current) && status === 'ready') setCelebrate(true)
    previous.current = status
  }, [status])

  return (
    <span className="absolute top-1 left-0 grid place-items-center rounded-full bg-paper p-1">
      <StatusDot status={status} celebrate={celebrate} />
      <span className="sr-only">{statusLabel(status)}</span>
    </span>
  )
}
