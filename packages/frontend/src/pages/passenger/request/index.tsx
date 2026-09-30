import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { locationsApi, rideRequestsApi } from "@/lib/api";
import { rideRequestSchema, type RideRequestInput } from "@/lib/schemas";
import {
  ApiError,
  LIVE_RIDE_REQUEST_STATUSES,
  type Location,
  type RideRequest,
} from "@/lib/types";
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
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

/** Matches MAX_SEATS in the backend vehicles module and MAX_REQUEST_SEATS in validation. */
const SEAT_OPTIONS = [1, 2, 3, 4];

/** How often the submitted list re-checks, in ms. */
const POLL_INTERVAL = 10_000;

/**
 * Pickup, destination and seats for a new ride request, all from real seeded data.
 *
 * Submitting creates a `requested` row and nothing more. There is no fare yet and no
 * driver, by design: a request waits until a driver is online near its pickup, and the
 * fare depends on who else shares the pool. So the success state says "waiting" rather
 * than showing a price, and the list below polls for the status to change.
 */
export default function PassengerRequestPage() {
  const queryClient = useQueryClient();

  const locations = useQuery<Location[]>({
    queryKey: ["locations"],
    queryFn: locationsApi.list,
    // Reference data that only a seed changes, so a page visit should not re-fetch it.
    staleTime: 5 * 60_000,
  });

  /*
   * The submitted requests, polling because a driver accepting a pool is a change on
   * another user's device and there is no socket to push it. Ten seconds is a deliberate
   * compromise: fast enough that a ride does not look stuck, slow enough that a phone
   * left open on this page does not hammer the API.
   */
  const mine = useQuery<RideRequest[]>({
    queryKey: ["ride-requests", "mine"],
    queryFn: rideRequestsApi.mine,
    refetchInterval: POLL_INTERVAL,
  });

  /*
   * Cancelling is a command on a verb, not a delete: the server keeps the row as history.
   *
   * Two-step rather than a dialog, because the project has no dialog primitive and adding
   * @radix-ui/react-dialog for one button is not worth a dependency -- the same reasoning
   * `DeleteAccount` uses for its typed confirmation, one step lighter.
   *
   * `confirmingId` holds the request awaiting a second tap, so exactly one row is ever in
   * the confirm state and the inline buttons replace the cancel button rather than
   * stacking beside it.
   */
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const cancelRequest = useMutation({
    mutationFn: rideRequestsApi.cancel,
    onSuccess: (_cancelled, requestId) => {
      setConfirmingId(null);
      /*
       * The server returns only the status, but the polled list is the source of truth for
       * this page -- the pool it belonged to, the members left behind and their new fares
       * all changed server-side. Invalidating rather than patching in the returned status
       * keeps the row consistent with the rest of the list instead of showing a stale fare
       * next to a cancelled badge.
       */
      queryClient.invalidateQueries({ queryKey: ["ride-requests", "mine"] });
      toast.success("Request cancelled", {
        description: "Your seat is free and you can book another ride.",
      });
      void requestId;
    },
    onError: (error: unknown) => {
      setConfirmingId(null);
      toast.error(
        error instanceof Error ? error.message : "Could not cancel the request",
      );
    },
  });

  const form = useForm<RideRequestInput>({
    resolver: zodResolver(rideRequestSchema),
    defaultValues: {
      pickupLocationId: "",
      destinationLocationId: "",
      seatsRequested: 1,
    },
  });

  const createRequest = useMutation({
    mutationFn: rideRequestsApi.create,
    onSuccess: async (created) => {
      /*
       * Seeded from the mutation response rather than re-fetched, so the new row appears
       * immediately instead of after the next poll. The response is authoritative --
       * it is the row that was actually written.
       */
      queryClient.setQueryData<RideRequest[]>(
        ["ride-requests", "mine"],
        (previous) => [created, ...(previous ?? [])],
      );
      // Matching runs before the API responds, so refetch the row to pick up a fare
      // that was calculated during this request instead of keeping the initial zero.
      await queryClient.invalidateQueries({
        queryKey: ["ride-requests", "mine"],
      });
      form.reset();
      toast.success("Request sent", {
        description: "Waiting for a driver online near your pickup.",
      });
    },
    /*
     * `issues` carries the backend's field-level messages, so a validation failure is
     * shown on the offending field rather than as a toast the passenger has to parse.
     */
    onError: (error: unknown) => {
      if (error instanceof ApiError) {
        for (const issue of error.issues) {
          form.setError(issue.path as keyof RideRequestInput, {
            message: issue.message,
          });
        }
        if (error.issues.length > 0) return;
      }
      toast.error(
        error instanceof Error ? error.message : "Could not send the request",
      );
    },
  });

  const areas = locations.data ?? [];
  const requests = mine.data ?? [];

  /*
   * The one trip, if any, that still counts as in flight. Derived from the same polled
   * list the page renders rather than from a second request, so the banner and the list
   * can never disagree, and it updates on the next poll for free once the driver arrives
   * or the trip completes.
   *
   * The database enforces one live request per passenger; this is the same rule made
   * visible early. Without it the passenger would fill in the whole form, submit, and be
   * told no by a 409.
   */
  const liveRequest = requests.find((request) =>
    LIVE_RIDE_REQUEST_STATUSES.includes(request.status),
  );

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Request</h1>
        <p className="text-muted-foreground text-sm">
          Ask for a ride between two areas.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Where are you going?</CardTitle>
          <CardDescription>
            Pick a pickup, a destination and how many seats you need. Only the{" "}
            {areas.length || ""} seeded areas are offered, so a request never
            needs a map to be valid.
          </CardDescription>
        </CardHeader>

        <CardContent>
          {locations.isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Skeleton className="h-9" />
              <Skeleton className="h-9" />
            </div>
          ) : locations.isError ? (
            <p role="alert" className="text-destructive text-sm">
              Could not load the area list.
            </p>
          ) : areas.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6">
              <p className="text-sm font-medium">No areas available</p>
              <p className="text-muted-foreground mt-1 text-sm">
                The location list is empty. Run{" "}
                <code className="bg-muted rounded px-1 py-0.5 font-mono text-xs">
                  bun run db:seed:locations
                </code>{" "}
                in{" "}
                <code className="bg-muted rounded px-1 py-0.5 font-mono text-xs">
                  packages/backend
                </code>{" "}
                to load the Dhaka areas.
              </p>
            </div>
          ) : (
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit((values) =>
                  createRequest.mutate(values),
                )}
                className="grid gap-4 sm:grid-cols-2"
              >
                <FormField
                  control={form.control}
                  name="pickupLocationId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>From</FormLabel>
                      <FormControl>
                        <Select {...field}>
                          <option value="">Choose an area</option>
                          {areas.map((area) => (
                            <option key={area.id} value={area.id}>
                              {area.name}
                            </option>
                          ))}
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="destinationLocationId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>To</FormLabel>
                      <FormControl>
                        <Select {...field}>
                          <option value="">Choose an area</option>
                          {areas.map((area) => (
                            <option key={area.id} value={area.id}>
                              {area.name}
                            </option>
                          ))}
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="seatsRequested"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Seats</FormLabel>
                      <FormControl>
                        {/*
                          The DOM gives a string, so it is converted here rather than
                          relying on coercion. `valueAsNumber` is not an option: the empty
                          string would become NaN, and `NaN` fails zod's integer check
                          with a message about numbers rather than about seats.
                        */}
                        <Select
                          value={String(field.value)}
                          onChange={(event) =>
                            field.onChange(Number(event.target.value))
                          }
                        >
                          {SEAT_OPTIONS.map((seats) => (
                            <option key={seats} value={seats}>
                              {seats}
                            </option>
                          ))}
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid gap-2 sm:col-span-2">
                  <Button
                    type="submit"
                    disabled={
                      createRequest.isPending || liveRequest !== undefined
                    }
                    className="justify-self-start"
                  >
                    {createRequest.isPending
                      ? "Sending..."
                      : liveRequest
                        ? "One ride at a time"
                        : "Request a ride"}
                  </Button>
                  {liveRequest ? (
                    <p className="text-muted-foreground text-sm">
                      {REQUEST_STATUS_LABELS[liveRequest.status]} from{" "}
                      {liveRequest.pickupName ?? "your pickup"} to{" "}
                      {liveRequest.destinationName ?? "your destination"}. You
                      can book another ride once this one finishes. It is
                      tracked in{" "}
                      <span className="font-medium">Your requests</span> below.
                    </p>
                  ) : (
                    <p className="text-muted-foreground text-sm">
                      Sending this creates a request that waits for a driver
                      online near your pickup. The fare appears once you are
                      matched into a pool, because it depends on who else is
                      sharing the ride.
                    </p>
                  )}
                </div>
              </form>
            </Form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your requests</CardTitle>
          <CardDescription>
            Newest first. Refreshes every {POLL_INTERVAL / 1000} seconds so a
            driver accepting does not need a manual reload.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {mine.isLoading ? (
            <div className="grid gap-2">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          ) : mine.isError ? (
            <p role="alert" className="text-destructive text-sm">
              Could not load your requests.
            </p>
          ) : requests.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nothing yet. A request you send will appear here.
            </p>
          ) : (
            <ul className="grid gap-2">
              {requests.map((request) => (
                <li
                  key={request.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
                >
                  <div className="grid">
                    <span className="text-sm font-medium">
                      {request.pickupName ?? "Unknown"} to{" "}
                      {request.destinationName ?? "Unknown"}
                    </span>
                    <span className="text-muted-foreground text-sm">
                      {request.seatsRequested}{" "}
                      {request.seatsRequested === 1 ? "seat" : "seats"}
                    </span>
                  </div>
                  <div className="flex flex-col items-end gap-1 text-right">
                    <span className="text-sm font-medium">
                      {REQUEST_STATUS_LABELS[request.status]}
                    </span>
                    {/*
                      Only priced once matched. A fare of 0 on a `requested` row is
                      "not calculated yet", so it is shown as such instead of as a price.
                      A cancelled request keeps the fare it was quoted, which is why it is
                      still rendered -- it is a record of what the trip would have cost.
                    */}
                    <span className="text-muted-foreground block text-sm">
                      {request.fareAmount > 0
                        ? formatPoisha(request.fareAmount)
                        : "Fare pending"}
                    </span>
                    {/*
                      Offered only while the server would accept it. `in_progress` is
                      absent because the car has moved: the passenger is in it and the
                      driver owns what happens next, so the server answers 409 and there is
                      nothing useful for this button to do.
                    */}
                    {request.status === "requested" ||
                    request.status === "matched" ? (
                      confirmingId === request.id ? (
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            disabled={cancelRequest.isPending}
                            onClick={() => cancelRequest.mutate(request.id)}
                          >
                            Confirm
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={cancelRequest.isPending}
                            onClick={() => setConfirmingId(null)}
                          >
                            Keep
                          </Button>
                        </div>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={cancelRequest.isPending}
                          onClick={() => setConfirmingId(request.id)}
                        >
                          Cancel request
                        </Button>
                      )
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** Poisha to a readable amount. 100 poisha is ৳1. */
function formatPoisha(amount: number): string {
  return `৳${(amount / 100).toFixed(2)}`;
}

const REQUEST_STATUS_LABELS: Record<RideRequest["status"], string> = {
  requested: "Waiting for a driver",
  matched: "Driver found",
  in_progress: "On the way",
  completed: "Completed",
  cancelled: "Cancelled",
};
