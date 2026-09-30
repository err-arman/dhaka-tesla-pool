import { VehicleCard } from '@/components/vehicle-card'

export default function DriverVehiclePage() {
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Vehicle</h1>
        <p className="text-muted-foreground text-sm">
          A driver can register one vehicle. Removing it frees the slot for a new one.
        </p>
      </div>

      <VehicleCard />
    </div>
  )
}
