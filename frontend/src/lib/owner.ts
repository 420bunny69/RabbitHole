/**
 * There are no accounts. Each browser makes up a random ID once and sends it with every request
 * (the X-Owner-Id header), which is how the backend keeps one visitor's library apart from another's.
 * It is not a password: anyone who knows the ID can see that library.
 */

const STORAGE_KEY = 'rabbithole.ownerId'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Used when localStorage is unavailable (private windows, blocked site data) so the ID stays
// stable for the rest of the visit instead of changing on every request.
let memoryId: string | null = null

function newId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  // crypto.randomUUID only exists on secure origins (https or localhost).
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'))
  return [hex.slice(0, 4), hex.slice(4, 6), hex.slice(6, 8), hex.slice(8, 10), hex.slice(10)]
    .map((part) => part.join(''))
    .join('-')
}

export function getOwnerId(): string {
  let stored: string | null = null
  try {
    stored = localStorage.getItem(STORAGE_KEY)
  } catch {
    // storage is blocked: fall through to the in-memory ID
  }
  if (stored && UUID_PATTERN.test(stored)) {
    memoryId = stored
    return stored
  }

  const id = memoryId ?? newId()
  memoryId = id
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    // storage is blocked: the in-memory ID still works for this visit
  }
  return id
}
