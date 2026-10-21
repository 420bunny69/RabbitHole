import { describe, expect, it } from 'vitest'
import { dayLabel, groupByDay, relativeTime } from './time'

describe('relativeTime', () => {
  const now = new Date('2026-10-17T12:00:00Z')
  const ago = (seconds: number) => new Date(now.getTime() - seconds * 1000).toISOString()

  it('says "just now" for the last minute, and for times slightly in the future', () => {
    expect(relativeTime(ago(10), now)).toBe('just now')
    expect(relativeTime(ago(-30), now)).toBe('just now')
  })

  it('counts minutes, hours and days', () => {
    expect(relativeTime(ago(5 * 60), now)).toBe('5 minutes ago')
    expect(relativeTime(ago(3 * 3600), now)).toBe('3 hours ago')
    expect(relativeTime(ago(86_400), now)).toBe('yesterday')
    expect(relativeTime(ago(3 * 86_400), now)).toBe('3 days ago')
  })

  it('switches to a short date after a week, adding the year only when it differs', () => {
    expect(relativeTime(ago(10 * 86_400), now)).toMatch(/Oct/)
    expect(relativeTime(ago(10 * 86_400), now)).not.toMatch(/2026/)
    expect(relativeTime('2025-03-02T12:00:00Z', now)).toMatch(/2025/)
  })
})

describe('dayLabel and groupByDay', () => {
  const now = new Date(2026, 9, 17, 15, 0) // 17 Oct 2026, local time
  const at = (day: number, hour: number) => new Date(2026, 9, day, hour, 0).toISOString()

  it('labels today, yesterday and older days', () => {
    expect(dayLabel(at(17, 9), now)).toBe('Today')
    expect(dayLabel(at(16, 23), now)).toBe('Yesterday')
    const older = dayLabel(at(12, 10), now)
    expect(older).toMatch(/Oct/)
    expect(older).toMatch(/12/)
  })

  it('treats a time slightly ahead of this device as today', () => {
    expect(dayLabel(at(17, 23), now)).toBe('Today')
  })

  it('groups a newest-first list by day and keeps the order', () => {
    const items = [
      { id: 'a', created_at: at(17, 14) },
      { id: 'b', created_at: at(17, 9) },
      { id: 'c', created_at: at(16, 20) },
      { id: 'd', created_at: at(12, 10) },
    ]
    const groups = groupByDay(items, now)
    expect(groups.map((group) => group.label)).toEqual(['Today', 'Yesterday', dayLabel(at(12, 10), now)])
    expect(groups.map((group) => group.items.map((item) => item.id))).toEqual([['a', 'b'], ['c'], ['d']])
  })

  it('returns no groups for an empty list', () => {
    expect(groupByDay([], now)).toEqual([])
  })
})
