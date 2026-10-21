const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

/** "just now", "5 minutes ago", "yesterday", or a short date for anything older than a week. */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso)
  const seconds = Math.round((date.getTime() - now.getTime()) / 1000) // negative = in the past
  if (seconds > -45) return 'just now' // also covers small clock differences between devices
  const age = -seconds
  if (age < 3600) return relative.format(Math.round(seconds / 60), 'minute')
  if (age < 86_400) return relative.format(Math.round(seconds / 3600), 'hour')
  if (age < 7 * 86_400) return relative.format(Math.round(seconds / 86_400), 'day')
  const sameYear = date.getFullYear() === now.getFullYear()
  return date.toLocaleDateString('en', {
    day: 'numeric',
    month: 'short',
    year: sameYear ? undefined : 'numeric',
  })
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/** "Today", "Yesterday", or a weekday and date, using the visitor's local calendar. */
export function dayLabel(iso: string, now: Date = new Date()): string {
  const date = new Date(iso)
  const daysAgo = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000)
  if (daysAgo <= 0) return 'Today'
  if (daysAgo === 1) return 'Yesterday'
  return date.toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'short' })
}

/** Splits a newest-first list into runs that share a day label, keeping the order. */
export function groupByDay<T extends { created_at: string }>(
  items: T[],
  now: Date = new Date(),
): { label: string; items: T[] }[] {
  const groups: { label: string; items: T[] }[] = []
  for (const item of items) {
    const label = dayLabel(item.created_at, now)
    const last = groups[groups.length - 1]
    if (last && last.label === label) last.items.push(item)
    else groups.push({ label, items: [item] })
  }
  return groups
}
