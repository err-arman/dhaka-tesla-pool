// HTTP layer for /ride-requests.
//
// Validation is `schema.parse(req.body)` directly, not a helper, matching the vehicles
// and drivers controllers: a ZodError thrown here is turned into a 422 by the same global
// error handler that already handles bad vehicle input, so wrapping it would only add a
// second way to fail.
import type { Request, Response } from 'express';
import { requireUser } from '../../common/middleware/authenticate';
import { AppError } from '../../common/errors/app-error';
import { rideRequestsService } from './ride-requests.service';
import {
  createRideRequestSchema,
  poolParamsSchema,
  requestParamsSchema,
} from './ride-requests.validation';
import { actOnPool } from './ride.driver';
import type { DriverPoolAction } from './ride.pool';

export const rideRequestsController = {
  /**
   * POST /ride-requests -- submit a request.
   *
   * 201 because the request row exists, not because the ride is on its way. At this point
   * nobody has been matched to it and there is no fare, and a 201 whose body says so is
   * more honest than a 200 that looks like a booking.
   */
  async create(req: Request, res: Response) {
    const { id } = requireUser(req);
    const input = createRideRequestSchema.parse(req.body ?? {});
    res.status(201).json(await rideRequestsService.create(id, input));
  },

  /**
   * GET /ride-requests/mine -- this passenger's trips.
   *
   * Scoped from the token, never from a query parameter, so one rider cannot read
   * another's trips or fares by editing the URL.
   */
  async listMine(req: Request, res: Response) {
    const { id } = requireUser(req);
    res.json(await rideRequestsService.listMine(id));
  },

  /**
   * GET /ride-requests/driver/feed -- offers plus this driver's current trip.
   *
   * No role guard on the route itself: `feedForDriver` answers an empty feed for a user
   * who is not a driver rather than 403. The portal already keeps passengers out of
   * `/driver`, and a 403 here would only add a failure mode to a page nobody reaches.
   */
  /**
   * POST /ride-requests/:requestId/cancel -- the passenger drops their own booking.
   *
   * A `POST` to a verb rather than `DELETE /ride-requests/:id`: nothing is deleted. The
   * row stays as `cancelled` history and keeps its `pool_id`, so a DELETE would promise
   * something this endpoint does not do, and a retry after a timeout the client never saw
   * the answer to would look like a second deletion.
   *
   * 200 with the new status rather than 204, so a client that missed the response can
   * confirm what happened without re-fetching the list.
   */
  async cancel(req: Request, res: Response) {
    const { id } = requireUser(req);
    const { requestId } = requestParamsSchema.parse(req.params);
    res.json(await rideRequestsService.cancel(id, requestId));
  },

  async driverFeed(req: Request, res: Response) {
    const { id } = requireUser(req);
    res.json(await rideRequestsService.driverFeed(id));
  },

  /**
   * POST /ride-requests/pools/:poolId/:action -- the driver's next step.
   *
   * One handler for all four actions instead of four near-identical routes. The action
   * comes from the URL but is NOT trusted: it is checked against `DRIVER_ACTIONS` before
   * it reaches the state machine, so an unknown verb is a 404 rather than a lookup of
   * `TRANSITIONS[undefined]` that would silently behave like `accept`.
   */
  async poolAction(req: Request, res: Response) {
    const { id } = requireUser(req);
    const { poolId } = poolParamsSchema.parse(req.params);

    /*
     * `req.params.action` is typed `string | string[]` because Express types a repeated
     * param that way, and it only ever is a string here -- a repeated `:action` in the
     * path would make it an array, and that route does not exist. Narrowed explicitly so
     * the array case is rejected as an unknown action rather than stringified.
     */
    const raw = req.params.action;
    const action = Array.isArray(raw) ? undefined : raw;
    if (!action || !(DRIVER_ACTIONS as readonly string[]).includes(action)) {
      throw new AppError(404, 'Unknown pool action', 'NOT_FOUND');
    }

    res.json(await actOnPool(id, poolId, action as DriverPoolAction));
  },
};

/** The verbs the pool state machine knows. Mirrors DriverPoolAction. */
const DRIVER_ACTIONS = ['accept', 'arrive', 'start', 'complete'] as const;
