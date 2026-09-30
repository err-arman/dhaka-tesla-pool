ALTER TABLE "driver_profiles" ADD COLUMN "current_zone_id" uuid;--> statement-breakpoint
-- Dropped before the `status` column is retyped, not after.
--
-- drizzle-kit emits this index *after* the type change, which fails: the predicate
-- `status in ('matched_accepted', ...)` is type-checked the moment the column becomes
-- text, and `text = pool_status` has no operator, so the migration aborts with
-- "operator does not exist". Plain indexes on the column are fine -- Postgres rebuilds
-- those itself -- but a partial index carries an expression that references the column's
-- type. So the only index that must go first is the one with a predicate.
DROP INDEX "pools_one_open_per_vehicle";--> statement-breakpoint
ALTER TABLE "pools" ADD COLUMN "pickup_location_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "pools" ADD COLUMN "destination_location_id" uuid NOT NULL;--> statement-breakpoint
-- The default is dropped before the retype so Postgres is not asked to carry an enum-typed
-- default across the change; it is reattached as `matched` once the new type exists.
ALTER TABLE "pools" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "pools" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "pool_status";--> statement-breakpoint
CREATE TYPE "pool_status" AS ENUM('matched', 'accepted', 'driver_arrived', 'started', 'completed', 'cancelled');--> statement-breakpoint
ALTER TABLE "pools" ALTER COLUMN "status" SET DATA TYPE "pool_status" USING "status"::"pool_status";--> statement-breakpoint
ALTER TABLE "pools" ALTER COLUMN "status" SET DEFAULT 'matched'::"pool_status";--> statement-breakpoint
CREATE UNIQUE INDEX "pools_one_open_per_vehicle" ON "pools" ("vehicle_id") WHERE "status" in ('matched', 'accepted', 'driver_arrived', 'started');--> statement-breakpoint
CREATE INDEX "pools_pickup_location_idx" ON "pools" ("pickup_location_id");--> statement-breakpoint
ALTER TABLE "driver_profiles" ADD CONSTRAINT "driver_profiles_current_zone_id_locations_id_fkey" FOREIGN KEY ("current_zone_id") REFERENCES "locations"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "pools" ADD CONSTRAINT "pools_pickup_location_id_locations_id_fkey" FOREIGN KEY ("pickup_location_id") REFERENCES "locations"("id");--> statement-breakpoint
ALTER TABLE "pools" ADD CONSTRAINT "pools_destination_location_id_locations_id_fkey" FOREIGN KEY ("destination_location_id") REFERENCES "locations"("id");--> statement-breakpoint
ALTER TABLE "pools" ADD CONSTRAINT "pools_pickup_differs_from_destination" CHECK ("pickup_location_id" <> "destination_location_id");
