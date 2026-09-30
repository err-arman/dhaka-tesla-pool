import { uuid, integer, boolean } from "drizzle-orm/pg-core/columns";
import { pgTable } from "drizzle-orm/pg-core/table";
import { sql } from "drizzle-orm";
import { uniqueIndex } from "drizzle-orm/pg-core";
import { driverProfiles } from "../driver/driver.schema";

// 6. Vehicles. A driver has at most one *active* vehicle.
//
// The unique index is partial (`WHERE is_active`), so a driver who removes their
// vehicle keeps the deactivated row for history and may later register a new one.
// The service layer exposes this as a singleton resource: there are no :id routes.
export const vehicles = pgTable(
  "vehicles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    driverId: uuid("driver_id")
      .notNull()
      .references(() => driverProfiles.userId, { onDelete: "cascade" }),
    seats: integer("seats").notNull().default(2),
    isActive: boolean("is_active").notNull().default(true),
  },
  (t) => [
    // One active vehicle per driver. Partial, so inactive history rows are exempt.
    uniqueIndex("vehicles_one_active_per_driver")
      .on(t.driverId)
      .where(sql`${t.isActive}`),
  ],
);
