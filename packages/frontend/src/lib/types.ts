/** Matches the `{ error, message, issues? }` shape every backend error uses. */
export type ApiErrorBody = {
  error: string
  message: string
  issues?: { path: string; message: string }[]
}

export type Role = 'passenger' | 'driver' | 'admin'

export type PublicUser = {
  id: string
  fullName: string
  email: string | null
  phone: string | null
  avatarUrl: string | null
  /** Exactly one role per account. Was `roles: Role[]` while the API was many-to-many. */
  role: Role
}

/** Mirrors the `driver_status` database enum. */
export type DriverStatus = 'pending' | 'approved' | 'rejected' | 'suspended'

export type DriverProfile = {
  userId: string
  status: DriverStatus
  /** The driver's own choice: are they taking passengers right now. */
  isOnline: boolean
  createdAt: string
}

export type Vehicle = {
  id: string
  driverId: string
  seats: number
  isActive: boolean
}

export type AuthResult = {
  user: PublicUser
  accessToken: string
  refreshToken: string
  expiresIn: number
}

const ACCESS_KEY = 'tesla-pool.accessToken'
const REFRESH_KEY = 'tesla-pool.refreshToken'

/*
 * The access token is short lived (15 min) and the refresh token rotates, so both
 * live in localStorage: a page reload must not sign the user out, and the backend
 * has no cookie session to fall back on. A stricter deployment would keep the
 * refresh token in an httpOnly cookie instead.
 */
export const tokenStore = {
  getAccess: () => localStorage.getItem(ACCESS_KEY),
  getRefresh: () => localStorage.getItem(REFRESH_KEY),

  set({ accessToken, refreshToken }: { accessToken: string; refreshToken: string }) {
    localStorage.setItem(ACCESS_KEY, accessToken)
    localStorage.setItem(REFRESH_KEY, refreshToken)
  },

  clear() {
    localStorage.removeItem(ACCESS_KEY)
    localStorage.removeItem(REFRESH_KEY)
  },
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly issues: { path: string; message: string }[]

  constructor(status: number, body: ApiErrorBody) {
    super(body.message)
    this.name = 'ApiError'
    this.status = status
    this.code = body.error
    this.issues = body.issues ?? []
  }

  /** Field-level messages, keyed by the path the backend reported. */
  get fieldErrors(): Record<string, string> {
    return Object.fromEntries(this.issues.map((i) => [i.path, i.message]))
  }
}
