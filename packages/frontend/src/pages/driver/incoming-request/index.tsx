/**
 * Placeholder. Ride requests need a backend to list, accept and reject them, and
 * nothing exists yet, so this states that rather than rendering invented rows.
 */
export default function DriverRequestsPage() {
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Incoming requests</h1>
        <p className="text-muted-foreground text-sm">Ride requests from passengers.</p>
      </div>

      <div className="flex flex-col items-start gap-4 rounded-lg border border-dashed p-8">
        <div className="grid gap-1">
          <h2 className="text-lg font-semibold">Nothing here yet</h2>
          <p className="text-muted-foreground text-sm">
            Request dispatch is not built. Rides, fares and payments are all still to
            come, so there is no endpoint to list requests from and nothing to accept or
            reject.
          </p>
        </div>
      </div>
    </div>
  )
}
