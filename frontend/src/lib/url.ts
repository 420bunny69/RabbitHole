/** "https://www.example.com/a/b" becomes "example.com". */
export function displayHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** A short readable form of a URL, used as the title while the real one is still being fetched. */
export function displayLocation(url: string): string {
  try {
    const parsed = new URL(url)
    const path = parsed.pathname === '/' ? '' : parsed.pathname
    const text = parsed.hostname.replace(/^www\./, '') + path
    return text.length > 60 ? `${text.slice(0, 59)}…` : text
  } catch {
    return url
  }
}

/** Lets people type "example.com/post" without the "https://". */
export function normalizeUserUrl(input: string): string {
  const trimmed = input.trim()
  if (!trimmed || /\s/.test(trimmed) || /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}
