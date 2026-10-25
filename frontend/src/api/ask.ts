import type { AskResponse } from '../types'
import { request } from './client'

export async function askRabbitHole(question: string, signal?: AbortSignal): Promise<AskResponse> {
  return (await request<AskResponse>('/api/ask', { method: 'POST', body: { question }, signal })).data
}
