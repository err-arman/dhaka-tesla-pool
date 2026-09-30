import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { useAuth } from '@/hooks/use-auth'
import { driversApi } from '@/lib/api'
import { ApiError } from '@/lib/types'
import { Button } from '@/components/ui/button'

/**
 * Turns a passenger into a driver (`POST /drivers/apply`). It lives on the passenger
 * page rather than in the driver area, because /driver is gated on the driver role
 * and a passenger cannot get there to see this.
 */
export function ApplyToDrive() {
  return (
    <div className="flex flex-col items-start gap-4 rounded-lg border border-dashed p-8">
      <div className="grid gap-1">
        <h2 className="text-lg font-semibold">You are not a driver yet</h2>
        <p className="text-muted-foreground text-sm">
          Register as a driver to start managing your vehicle. Approval is instant in this
          version.
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
      // The driver role and the profile both change server-side, so drop the cached
      // user and profile rather than refetching one of them. The user has to be
      // refetched because homePathFor() reads the driver role off it.
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
