import { useQuery } from '@tanstack/react-query'

import { driversApi } from '@/lib/api'
import { ApiError, type DriverProfile } from '@/lib/types'
import { ApplyToDrive } from '@/components/driver-layout'
import { DriverStatusCard } from '@/components/driver-status-card'
import { VehicleCard } from '@/components/vehicle-card'
import { Skeleton } from '@/components/ui/skeleton'

export default function DriverDashboardPage() {
  const profile = useQuery<DriverProfile | null>({
    queryKey: ['driver', 'me'],
    queryFn: async () => {
      try {
        return await driversApi.me()
      } catch (err) {
        // 404 NOT_A_DRIVER is a normal state for a signed-in passenger, not a failure.
        if (err instanceof ApiError && err.status === 404) return null
        throw err
      }
    },
  })

  if (profile.isLoading) {
    return (
      <div className="grid gap-4">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-64 w-full" />
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
          Your approval status and the vehicles you have registered.
        </p>
      </div>

      {data ? (
        <>
          <DriverStatusCard profile={data} />
          <VehicleCard />
        </>
      ) : (
        <ApplyToDrive />
      )}
    </div>
  )
}
