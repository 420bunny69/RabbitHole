import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import { listItems } from '../api/items'
import { deferred, makeItem } from '../test/fixtures'
import type { Item } from '../types'
import { POLL_INTERVAL_MS, useItems } from './useItems'

vi.mock('../api/items', () => ({ listItems: vi.fn() }))

const listMock = vi.mocked(listItems)

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

describe('useItems', () => {
  it('loads the list, and does not poll when everything is finished', async () => {
    listMock.mockResolvedValue([makeItem(), makeItem({ status: 'failed' })])
    const { result } = renderHook(() => useItems(''))
    expect(result.current.items).toBeNull()
    expect(result.current.loading).toBe(true)

    await advance(0)
    expect(result.current.items).toHaveLength(2)
    expect(result.current.loading).toBe(false)

    await advance(POLL_INTERVAL_MS * 5)
    expect(listMock).toHaveBeenCalledTimes(1)
  })

  it('refreshes quietly while any item is processing, then stops', async () => {
    const processing = makeItem({ status: 'processing', summary: null, concepts: [] })
    listMock
      .mockResolvedValueOnce([processing])
      .mockResolvedValue([{ ...processing, status: 'ready', summary: 'Done.' }])
    const { result } = renderHook(() => useItems(''))
    await advance(0)
    expect(result.current.items?.[0].status).toBe('processing')

    await advance(POLL_INTERVAL_MS)
    expect(result.current.items?.[0].status).toBe('ready')
    expect(result.current.loading).toBe(false) // the refresh did not flash a loading state

    await advance(POLL_INTERVAL_MS * 5)
    expect(listMock).toHaveBeenCalledTimes(2)
  })

  it('searches again when the query changes', async () => {
    listMock.mockResolvedValue([])
    const { rerender } = renderHook(({ query }) => useItems(query), { initialProps: { query: '' } })
    await advance(0)
    rerender({ query: 'gradient' })
    await advance(0)
    expect(listMock).toHaveBeenLastCalledWith({ q: 'gradient' })
    rerender({ query: '' })
    await advance(0)
    expect(listMock).toHaveBeenLastCalledWith({ q: undefined })
  })

  it('ignores an old response that arrives after a newer one', async () => {
    const first = deferred<Item[]>()
    const second = deferred<Item[]>()
    listMock.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const newer = makeItem({ title: 'Newer search result' })
    const older = makeItem({ title: 'Older search result' })

    const { result, rerender } = renderHook(({ query }) => useItems(query), { initialProps: { query: '' } })
    rerender({ query: 'abc' })

    await act(async () => second.resolve([newer]))
    expect(result.current.items).toEqual([newer])
    await act(async () => first.resolve([older]))
    expect(result.current.items).toEqual([newer]) // the late, stale answer was dropped
  })

  it('reports an error if the first load fails, and recovers on reload', async () => {
    listMock.mockRejectedValueOnce(new ApiError(0, "Can't reach the server."))
    const { result } = renderHook(() => useItems(''))
    await advance(0)
    expect(result.current.items).toBeNull()
    expect(result.current.error?.message).toMatch(/Can't reach/)
    expect(result.current.loading).toBe(false)

    listMock.mockResolvedValue([makeItem()])
    await act(async () => {
      await result.current.reload()
    })
    expect(result.current.items).toHaveLength(1)
    expect(result.current.error).toBeNull()
  })

  it('upsert puts a new item on top and replaces an existing one in place', async () => {
    const a = makeItem({ title: 'A' })
    const b = makeItem({ title: 'B' })
    listMock.mockResolvedValue([a, b])
    const { result } = renderHook(() => useItems(''))
    await advance(0)

    const fresh = makeItem({ title: 'Fresh' })
    act(() => result.current.upsert(fresh, { toTop: true }))
    expect(result.current.items?.map((item) => item.title)).toEqual(['Fresh', 'A', 'B'])

    act(() => result.current.upsert({ ...b, title: 'B (updated)' }))
    expect(result.current.items?.map((item) => item.title)).toEqual(['Fresh', 'A', 'B (updated)'])
  })
})
