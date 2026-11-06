import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getCurrentAccessToken } from '../lib/supabase'
import { getGraph } from './graph'

vi.mock('../lib/supabase', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/supabase')>()
  return { ...actual, getCurrentAccessToken: vi.fn().mockResolvedValue(null) }
})

const fetchMock = vi.fn()

beforeEach(() => {
  vi.mocked(getCurrentAccessToken).mockReset().mockResolvedValue(null)
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
  it('asks for the whole graph by default without legacy owner authentication', async () => {
    const data = await getGraph()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/graph')
    expect(init.headers.Authorization).toBeUndefined()
    expect(init.headers['X-Owner-Id']).toBeUndefined()
    expect(data).toEqual({ nodes: [], edges: [], truncated: false })
  })

  it('passes the filters along', async () => {
    await getGraph({ minItems: 2, limit: 50 })
    expect(fetchMock.mock.calls[0][0]).toBe('/api/graph?min_items=2&limit=50')
  })
})