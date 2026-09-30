import { uuid, text, timestamp, boolean } from "drizzle-orm/pg-core/columns";
import { pgTable } from "drizzle-orm/pg-core/table";
import { users, driverStatusEnum } from "../user/users.schema";

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
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
