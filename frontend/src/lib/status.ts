import type { Item, ItemDetail, ItemStatus } from '../types'

/** True while the backend is still working on an item, so the screen should keep refreshing. */
export function isActive(status: ItemStatus): boolean {
  return status === 'pending' || status === 'processing'
}

export function statusLabel(status: ItemStatus): string {
  if (isActive(status)) return 'Processing'
  return status === 'ready' ? 'Ready' : 'Failed'
}

/** The sentence shown in place of a summary until the item is ready. */
export function statusMessage(item: Pick<Item | ItemDetail, 'status' | 'source_type' | 'error_message'>): string {
  if (isActive(item.status)) {
    return item.source_type === 'text'
      ? 'Summarizing your text…'
      : 'Reading the page and summarizing it…'
  }
  if (item.status === 'failed') return item.error_message ?? 'Processing failed.'
  return ''
}
