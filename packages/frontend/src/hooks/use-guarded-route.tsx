import { useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'

/** Sends signed-out visitors to /login, remembering where they were headed. */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { status } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    if (status === 'anonymous') {
      navigate('/login', { replace: true, state: { from: location.pathname } })
    }
  }, [status, navigate, location.pathname])

  // While re-hydrating the session there is no answer yet, so render nothing rather
  // than flashing the login screen at a user who is actually signed in.
  if (status !== 'authenticated') return null

  return <>{children}</>
}

/** Keeps a signed-in user away from /login and /signup. */
export function RedirectIfAuthenticated({ children }: { children: React.ReactNode }) {
  const { status } = useAuth()

  if (status !== 'authenticated') return <>{children}</>

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <p className="text-muted-foreground text-sm">You are already signed in.</p>
        <Button asChild>
          <Link to="/dashboard">Go to dashboard</Link>
        </Button>
      </div>
    </div>
  )
}
