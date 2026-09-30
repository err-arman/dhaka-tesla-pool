// Maps URLs for ride requests.
//
// `authenticate` but no driver guard, unlike `/vehicles`. Every role submits requests,
// and the driver is whoever performs them later -- not the submitter.
//
// `GET /mine` is declared before any future `GET /:id`, because Express matches in
// order and `/mine` would otherwise be swallowed by an `:id` param and fail UUID
// validation. Keeping the literal route above the parametrised one avoids that silently
// becoming a 422 on a valid history request.
import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate';
import { rideRequestsController } from './ride-requests.controller';

export const rideRequestsRouter = Router();

rideRequestsRouter.use(authenticate);

/*
 * `/mine` and `/driver/feed` are literal paths declared before the `/:poolId/:action`
 * pattern below. Express matches in registration order, so a parametrised route declared
 * first would swallow `/mine` as a `poolId` and fail uuid validation with a confusing 422
 * on a perfectly valid request.
 */
rideRequestsRouter.get('/mine', rideRequestsController.listMine);
rideRequestsRouter.get('/driver/feed', rideRequestsController.driverFeed);

/*
 * The driver's next step. `post` rather than `patch` because these are commands, not
 * partial updates: there is no body, and the same call twice is caught by the state
 * machine's from-state guard rather than being an idempotent retry.
 */
rideRequestsRouter.post('/pools/:poolId/:action', rideRequestsController.poolAction);

/*
 * The passenger cancelling their own booking. No driver guard, and none should be added:
 * this belongs to whoever submitted the request, which `ride.cancel.ts` checks against
 * the token rather than against a role. Declared after the pool route because `pools` is
 * a literal segment and cannot collide with a `:requestId`.
 */
rideRequestsRouter.post('/:requestId/cancel', rideRequestsController.cancel);

rideRequestsRouter.post('/', rideRequestsController.create);
