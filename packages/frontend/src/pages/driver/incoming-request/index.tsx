import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { rideRequestsApi } from '@/lib/api'
import {
  ApiError,
  POOL_ACTION_LABELS,
  POOL_STATUS_LABELS,
  type CurrentTrip,
  type DriverFeed,
  type PoolOffer,
  type PoolStatus,
} from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

/** Poll interval while the driver has this page open, in ms. */
const POLL_INTERVAL = 10_000

/**
 * The driver's work: pools waiting to be answered, plus the trip already under way.
 *
 * Both come from one endpoint because the two are mutually exclusive in practice -- a
 * driver mid-trip should not be shown offers -- and splitting them would leave the UI to
 * enforce a rule the server already knows.
 *
 * Polling, not a socket: accepting a pool and passengers joining are changes made by
 * other people, and there is no push channel in this app. Ten seconds is the compromise
 * between a feed that does not look stuck and a phone that is not left hammering the API.
 */
export default function DriverRequestsPage() {
  const queryClient = useQueryClient()

  const feed = useQuery<DriverFeed>({
    queryKey: ['driver', 'feed'],
    queryFn: rideRequestsApi.driverFeed,
    refetchInterval: POLL_INTERVAL,
  })

  /*
   * One action button per pool, whose verb comes from the pool's current status. The
   * server rejects an action that is not legal from that status, so deriving the button
   * here is what keeps the two in step.
   */
  const act = useMutation({
    mutationFn: ({ poolId, action }: { poolId: string; action: string }) =>
      rideRequestsApi.poolAction(poolId, action as never),
    onSuccess: (_result, variables) => {
      // Both halves change on every transition: the offer leaves the list, the current
      // trip advances, and its passengers' own views are updated server-side.
      void queryClient.invalidateQueries({ queryKey: ['driver', 'feed'] })
      toast.success(`Trip ${variables.action}ed`)
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not update the trip')
      void queryClient.invalidateQueries({ queryKey: ['driver', 'feed'] })
    },
  })

  if (feed.isLoading) {
    return (
      <div className="grid gap-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    )
  }

  if (feed.isError) {
    return (
      <div className="grid gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Incoming requests</h1>
        </div>
        <p role="alert" className="text-destructive text-sm">
          Could not load your work right now.
        </p>
      </div>
    )
  }

  const offers = feed.data?.offers ?? []
  const trip = feed.data?.currentTrip ?? null
  const showOffers = offers.length > 0

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Incoming requests</h1>
        <p className="text-muted-foreground text-sm">
          Requests near your current area, and the trip you are driving.
        </p>
      </div>

      {/*
        The current trip is rendered first because it is the only thing that needs
        action right now, and an offer list above a running trip would read as though both
        were available.
      */}
      {trip && <CurrentTripCard trip={trip} act={act} />}
      {!trip && <EmptyState />}

      {showOffers && (
        <div className="grid gap-3">
          <h2 className="text-lg font-medium">
            Waiting for you ({offers.length})
          </h2>
          <ul className="grid gap-3">
            {offers.map((offer) => (
              <OfferRow
                key={offer.id}
                offer={offer}
                pending={act.isPending && act.variables?.poolId === offer.id}
                onAct={(action) => act.mutate({ poolId: offer.id, action })}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function OfferRow({
  offer,
  pending,
  onAct,
}: {
  offer: PoolOffer
  pending: boolean
  onAct: (action: string) => void
}) {
  const next = POOL_ACTION_LABELS[offer.status]

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
      <div className="grid gap-1">
        <span className="font-medium">
          {offer.pickupName ?? 'Unknown'} to {offer.destinationName ?? 'Unknown'}
        </span>
        <span className="text-muted-foreground text-sm">
          {offer.distanceKm} km away · {offer.passengerCount}{' '}
          {offer.passengerCount === 1 ? 'passenger' : 'passengers'} ·{' '}
          {offer.currentAvailableSeats} seats left
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant="secondary">{POOL_STATUS_LABELS[offer.status]}</Badge>
        {next && (
          <Button size="sm" disabled={pending} onClick={() => onAct(next.action)}>
            {pending ? 'Working…' : next.label}
          </Button>
        )}
      </div>
    </li>
  )
}

function CurrentTripCard({
  trip,
  act,
}: {
  trip: CurrentTrip
  act: { mutate: (v: { poolId: string; action: string }) => void; isPending: boolean }
}) {
  const next = POOL_ACTION_LABELS[trip.status as PoolStatus]

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>Your current trip</CardTitle>
          <Badge>{POOL_STATUS_LABELS[trip.status as PoolStatus] ?? trip.status}</Badge>
        </div>
        <CardDescription>
          {trip.pickupName ?? 'Unknown'} to {trip.destinationName ?? 'Unknown'} ·{' '}
          {trip.passengers} {trip.passengers === 1 ? 'passenger' : 'passengers'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {next ? (
          <Button
            disabled={act.isPending}
            onClick={() => act.mutate({ poolId: trip.id, action: next.action })}
          >
            {act.isPending ? 'Working…' : next.label}
          </Button>
        ) : (
          <p className="text-muted-foreground text-sm">This trip is finished.</p>
        )}
      </CardContent>
    </Card>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-start gap-4 rounded-lg border border-dashed p-8">
      <div className="grid gap-1">
        <h2 className="text-lg font-semibold">No trips right now</h2>
        <p className="text-muted-foreground text-sm">
          Go online and choose your current area. Requests that pick up within 3 km of it
          will appear here.
        </p>
      </div>
    </div>
  )
}
