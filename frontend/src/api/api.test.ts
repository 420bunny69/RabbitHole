import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './client'
import { createItem, deleteItem, getItem, listItems, retryItem } from './items'

const fetchMock = vi.fn()

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

/** Every call gets a fresh Response, because a response body can only be read once. */
function reply(body: unknown, status = 200) {
  fetchMock.mockImplementation(() => Promise.resolve(json(body, status)))
}

function lastCall() {
  const [url, init] = fetchMock.mock.calls.at(-1)!
  return { url: url as string, init: init as RequestInit & { headers: Record<string, string> } }
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('requests', () => {
  it('send the visitor ID, and only send a JSON content type when there is a body', async () => {
    reply([])
    await listItems()
    const get = lastCall()
    expect(get.init.headers['X-Owner-Id']).toBe(localStorage.getItem('rabbithole.ownerId'))
    expect(get.init.headers['Content-Type']).toBeUndefined()

    reply({ id: '1' }, 201)
    await createItem({ text: 'some text that is long enough' })
    const post = lastCall()
    expect(post.init.method).toBe('POST')
    expect(post.init.headers['Content-Type']).toBe('application/json')
    expect(post.init.body).toBe(JSON.stringify({ text: 'some text that is long enough' }))
  })

  it('build the list query string from the options given', async () => {
    reply([])
    await listItems()
    expect(lastCall().url).toBe('/api/items')
    await listItems({ q: 'gradient', limit: 5 })
    expect(lastCall().url).toBe('/api/items?q=gradient&limit=5')
    await listItems({ q: '' })
    expect(lastCall().url).toBe('/api/items')
  })

  it('use VITE_API_URL as the server address when it is set', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.com/')
    vi.resetModules()
    const { getItem: freshGetItem } = await import('./items')
    reply({ id: 'abc' })
    await freshGetItem('abc')
    expect(lastCall().url).toBe('https://api.example.com/api/items/abc')
  })

  it('reach the right endpoints for get, retry and delete', async () => {
    reply({ id: 'abc' })
    await getItem('abc')
    expect(lastCall().url).toBe('/api/items/abc')
    await retryItem('abc')
    expect(lastCall().url).toBe('/api/items/abc/retry')
    expect(lastCall().init.method).toBe('POST')

    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
    await expect(deleteItem('abc')).resolves.toBeUndefined()
    expect(lastCall().init.method).toBe('DELETE')
  })
})

describe('createItem', () => {
  it('reports whether the link had already been saved', async () => {
    fetchMock.mockResolvedValueOnce(json({ id: '1' }, 201))
    expect((await createItem({ url: 'https://example.com' })).existing).toBe(false)
    fetchMock.mockResolvedValueOnce(json({ id: '1' }, 200))
    expect((await createItem({ url: 'https://example.com' })).existing).toBe(true)
  })
})

describe('errors', () => {
  async function failure(): Promise<ApiError> {
    return (await listItems().catch((error: unknown) => error)) as ApiError
  }

  it('use the message the server sent', async () => {
    reply({ detail: 'That URL points to a private or internal address' }, 422)
    const error = await failure()
    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(422)
    expect(error.message).toBe('That URL points to a private or internal address')
  })

  it('tidy up validation errors', async () => {
    const detail = [{ msg: 'Value error, Provide either a url or text, but not both', loc: ['body'] }]
    reply({ detail }, 422)
    expect((await failure()).message).toBe('Provide either a url or text, but not both')
  })

  it('fall back to a plain message when the server sent nothing useful', async () => {
    fetchMock.mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502 }))
    const error = await failure()
    expect(error.status).toBe(502)
    expect(error.message).toMatch(/error 502/)
  })

  it('explain when the server cannot be reached', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const error = await failure()
    expect(error.status).toBe(0)
    expect(error.message).toMatch(/Can't reach the server/)
  })

  it('let cancelled requests through unchanged', async () => {
    const abort = new DOMException('Aborted', 'AbortError')
    fetchMock.mockRejectedValue(abort)
    await expect(listItems()).rejects.toBe(abort)
  })
})
