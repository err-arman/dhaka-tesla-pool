import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { useAuth } from '@/hooks/use-auth'
import { driversApi } from '@/lib/api'
import { ApiError } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const nav = [
  { to: '/driver', label: 'Dashboard', end: true },
  { to: '/driver/vehicle', label: 'Vehicle' },
]

export function DriverLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [signingOut, setSigningOut] = useState(false)

  const signOut = async () => {
    setSigningOut(true)
    try {
      await logout()
      toast.success('Signed out')
      navigate('/login', { replace: true })
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
              end={item.end}
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
          <nav className="flex items-center gap-1 md:hidden">
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'rounded-md px-2.5 py-1.5 text-sm font-medium',
                    isActive ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground'
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <Badge variant="secondary">Driver</Badge>
            <Button
              variant="outline"
              size="sm"
              disabled={signingOut}
              onClick={async () => {
                // The driver list is cached, so drop it along with the session.
                queryClient.clear()
                await signOut()
              }}
            >
              Sign out
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

/**
 * Shown on driver pages when the account has no driver profile. In the MVP an apply
 * is approved immediately, so the only transition here is passenger -> driver.
 */
export function ApplyToDrive() {
  return (
    <div className="flex flex-col items-start gap-4 rounded-lg border border-dashed p-8">
      <div className="grid gap-1">
        <h2 className="text-lg font-semibold">You are not a driver yet</h2>
        <p className="text-muted-foreground text-sm">
          Register as a driver to start managing your vehicle. Approval is instant
          in this version.
        </p>
      </div>

      <ApplyToDriveButton />
    </div>
  )
}

function ApplyToDriveButton() {
  const { refreshUser } = useAuth()
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(false)

  const apply = async () => {
    setBusy(true)
    try {
      await driversApi.apply()
      // The driver role and the profile both change server-side, so drop the
      // cached user and profile rather than refetching one of them.
      await refreshUser()
      queryClient.invalidateQueries({ queryKey: ['driver'] })
      toast.success('You are now registered as a driver')
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'Could not submit the application'
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button disabled={busy} onClick={apply}>
      {busy ? 'Submitting…' : 'Apply to drive'}
    </Button>
  )
}
