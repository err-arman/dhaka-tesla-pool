import { AppError } from '../../common/errors/app-error';
import { uniqueConstraintName } from '../../common/errors/db-errors';
import type { DbExecutor } from '../../db';
import { rideRequestsRepository } from './ride-requests.repository';
import { runMatching } from './ride.matching';
import { currentTripForDriver, feedForDriver } from './ride.driver';
import { cancelRequest } from './ride.cancel';
import type { CreateRideRequestInput } from './ride-requests.validation';

/**
 * Turns a submission into a waiting request.
 *
 * This method deliberately does no matching and no pricing. Both need an open pool, and
 * a request may sit here for a long time: with the rule that a driver must be online
 * first, a request submitted at 6am stays `REQUESTED` until someone goes online near its
 * pickup. Deciding the fare here would mean either guessing or re-pricing later, so the
 * row lands with `fare_amount` 0 and is priced by the matching engine when it attaches to
 * a pool. The passenger is not charged, or quoted, a price at submission.
 */
export const rideRequestsService = {
  async create(passengerId: string, input: CreateRideRequestInput, ex?: DbExecutor) {
    /*
     * Checked up front so an unknown area id produces a 422 naming the field, instead of
     * the foreign key rejecting the insert and surfacing as a 500. Both ids are looked up
     * in one query because the check is "does this pair of areas exist", not "does this
     * area exist" twice.
     */
    const wanted = [input.pickupLocationId, input.destinationLocationId];
    const existing = await rideRequestsRepository.existingLocationIds(wanted, ex);

    for (const id of wanted) {
      if (!existing.includes(id)) {
        throw new AppError(422, 'Unknown area', 'LOCATION_NOT_FOUND');
      }
    }

    /*
     * One live trip per passenger.
     *
     * Checked here so a second submission gets an explanation instead of a raw
     * `duplicate key value` from the unique index. The read is unavoidable and the index
     * is unavoidable, and neither alone is sufficient: without the index, two taps in the
     * same second both pass this check; without the check, the loser of that race gets a
     * 500. So the check is the courtesy and the index is the rule, and the catch below
     * covers the window between the two.
     */
    const live = await rideRequestsRepository.findLiveByPassenger(passengerId, ex);
    if (live) {
      throw new AppError(
        409,
        'You already have a ride in progress. Finish or cancel it before booking another.',
        'RIDE_ALREADY_IN_PROGRESS',
      );
    }

    /*
     * Both a passenger and a driver are legitimate users of the token here, so nothing
     * rejects a driver from requesting a ride. That is not a mistake: role exclusivity is
     * a UI routing decision in this app, and the alternative -- a guard that reads
     * `users.role` -- would reject the one admin who also holds an approved driver
     * profile, which is data that legitimately exists in this database. The rule that a
     * rider must be someone other than the driver is enforced where it actually matters,
     * when the pool is accepted.
     */
    let row: Awaited<ReturnType<typeof rideRequestsRepository.create>>;
    try {
      row = await rideRequestsRepository.create(
        {
          passengerId,
          pickupLocationId: input.pickupLocationId,
          destinationLocationId: input.destinationLocationId,
          seatsRequested: input.seatsRequested,
        },
        ex,
      );
    } catch (err) {
      /*
       * The lost half of the race described above: another submission for this passenger
       * committed between the check and the insert, so the index rejected this one. Same
       * rule, same answer as the check produced -- the caller cannot tell the two apart
       * and should not have to.
       */
      if (uniqueConstraintName(err) === 'ride_requests_one_live_per_passenger') {
        throw new AppError(
          409,
          'You already have a ride in progress. Finish or cancel it before booking another.',
          'RIDE_ALREADY_IN_PROGRESS',
        );
      }
      throw err;
    }

    if (!row) throw new AppError(500, 'Could not create the request', 'CREATE_FAILED');

    const areas = await rideRequestsRepository.findAreaNames(wanted, ex);
    const nameById = new Map(areas.map((a) => [a.id, a.name]));

    const response = {
      ...row,
      pickupName: nameById.get(row.pickupLocationId) ?? null,
      destinationName: nameById.get(row.destinationLocationId) ?? null,
    };

    /*
     * Matching runs after the insert, joined to `ex` when there is one.
     *
     * With no executor this is a separate connection and a separate transaction, which is
     * what production wants: a match can only see a `requested` row that is already
     * committed. Given an executor, it joins the caller's transaction instead, so a caller
     * that wants the insert and the match to commit or roll back together gets that.
     *
     * A failure here is logged rather than propagated. The passenger's request is already
     * saved and correct; matching is a separate concern that will be retried by the next
     * trigger (another request, or a driver coming online). Letting the error escape would
     * turn a saved request into a 500 and a retry into a duplicate.
     */
    try {
      const summary = await runMatching(ex);
      if (summary.considered > 0) console.log('[matching] after new request', summary);
    } catch (err) {
      console.error('[matching] failed after new request', err);
    }

    return response;
  },

  /**
   * This passenger's own history. Every row is scoped by the token's user id, which is
   * why the repository query takes no id from the caller: there is no code path here that
   * can be asked for someone else's trips.
   */
  /**
   * Cancels one of this passenger's own requests.
   *
   * The policy -- who may cancel, when, and what happens to the pool and the other
   * passengers -- lives in `ride.cancel.ts`. All this does is name the passenger, from the
   * token, so the service can never be asked to cancel somebody else's request by passing
   * a different id.
   */
  async cancel(passengerId: string, requestId: string) {
    await cancelRequest(passengerId, requestId);
    return { id: requestId, status: 'cancelled' as const };
  },

  async listMine(passengerId: string) {
    return rideRequestsRepository.findMine(passengerId);
  },

  /**
   * What this driver is being offered, plus the trip they are already driving.
   *
   * Returned as one object rather than two endpoints because the driver's home screen
   * needs both at once, and a driver who is mid-trip must not be shown offers they cannot
   * take. Splitting them would mean the UI rendering an offer list beside a running trip
   * and relying on the driver to notice that the two are incompatible.
   */
  async driverFeed(driverUserId: string) {
    const [offers, currentTrip] = await Promise.all([
      feedForDriver(driverUserId),
      currentTripForDriver(driverUserId),
    ]);

    return { offers, currentTrip };
  },
};
