import { VehicleCard } from '@/components/vehicle-card'

export default function DriverVehiclesPage() {
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Your vehicle</h1>
        <p className="text-muted-foreground text-sm">
          Register the vehicle you drive on this pool.
        </p>
      </div>

      <VehicleCard />
    </div>
  )
}
