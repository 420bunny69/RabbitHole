import { describe, expect, it } from 'vitest'
import { displayHost, displayLocation, normalizeUserUrl } from './url'

describe('displayHost', () => {
  it('shows just the site, without www', () => {
    expect(displayHost('https://www.example.com/a/b?x=1')).toBe('example.com')
    expect(displayHost('https://blog.example.com/')).toBe('blog.example.com')
  })

  it('falls back to the original text when it is not a URL', () => {
    expect(displayHost('not a url')).toBe('not a url')
  })
})

describe('displayLocation', () => {
  it('shows the site and path', () => {
    expect(displayLocation('https://www.example.com/blog/post')).toBe('example.com/blog/post')
    expect(displayLocation('https://example.com/')).toBe('example.com')
  })

  it('shortens very long addresses', () => {
    const shown = displayLocation(`https://example.com/${'a'.repeat(100)}`)
    expect(shown.length).toBe(60)
    expect(shown.endsWith('…')).toBe(true)
  })
})

describe('normalizeUserUrl', () => {
  it('adds https:// when the scheme is missing', () => {
    expect(normalizeUserUrl('example.com/post')).toBe('https://example.com/post')
    expect(normalizeUserUrl('  www.example.com ')).toBe('https://www.example.com')
  })

  it('leaves complete URLs and other schemes alone so the server can judge them', () => {
    expect(normalizeUserUrl('http://example.com')).toBe('http://example.com')
    expect(normalizeUserUrl('HTTPS://example.com')).toBe('HTTPS://example.com')
    expect(normalizeUserUrl('ftp://example.com/file')).toBe('ftp://example.com/file')
  })

  it('does not touch text that is clearly not a link', () => {
    expect(normalizeUserUrl('two words')).toBe('two words')
    expect(normalizeUserUrl('   ')).toBe('')
  })
})
