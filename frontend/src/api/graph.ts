import type { GraphData } from '../types'
import { request } from './client'

/** The visitor's knowledge graph. `minItems: 2` keeps only concepts that connect two or more resources. */
export async function getGraph(
  params: { minItems?: number; limit?: number } = {},
  signal?: AbortSignal,
): Promise<GraphData> {
  const query = new URLSearchParams()
  if (params.minItems !== undefined) query.set('min_items', String(params.minItems))
  if (params.limit !== undefined) query.set('limit', String(params.limit))
  const suffix = query.size > 0 ? `?${query}` : ''
  return (await request<GraphData>(`/api/graph${suffix}`, { signal })).data
}