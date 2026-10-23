import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getGraph } from './graph'

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  fetchMock.mockImplementation(() =>
    Promise.resolve(
      new Response(JSON.stringify({ nodes: [], edges: [], truncated: false }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  )
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe('getGraph', () => {
  it('asks for the whole graph by default and sends the visitor ID', async () => {
    const data = await getGraph()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/graph')
    expect(init.headers['X-Owner-Id']).toBe(localStorage.getItem('rabbithole.ownerId'))
    expect(data).toEqual({ nodes: [], edges: [], truncated: false })
  })

  it('passes the filters along', async () => {
    await getGraph({ minItems: 2, limit: 50 })
    expect(fetchMock.mock.calls[0][0]).toBe('/api/graph?min_items=2&limit=50')
  })
})