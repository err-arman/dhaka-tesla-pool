/**
 * Placeholder. Ride requests need a backend to send, dispatch and track them, and
 * nothing exists yet, so this states that rather than rendering invented rows.
 */
export default function PassengerRequestPage() {
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Request</h1>
        <p className="text-muted-foreground text-sm">Ask for a ride.</p>
      </div>

      <div className="flex flex-col items-start gap-4 rounded-lg border border-dashed p-8">
        <div className="grid gap-1">
          <h2 className="text-lg font-semibold">Nothing here yet</h2>
          <p className="text-muted-foreground text-sm">
            Requesting a ride is not built. Rides, fares and payments are all still to
            come, so there is no endpoint to send a request to and nothing for a driver to
            accept yet.
          </p>
        </div>
      </div>
    </div>
  )
}
