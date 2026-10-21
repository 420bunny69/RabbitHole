import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import { getItem, retryItem } from '../api/items'
import { makeDetail, makeItem } from '../test/fixtures'
import { POLL_INTERVAL_MS, STALL_AFTER_MS, useItem } from './useItem'

vi.mock('../api/items', () => ({
  getItem: vi.fn(),
  retryItem: vi.fn(),
  deleteItem: vi.fn(),
}))

const getItemMock = vi.mocked(getItem)

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.resetAllMocks()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('useItem', () => {
  it('loads the item once and does not poll when it is already finished', async () => {
    getItemMock.mockResolvedValue(makeDetail({ status: 'ready' }))
    const { result } = renderHook(() => useItem('abc'))
    await advance(0)
    expect(result.current.item?.status).toBe('ready')

    await advance(POLL_INTERVAL_MS * 5)
    expect(getItemMock).toHaveBeenCalledTimes(1)
  })

  it('keeps refreshing while the item is processing, then stops once it is ready', async () => {
    getItemMock
      .mockResolvedValueOnce(makeDetail({ status: 'processing', summary: null }))
      .mockResolvedValueOnce(makeDetail({ status: 'processing', summary: null }))
      .mockResolvedValue(makeDetail({ status: 'ready' }))
    const { result } = renderHook(() => useItem('abc'))
    await advance(0)
    expect(result.current.item?.status).toBe('processing')

    await advance(POLL_INTERVAL_MS)
    expect(result.current.item?.status).toBe('processing')
    await advance(POLL_INTERVAL_MS)
    expect(result.current.item?.status).toBe('ready')
    expect(getItemMock).toHaveBeenCalledTimes(3)

    await advance(POLL_INTERVAL_MS * 5)
    expect(getItemMock).toHaveBeenCalledTimes(3) // polling stopped
  })

  it('reports a failure to load the item', async () => {
    getItemMock.mockRejectedValue(new ApiError(500, 'Something went wrong (error 500).'))
    const { result } = renderHook(() => useItem('abc'))
    await advance(0)
    expect(result.current.item).toBeNull()
    expect(result.current.error?.status).toBe(500)
  })

  it('keeps showing the item if a refresh fails, but not if it was deleted meanwhile', async () => {
    getItemMock.mockResolvedValueOnce(makeDetail({ status: 'processing' }))
    const { result } = renderHook(() => useItem('abc'))
    await advance(0)

    getItemMock.mockRejectedValueOnce(new ApiError(0, "Can't reach the server."))
    await advance(POLL_INTERVAL_MS)
    expect(result.current.item).not.toBeNull()
    expect(result.current.error).toBeNull()

    getItemMock.mockRejectedValueOnce(new ApiError(404, 'Item not found'))
    await advance(POLL_INTERVAL_MS)
    expect(result.current.error?.status).toBe(404)
  })

  it('gives up after a long time and says the item looks stuck', async () => {
    getItemMock.mockResolvedValue(makeDetail({ status: 'processing' }))
    const { result } = renderHook(() => useItem('abc'))
    await advance(0)
    expect(result.current.stalled).toBe(false)

    await advance(STALL_AFTER_MS + POLL_INTERVAL_MS * 2)
    expect(result.current.stalled).toBe(true)

    const callsWhenStalled = getItemMock.mock.calls.length
    await advance(POLL_INTERVAL_MS * 5)
    expect(getItemMock).toHaveBeenCalledTimes(callsWhenStalled) // no more requests
  })

  it('retries a failed item and shows the fresh state', async () => {
    getItemMock.mockResolvedValueOnce(makeDetail({ status: 'failed', error_message: 'The AI service is busy' }))
    const { result } = renderHook(() => useItem('abc'))
    await advance(0)
    expect(result.current.item?.status).toBe('failed')

    vi.mocked(retryItem).mockResolvedValue(makeItem({ status: 'pending' }))
    getItemMock.mockResolvedValue(makeDetail({ status: 'processing' }))
    await act(async () => {
      await result.current.retry()
    })
    expect(retryItem).toHaveBeenCalledWith('abc')
    expect(result.current.item?.status).toBe('processing')
  })
})
