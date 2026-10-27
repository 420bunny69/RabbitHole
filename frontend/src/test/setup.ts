import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

afterEach(() => {
  cleanup()
  localStorage.clear()
  // Ensure real timers are always restored between tests so that fake-timer
  // usage in one test file cannot leak into another running in the same worker.
  vi.useRealTimers()
})
