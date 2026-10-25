import type { Item, ItemDetail, NewItem, RelatedItem } from '../types'
import { request } from './client'

export async function listItems(
  params: { q?: string; limit?: number; offset?: number } = {},
  signal?: AbortSignal,
): Promise<Item[]> {
  const query = new URLSearchParams()
  if (params.q) query.set('q', params.q)
  if (params.limit !== undefined) query.set('limit', String(params.limit))
  if (params.offset !== undefined) query.set('offset', String(params.offset))
  const suffix = query.size > 0 ? `?${query}` : ''
  return (await request<Item[]>(`/api/items${suffix}`, { signal })).data
}

export async function getItem(id: string, signal?: AbortSignal): Promise<ItemDetail> {
  return (await request<ItemDetail>(`/api/items/${id}`, { signal })).data
}

/** `existing` is true when the same link was already saved and the first copy came back. */
export async function createItem(input: NewItem): Promise<{ item: Item; existing: boolean }> {
  const { data, status } = await request<Item>('/api/items', { method: 'POST', body: input })
  return { item: data, existing: status === 200 }
}

export async function retryItem(id: string): Promise<Item> {
  return (await request<Item>(`/api/items/${id}/retry`, { method: 'POST' })).data
}

export async function deleteItem(id: string): Promise<void> {
  await request<void>(`/api/items/${id}`, { method: 'DELETE' })
}

export async function getRelatedItems(id: string, signal?: AbortSignal): Promise<RelatedItem[]> {
  return (await request<RelatedItem[]>(`/api/items/${id}/related`, { signal })).data
}

export async function updateNotes(id: string, notes: string | null): Promise<ItemDetail> {
  return (await request<ItemDetail>(`/api/items/${id}/notes`, { method: 'PATCH', body: { notes } })).data
}
