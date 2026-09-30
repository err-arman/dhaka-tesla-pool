import type { Role } from '@/lib/types'

/**
 * The driver area is gated on this role. Anyone else is redirected to /passenger, so
 * the driver portal is never rendered for an account that cannot use it.
 */
export function isDriver(role: Role): boolean {
  return role === 'driver'
}

/**
 * Where a signed-in user belongs. The account holds exactly one role, so this is a
 * straight comparison and not a search through a list. The backend decides the role;
 * the sign-in tab only expresses intent and never grants it.
 *
 * An `admin` is not a driver, so `isAdmin` falls through to /passenger. Admins do not
 * have a portal of their own yet.
 */
export function homePathFor(role: Role): '/driver' | '/passenger' {
  return isDriver(role) ? '/driver' : '/passenger'
}
