import { uuid, text, integer, boolean } from "drizzle-orm/pg-core/columns";
import { pgTable } from "drizzle-orm/pg-core/table";
import { driverProfiles } from "../driver/driver.schema";

// 6. Vehicles (a driver may own more than one)
export const vehicles = pgTable("vehicles", {
  id: uuid("id").primaryKey().defaultRandom(),
  driverId: uuid("driver_id")
    .notNull()
    .references(() => driverProfiles.userId, { onDelete: "cascade" }),
  seats: integer("seats").notNull().default(2),
  isActive: boolean("is_active").notNull().default(true),
});
