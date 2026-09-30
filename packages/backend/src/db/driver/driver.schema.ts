import { uuid, text, timestamp, boolean } from "drizzle-orm/pg-core/columns";
import { pgTable } from "drizzle-orm/pg-core/table";
import { users, driverStatusEnum } from "../user/users.schema";
import { locations } from "../locations/locations.schema";

export const driverProfiles = pgTable('driver_profiles', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  status: driverStatusEnum('status').notNull().default('approved'),
  /*
   * Whether the driver is taking passengers right now. Deliberately separate from
   * `status`, which an admin controls: approval is "may this person drive", this is
   * "are they working at the moment". Also separate from `users.is_active` (the
   * account) and `vehicles.is_active` (a soft-deleted vehicle).
   *
   * Defaults to false so a newly approved driver is not dispatchable until they say
   * so. The service refuses to go online without an active vehicle.
   */
  isOnline: boolean('is_online').notNull().default(false),
  /*
   * Where the driver is working right now, as one of the curated `locations`. A pool is
   * only offered to a driver whose current zone is within the join distance of the
   * pool's pickup anchor, so this is what makes the driver's feed geographic.
   *
   * Nullable because a driver can be approved, hold a vehicle, and still not have said
   * where they are. Going online sets it; going offline clears it, so a stale zone
   * cannot keep a driver in the feed after they stop.
   */
  currentZoneId: uuid('current_zone_id').references(() => locations.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
