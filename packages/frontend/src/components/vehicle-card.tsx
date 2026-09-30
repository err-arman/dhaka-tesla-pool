import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { vehiclesApi } from "@/lib/api";
import { isNotFoundError, retryTransientError } from "@/lib/query";
import {
  vehiclePayload,
  vehicleSchema,
  vehicleSchemaRequired,
  type VehicleInput,
} from "@/lib/schemas";
import { ApiError, type Vehicle } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * A driver has at most one active vehicle, so this card is always singular.
 */
export function VehicleCard() {
  const queryClient = useQueryClient();

  const vehicle = useQuery<Vehicle>({
    queryKey: ["vehicle"],
    queryFn: vehiclesApi.get,
    retry: retryTransientError,
  });

  const remove = useMutation({
    mutationFn: vehiclesApi.remove,
    onSuccess: () => {
      toast.success("Vehicle removed");
      queryClient.invalidateQueries({ queryKey: ["vehicle"] });
    },
    onError: (err) => {
      toast.error(
        err instanceof ApiError ? err.message : "Could not remove the vehicle",
      );
    },
  });

  const notRegistered = vehicle.isError && isNotFoundError(vehicle.error);

  // isError is false while loading and when data is present, so this is the one
  // branch where the type is guaranteed to be a Vehicle.
  const registered =
    !vehicle.isLoading && !notRegistered && !vehicle.isError
      ? vehicle.data
      : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your vehicle</CardTitle>
        <CardDescription>
          You can register one vehicle with up to 4 seats. Removing it lets you
          register a new one later.
        </CardDescription>
      </CardHeader>

      <CardContent className="grid gap-6">
        {vehicle.isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : notRegistered ? (
          <VehicleForm
            mode="create"
            submitLabel="Register vehicle"
            onDone={() =>
              queryClient.invalidateQueries({ queryKey: ["vehicle"] })
            }
          />
        ) : registered ? (
          <RegisteredVehicle
            vehicle={registered}
            onRemoved={() => remove.mutate()}
            removing={remove.isPending}
          />
        ) : (
          <p role="alert" className="text-destructive text-sm">
            {vehicle.error instanceof ApiError && vehicle.error.status === 403
              ? "Your driver account is not approved yet, so vehicles are unavailable."
              : "Could not load your vehicle."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function RegisteredVehicle({
  vehicle,
  onRemoved,
  removing,
}: {
  vehicle: Vehicle;
  onRemoved: () => void;
  removing: boolean;
}) {
  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium">
          {vehicle.seats} {vehicle.seats === 1 ? "seat" : "seats"}
        </span>
        <Badge variant={vehicle.isActive ? "default" : "secondary"}>
          {vehicle.isActive ? "Active" : "Inactive"}
        </Badge>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          disabled={!vehicle.isActive || removing}
          onClick={onRemoved}
        >
          Remove
        </Button>
      </div>

      <VehicleForm
        mode="edit"
        submitLabel="Update seats"
        defaultSeats={String(vehicle.seats)}
        onDone={() => undefined}
        resetOnSuccess
      />
    </div>
  );
}

function VehicleForm({
  mode,
  submitLabel,
  defaultSeats = "",
  resetOnSuccess = false,
  onDone,
}: {
  /** `create` upserts with PUT, `edit` sends PATCH, which 404s if the row is gone. */
  mode: "create" | "edit";
  submitLabel: string;
  defaultSeats?: string;
  resetOnSuccess?: boolean;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();

  const form = useForm<VehicleInput>({
    resolver: zodResolver(
      mode === "edit" ? vehicleSchemaRequired : vehicleSchema,
    ),
    defaultValues: { seats: defaultSeats },
  });

  const save = useMutation({
    mutationFn: (values: VehicleInput) =>
      mode === "edit"
        ? // The required schema guarantees a value, so this is never an empty body.
          vehiclesApi.patch({ seats: Number(values.seats) })
        : vehiclesApi.put(vehiclePayload(values)),
    onSuccess: () => {
      toast.success(mode === "edit" ? "Seats updated" : "Vehicle registered");
      queryClient.invalidateQueries({ queryKey: ["vehicle"] });
      if (resetOnSuccess) form.reset({ seats: "" });
      onDone();
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        // Point at the field when the backend reported a seats problem.
        const seats = err.issues.find((i) => i.path === "seats");
        if (seats) {
          form.setError("seats", { message: seats.message });
          return;
        }
        toast.error(err.message);
        return;
      }
      toast.error("Could not save the vehicle");
    },
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => save.mutate(values))}
        className="flex items-end gap-3"
      >
        <FormField
          control={form.control}
          name="seats"
          render={({ field }) => (
            <FormItem className="w-32">
              <FormLabel>Seats</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min={1}
                  max={4}
                  step={1}
                  placeholder="2"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? "Saving…" : submitLabel}
        </Button>
      </form>
    </Form>
  );
}
