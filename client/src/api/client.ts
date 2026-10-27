import type { ApiErrorBody } from './types'

export class ApiError extends Error {
  constructor(public readonly status: number, message: string, public readonly body: ApiErrorBody) {
    super(message)
    this.name = 'ApiError'
  }
}

export async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  if (!url.startsWith('/api/')) throw new Error('Only relative API URLs are allowed')
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  const response = await fetch(url, { ...init, headers })
  const body: unknown = await response.json()
  if (!response.ok) {
    const errorBody = body && typeof body === 'object' ? body as ApiErrorBody : {}
    throw new ApiError(response.status, errorBody.error ?? `Request failed (${response.status})`, errorBody)
  }
  return body as T
}
