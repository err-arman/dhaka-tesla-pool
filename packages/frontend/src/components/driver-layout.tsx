import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

/*
 * None of these is a prefix of another, so NavLink needs no `end` prop. `/driver` itself
 * is not in the list because it redirects to the dashboard.
 */
const nav = [
  { to: '/driver/dashboard', label: 'Dashboard' },
  { to: '/driver/vechile', label: 'Vehicle' },
  { to: '/driver/incoming-request', label: 'Incoming requests' },
  { to: '/driver/settings', label: 'Settings' },
]

export function DriverLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [signingOut, setSigningOut] = useState(false)

  // `logout` clears the query cache itself in endSession(), so there is nothing to
  // invalidate here.
  const signOut = async () => {
    setSigningOut(true)
    try {
      await logout()
      toast.success('Signed out')
      navigate('/signin', { replace: true })
    } finally {
      setSigningOut(false)
    }
  }

  if (!user) return null

  return (
    <div className="flex min-h-screen">
      <aside className="bg-sidebar text-sidebar-foreground hidden w-60 shrink-0 flex-col border-r md:flex">
        <div className="flex h-14 items-center gap-2 px-5">
          <span className="bg-primary text-primary-foreground flex size-7 items-center justify-center rounded-md text-xs font-bold">
            TP
          </span>
          <span className="text-sm font-semibold">Tesla Pool</span>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-3 py-2">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground'
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t p-3">
          <p className="truncate text-sm font-medium">{user.fullName}</p>
          <p className="text-muted-foreground truncate text-xs">{user.email}</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b px-4 md:px-6">
          {/* Four items do not fit a phone, so this row scrolls sideways instead of
              wrapping the header onto a second line. */}
          <nav className="-mx-1 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto px-1 md:hidden">
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'shrink-0 rounded-md px-2.5 py-1.5 text-sm font-medium',
                    isActive ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground'
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-3">
            <Badge variant="secondary">Driver</Badge>
            <Button
              variant="outline"
              size="sm"
              disabled={signingOut}
              onClick={signOut}
            >
              {signingOut ? 'Signing out…' : 'Sign out'}
            </Button>
          </div>
        </header>

        <main className="min-w-0 flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
