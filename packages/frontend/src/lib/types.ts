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
  /**
   * Which area they are working right now. Null when offline. Required to go online --
   * matching measures a driver's distance to a pool's pickup from this, so it is the
   * difference between appearing in a feed and never being offered anything.
   */
  currentZoneId: string | null
  createdAt: string
}

export type Vehicle = {
  id: string
  driverId: string
  seats: number
  isActive: boolean
}

/**
 * A curated Dhaka area from `locations`, seeded by `db:seed:locations`. The coordinates
 * are the centre of the area, not a boundary: enough to display and sanity-check, not to
 * navigate or to measure distance.
 */
/** Poisha to a readable amount. 100 poisha is ৳1. */
export const formatPoisha = (amount: number): string => `৳${(amount / 100).toFixed(2)}`

/**
 * The pool lifecycle from the driver's side. `cancelled` is absent: cancellation carries
 * a penalty in the product spec with no amount defined yet, so nothing can produce it.
 */
export type PoolStatus = 'matched' | 'accepted' | 'driver_arrived' | 'started' | 'completed'

/** The four verbs the pool state machine accepts, in the order a trip happens. */
export type PoolAction = 'accept' | 'arrive' | 'start' | 'complete'

/** A pool another driver's car is offering. */
export type PoolOffer = {
  id: string
  status: PoolStatus
  pickupName: string | null
  destinationName: string | null
  distanceKm: number
  currentAvailableSeats: number
  passengerCount: number
  seatsWanted: number
  createdAt: string
  destinationLat: number | null
  destinationLng: number | null
}

/** The trip this driver is already driving, if any. */
export type CurrentTrip = {
  id: string
  status: PoolStatus
  pickupName: string | null
  destinationName: string | null
  currentAvailableSeats: number
  passengers: number
  createdAt: string
}

export type DriverFeed = {
  offers: PoolOffer[]
  currentTrip: CurrentTrip | null
}

/**
 * The next verb offered to the driver for a pool in a given state, and the label to put
 * on it. Derived rather than stored so a button can never offer an action the server
 * would reject: the sequence is a straight line, and `null` means there is nothing left
 * to do.
 */
export const POOL_ACTION_LABELS: Record<PoolStatus, { action: PoolAction; label: string } | null> = {
  matched: { action: 'accept', label: 'Accept' },
  accepted: { action: 'arrive', label: 'Arrived at pickup' },
  driver_arrived: { action: 'start', label: 'Start the trip' },
  started: { action: 'complete', label: 'Complete the trip' },
  completed: null,
}

export const POOL_STATUS_LABELS: Record<PoolStatus, string> = {
  matched: 'Waiting for your answer',
  accepted: 'Accepted',
  driver_arrived: 'At the pickup',
  started: 'On the way',
  completed: 'Completed',
}

export type Location = {
  id: string
  name: string
  lat: number
  lng: number
}

/**
 * One trip request. `poolId` and `fareAmount` are null/0 until matching attaches the
 * request to a pool and prices it, so a freshly submitted request legitimately has no
 * fare yet -- the UI must not render ৳0 as though that were the price.
 */
export type RideRequestStatus =
  | 'requested'
  | 'matched'
  | 'in_progress'
  | 'completed'
  | 'cancelled'

/**
 * The states in which a trip is still under way, so a passenger can only have one of
 * these at a time. Mirrors the predicate of the backend's
 * `ride_requests_one_live_per_passenger` index; `completed` and `cancelled` are history.
 *
 * Used to disable the booking form while a trip is live, so the rule is visible before
 * the passenger hits a 409 rather than after.
 */
export const LIVE_RIDE_REQUEST_STATUSES: RideRequestStatus[] = [
  'requested',
  'matched',
  'in_progress',
]

export type RideRequest = {
  id: string
  passengerId: string
  poolId: string | null
  pickupLocationId: string
  destinationLocationId: string
  pickupName: string | null
  destinationName: string | null
  seatsRequested: number
  status: RideRequestStatus
  /** Poisha, so 10000 is ৳100. 0 until the request is priced by matching. */
  fareAmount: number
  createdAt: string
  updatedAt: string
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
