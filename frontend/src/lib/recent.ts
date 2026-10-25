import { getOwnerId } from './owner'
import type { Item, ItemDetail, RecentlyViewedItem } from '../types'

const MAX_RECENT = 30

function getStorageKey(): string {
  return `rabbithole.recent.${getOwnerId()}`
}

export function getRecentlyViewed(): RecentlyViewedItem[] {
  try {
    const raw = localStorage.getItem(getStorageKey())
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return parsed
    }
  } catch {
    // ignore parse error or blocked storage
  }
  return []
}

export function recordItemVisit(item: Item | ItemDetail): void {
  try {
    const current = getRecentlyViewed()
    const filtered = current.filter((r) => r.id !== item.id)
    const newEntry: RecentlyViewedItem = {
      id: item.id,
      title: item.title,
      url: item.url,
      source_type: item.source_type,
      summary: item.summary,
      visited_at: new Date().toISOString(),
    }
    const updated = [newEntry, ...filtered].slice(0, MAX_RECENT)
    localStorage.setItem(getStorageKey(), JSON.stringify(updated))
  } catch {
    // ignore storage quota or restrictions
  }
}

export function clearRecentlyViewed(): void {
  try {
    localStorage.removeItem(getStorageKey())
  } catch {
    // ignore
  }
}
