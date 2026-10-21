import { getOwnerId } from '../lib/owner'

// Empty in development (Vite forwards /api to the backend). Set VITE_API_URL for a deployed site.
const BASE_URL = ((import.meta.env.VITE_API_URL as string | undefined) ?? '').replace(/\/+$/, '')

/** An error whose message is safe and helpful to show to the person using the app. */
export class ApiError extends Error {
  status: number // 0 means the server could not be reached at all

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/** Turns anything that went wrong into an ApiError, so screens only handle one kind of failure. */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error
  return new ApiError(0, 'Something went wrong. Please try again.')
}

interface RequestOptions {
  method?: string
  body?: unknown
  signal?: AbortSignal
}

export async function request<T>(
  path: string,
  { method = 'GET', body, signal }: RequestOptions = {},
): Promise<{ data: T; status: number }> {
  const headers: Record<string, string> = { 'X-Owner-Id': getOwnerId() }
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  let response: Response
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError(0, "Can't reach the server. Check your connection and try again.")
  }

  if (!response.ok) throw new ApiError(response.status, await readErrorMessage(response))
  if (response.status === 204) return { data: undefined as T, status: 204 }
  return { data: (await response.json()) as T, status: response.status }
}

/** FastAPI reports problems as {"detail": "text"} or, for invalid input, {"detail": [{"msg": "..."}]}. */
async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = await response.json()
    const detail = body?.detail
    if (typeof detail === 'string' && detail) return detail
    if (Array.isArray(detail) && typeof detail[0]?.msg === 'string') {
      return detail[0].msg.replace(/^Value error,\s*/i, '')
    }
  } catch {
    // the body was not JSON: use the generic message below
  }
  return `Something went wrong (error ${response.status}). Please try again.`
}
