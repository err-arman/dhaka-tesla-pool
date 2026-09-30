import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'

import { driversApi } from '@/lib/api'
import { ApiError, type DriverProfile } from '@/lib/types'
import { DriverOnlineToggle } from '@/components/driver-online-toggle'
import { DriverStatusCard } from '@/components/driver-status-card'
import { DriverVehicleSummary } from '@/components/driver-vehicle-summary'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

export default function DriverDashboardPage() {
  const profile = useQuery<DriverProfile | null>({
    queryKey: ['driver', 'me'],
    queryFn: async () => {
      try {
        return await driversApi.me()
      } catch (err) {
        /*
         * 404 NOT_A_DRIVER should be unreachable now that /driver is gated on the
         * driver role, so it is reported as an error rather than as an empty state.
         */
        if (err instanceof ApiError && err.status === 404) return null
        throw err
      }
    },
  })

  if (profile.isLoading) {
    return (
      <div className="grid gap-4">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    )
  }

  if (profile.isError) {
    return (
      <p role="alert" className="text-destructive text-sm">
        Could not load your driver profile.
      </p>
    )
  }

  const data = profile.data

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Driver dashboard</h1>
        <p className="text-muted-foreground text-sm">
          Your availability, approval status and vehicle at a glance.
        </p>
      </div>

      {data ? (
        <>
          {/* Availability first: whether you are taking passengers is the one thing a
              driver opens this page to find. */}
          <DriverOnlineToggle profile={data} />
          <DriverVehicleSummary />
          <DriverStatusCard profile={data} />
        </>
      ) : (
        // The driver role and the profile are created in one transaction, so a user who
        // passed RequireDriver should have a profile. Reaching here means the cached
        // role and the server disagree, not that the user needs to apply.
        <div className="flex flex-col items-start gap-4 rounded-lg border border-dashed p-8">
          <div className="grid gap-1">
            <h2 className="text-lg font-semibold">No driver profile found</h2>
            <p className="text-muted-foreground text-sm">
              Your account has the driver role but the server has no profile for it. Sign
              out and back in to resync, or contact support if it persists.
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link to="/signin">Back to sign in</Link>
          </Button>
        </div>
      )}
    </div>
  )
}
