export interface ApiErrorBody {
  code: string
  message: string
  details?: unknown
}

export interface ApiErrorThrown {
  status: number
  success: false
  error: ApiErrorBody
}

export function isApiError(err: unknown): err is ApiErrorThrown {
  return (
    typeof err === 'object' &&
    err !== null &&
    'error' in err &&
    typeof (err as Record<string, unknown>).error === 'object'
  )
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem('wms_token') ?? ''
  const extraHeaders = ((init?.headers ?? {}) as Record<string, string>)

  const res = await fetch(`/api/v1${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...extraHeaders,
    },
  })

  const body = (await res.json()) as { success: boolean; data?: T; error?: ApiErrorBody }

  if (!res.ok || !body.success) {
    const thrown: ApiErrorThrown = {
      status: res.status,
      success: false,
      error: body.error ?? { code: 'UNKNOWN_ERROR', message: 'Erro desconhecido.' },
    }
    throw thrown
  }

  return body.data as T
}

// Decode JWT payload without verification (backend validates on every request)
export type UserRole = 'OPERADOR' | 'SUPERVISOR' | 'ADMIN'

export function getTokenRole(): UserRole | null {
  const token = localStorage.getItem('wms_token')
  if (!token) return null
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(atob(b64)) as { role?: UserRole }
    return payload.role ?? null
  } catch {
    return null
  }
}
