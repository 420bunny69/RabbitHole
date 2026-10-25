import type { Trail } from '../types'
import { request } from './client'

export async function getCuriosityTrail(signal?: AbortSignal): Promise<Trail> {
  return (await request<Trail>('/api/trails', { signal })).data
}
