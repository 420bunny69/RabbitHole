import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const KEY = 'rabbithole.ownerId'

// The module remembers an ID in memory, so each test loads a fresh copy.
async function loadOwner() {
  vi.resetModules()
  return (await import('./owner')).getOwnerId
}

describe('getOwnerId', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('creates an ID once, stores it and keeps returning it', async () => {
    const getOwnerId = await loadOwner()
    const first = getOwnerId()
    expect(first).toMatch(UUID)
    expect(getOwnerId()).toBe(first)
    expect(localStorage.getItem(KEY)).toBe(first)
  })

  it('reuses the ID saved by an earlier visit', async () => {
    const saved = '11111111-2222-4333-8444-555555555555'
    localStorage.setItem(KEY, saved)
    const getOwnerId = await loadOwner()
    expect(getOwnerId()).toBe(saved)
  })

  it('replaces a stored value that is not a valid ID', async () => {
    localStorage.setItem(KEY, 'something else')
    const getOwnerId = await loadOwner()
    const id = getOwnerId()
    expect(id).toMatch(UUID)
    expect(localStorage.getItem(KEY)).toBe(id)
  })

  it('keeps one stable ID for the visit when storage is blocked', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const getOwnerId = await loadOwner()
    const first = getOwnerId()
    expect(first).toMatch(UUID)
    expect(getOwnerId()).toBe(first)
  })

  it('still works where crypto.randomUUID is missing (plain http)', async () => {
    const realCrypto = globalThis.crypto
    vi.stubGlobal('crypto', { getRandomValues: (array: Uint8Array<ArrayBuffer>) => realCrypto.getRandomValues(array) })
    const getOwnerId = await loadOwner()
    expect(getOwnerId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})
