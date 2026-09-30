import { useEffect } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'

import { useAuth } from '@/hooks/use-auth'
import { homePathFor, isDriver } from '@/lib/roles'
import { Button } from '@/components/ui/button'

/** Sends signed-out visitors to /signin, remembering where they were headed. */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { status } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    if (status === 'anonymous') {
      navigate('/signin', { replace: true, state: { from: location.pathname } })
    }
  }, [status, navigate, location.pathname])

  // While re-hydrating the session there is no answer yet, so render nothing rather
  // than flashing the login screen at a user who is actually signed in.
  if (status !== 'authenticated') return null

  return <>{children}</>
}

/**
 * Keeps a signed-in user away from /signin and /signup. They are sent to the page their
 * own role puts them on, not to a fixed one, so a driver does not land on the passenger
 * page and a passenger does not land on the driver portal.
 */
export function RedirectIfAuthenticated({ children }: { children: React.ReactNode }) {
  const { status, user } = useAuth()

  if (status !== 'authenticated' || !user) return <>{children}</>

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <p className="text-muted-foreground text-sm">You are already signed in.</p>
        <Button asChild>
          <Link to={homePathFor(user.role)}>
            {isDriver(user.role) ? 'Go to driver portal' : 'Go to passenger page'}
          </Link>
        </Button>
      </div>
    </div>
  )
}

/**
 * Sends any account that is not a driver away from the driver portal. Meant to wrap
 * inside RequireAuth, which is what guarantees `user` is non-null here; the null case
 * is handled anyway so the component is safe to use on its own.
 *
 * An account holds exactly one role, so this is an exact comparison rather than a
 * check for the driver role in a list.
 */
export function RequireDriver({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()

  if (!user) return null
  if (!isDriver(user.role)) return <Navigate to="/passenger" replace />

  return <>{children}</>
}

/**
 * The landing route for `/` and for anything unmatched. Sends a signed-in user to the
 * page their role puts them on, and a signed-out one to the login screen.
 */
export function HomeRedirect() {
  const { status, user } = useAuth()

  if (status !== 'authenticated' || !user) return <Navigate to="/signin" replace />
  return <Navigate to={homePathFor(user.role)} replace />
}
