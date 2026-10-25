import type { TopicDetail } from '../types'
import { request } from './client'

export async function listTopics(signal?: AbortSignal): Promise<TopicDetail[]> {
  return (await request<TopicDetail[]>('/api/topics', { signal })).data
}
