import {
  ApiError,
  tokenStore,
  type ApiErrorBody,
  type AuthResult,
  type DriverProfile,
  type PublicUser,
  type Vehicle,
} from './types'
import type { Portal } from './schemas'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8080/api/v1'

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

/*
 * A single in-flight refresh shared by all callers. Without this, a dashboard that
 * fires three requests on mount would send three refreshes at once, and because the
 * backend rotates the refresh token, two of them would fail and sign the user out.
 */
let refreshInFlight: Promise<boolean> | null = null

/*
 * Called when the session is unrecoverable, so the auth provider can drop to
 * 'anonymous' instead of leaving a signed-in-looking page where every request
 * fails. Set once by AuthProvider on mount; a no-op until then.
 */
let onSessionEnded: (() => void) | null = null

export function setSessionEndedHandler(handler: (() => void) | null): void {
  onSessionEnded = handler
}

function endSessionLocally(): void {
  tokenStore.clear()
  onSessionEnded?.()
}

/**
 * Total by design: every path returns a boolean and none throws. The shared
 * `refreshInFlight` promise is awaited by the caller and then the original ApiError
 * is thrown, so a rejection here would replace a precise status and code with a bare
 * network error and defeat every `instanceof ApiError` branch in the app.
 */
async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = tokenStore.getRefresh()
  if (!refreshToken) return false

  try {
    const res = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })

    if (!res.ok) return false

    const data = (await res.json()) as {
      accessToken: string
      refreshToken: string
    }
    tokenStore.set(data)
    return true
  } catch {
    // Offline, DNS failure, or a 200 with an unreadable body. Treated as "could not
    // refresh" rather than as an error of its own.
    return false
  }
}

async function toApiError(res: Response): Promise<ApiError> {
  let body: ApiErrorBody = {
    error: 'NETWORK_ERROR',
    message: `Unexpected response (${res.status})`,
  }

  try {
    body = (await res.json()) as ApiErrorBody
  } catch {
    // A non-JSON body (proxy error page, empty 502) leaves the fallback above.
  }

  return new ApiError(res.status, body)
}

type RequestOptions = {
  method?: Method
  body?: unknown
  /** Internal: prevents an endless refresh loop if the refreshed token also fails. */
  _retry?: boolean
  auth?: boolean
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, _retry = false, auth = true } = options

  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  const accessToken = tokenStore.getAccess()
  if (auth && accessToken) headers['Authorization'] = `Bearer ${accessToken}`

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })

  if (res.status === 401 && auth) {
    if (!_retry && tokenStore.getRefresh()) {
      // Refresh once and replay. `auth: false` is not needed: the refresh call reads
      // the token straight from storage, so it never recurses back through here.
      refreshInFlight ??= refreshAccessToken().finally(() => {
        refreshInFlight = null
      })

      if (await refreshInFlight) {
        return api<T>(path, { ...options, _retry: true })
      }
    }

    /*
     * Either the refresh token is spent, or a replayed request 401'd again. Both
     * mean this access token is dead and the session is over, so evict it — the
     * earlier version skipped this on the replay path and left a token that 401'd
     * forever in storage.
     */
    if (tokenStore.getAccess() || tokenStore.getRefresh()) endSessionLocally()
  }

  if (!res.ok) throw await toApiError(res)

  if (res.status === 204) return undefined as T

  return (await res.json()) as T
}

export const authApi = {
  /**
   * `role` is the portal the user picked. The backend accepts only 'passenger' or
   * 'driver', and creates a driver profile in the same transaction when it is
   * 'driver', so the account is immediately usable.
   */
  signup: (input: {
    fullName: string
    email: string
    phone?: string
    password: string
    role: Portal
  }) => api<AuthResult>('/auth/signup', { method: 'POST', body: input, auth: false }),

  login: (input: { email: string; password: string }) =>
    api<AuthResult>('/auth/login', { method: 'POST', body: input, auth: false }),

  /** Revokes this one session. Always resolves, even if the token is already gone. */
  logout: (refreshToken: string) =>
    api<void>('/auth/logout', { method: 'POST', body: { refreshToken }, auth: false }),
}

export const usersApi = {
  me: () => api<PublicUser>('/users/me'),
  /** `null` clears a field; omitting a key leaves it as it is. Email is not editable. */
  update: (input: { fullName?: string; phone?: string | null; avatarUrl?: string | null }) =>
    api<PublicUser>('/users/me', { method: 'PATCH', body: input }),
  remove: () => api<void>('/users/me', { method: 'DELETE' }),
}

export const driversApi = {
  /**
   * 404 NOT_A_DRIVER when the account never applied, which is a normal state for a
   * signed-in passenger rather than an error worth surfacing as a failure.
   */
  me: () => api<DriverProfile>('/drivers/me'),

  apply: () => api<DriverProfile>('/drivers/apply', { method: 'POST' }),
}

/**
 * A driver has at most one active vehicle, so this is a singleton: no ids, no
 * lists. PUT registers the vehicle or changes the seats of the existing one, and
 * DELETE deactivates it.
 */
export const vehiclesApi = {
  /** 404 when the driver has not registered a vehicle yet. */
  get: () => api<Vehicle>('/vehicles'),
  put: (input: { seats?: number }) => api<Vehicle>('/vehicles', { method: 'PUT', body: input }),
  /** Partial change to a vehicle that already exists. 404 if there is none. */
  patch: (input: { seats: number }) => api<Vehicle>('/vehicles', { method: 'PATCH', body: input }),
  /** Soft delete: the row stays with isActive false, so a new one can be added. */
  remove: () => api<void>('/vehicles', { method: 'DELETE' }),
}
