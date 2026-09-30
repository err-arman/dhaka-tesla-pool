import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { vehiclesApi } from "@/lib/api";
import { isNotFoundError, retryTransientError } from "@/lib/query";
import { ApiError, type Vehicle } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The dashboard's read-only view of the driver's vehicle. Shares the `['vehicle']`
 * query key with VehicleCard, so the dashboard and the vehicle page render from one
 * cache entry and registering a vehicle on either updates both.
 */
export function DriverVehicleSummary() {
  const vehicle = useQuery<Vehicle>({
    queryKey: ["vehicle"],
    queryFn: vehiclesApi.get,
    retry: retryTransientError,
  });

  const notRegistered = vehicle.isError && isNotFoundError(vehicle.error);

  const registered =
    !vehicle.isLoading && !notRegistered && !vehicle.isError
      ? vehicle.data
      : null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>Vehicle</CardTitle>
          {registered && (
            <Badge variant={registered.isActive ? "default" : "secondary"}>
              {registered.isActive ? "Active" : "Removed"}
            </Badge>
          )}
        </div>
        <CardDescription>
          {notRegistered
            ? "You have no vehicle yet, so you cannot go online."
            : "You can register one vehicle, with up to 4 seats."}
        </CardDescription>
      </CardHeader>

      <CardContent>
        {vehicle.isLoading ? (
          <Skeleton className="h-6 w-40" />
        ) : registered ? (
          <p className="text-sm">
            <span className="font-medium">
              {registered.seats} {registered.seats === 1 ? "seat" : "seats"}
            </span>{" "}
            <span className="text-muted-foreground">registered</span>
          </p>
        ) : notRegistered ? (
          <p className="text-sm font-medium">No vehicle registered</p>
        ) : (
          <p role="alert" className="text-destructive text-sm">
            {vehicle.error instanceof ApiError && vehicle.error.status === 403
              ? "Your driver account is not approved yet."
              : "Could not load your vehicle."}
          </p>
        )}
      </CardContent>

      <CardFooter>
        <Button variant="outline" size="sm" asChild>
          <Link to="/driver/vechile">
            {notRegistered ? "Register vehicle" : "Manage vehicle"}
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
