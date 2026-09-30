CREATE TYPE "pool_status" AS ENUM('matched_accepted', 'driver_arrived', 'started', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "ride_request_status" AS ENUM('requested', 'matched', 'in_progress', 'completed', 'cancelled');--> statement-breakpoint
CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	CONSTRAINT "locations_lat_range" CHECK ("lat" between -90 and 90),
	CONSTRAINT "locations_lng_range" CHECK ("lng" between -180 and 180)
);
--> statement-breakpoint
CREATE TABLE "pools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"vehicle_id" uuid NOT NULL,
	"status" "pool_status" DEFAULT 'matched_accepted'::"pool_status" NOT NULL,
	"current_available_seats" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pools_seats_not_negative" CHECK ("current_available_seats" >= 0)
);
--> statement-breakpoint
CREATE TABLE "ride_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"passenger_id" uuid NOT NULL,
	"pool_id" uuid,
	"pickup_location_id" uuid NOT NULL,
	"destination_location_id" uuid NOT NULL,
	"seats_requested" integer DEFAULT 1 NOT NULL,
	"status" "ride_request_status" DEFAULT 'requested'::"ride_request_status" NOT NULL,
	"fare_amount" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ride_requests_seats_positive" CHECK ("seats_requested" >= 1),
	CONSTRAINT "ride_requests_fare_not_negative" CHECK ("fare_amount" >= 0),
	CONSTRAINT "ride_requests_pickup_differs_from_destination" CHECK ("pickup_location_id" <> "destination_location_id"),
	CONSTRAINT "ride_requests_requested_has_no_pool" CHECK ("status" <> 'requested' or "pool_id" is null)
);
--> statement-breakpoint
-- NOTE: drizzle-kit also emitted `DROP TABLE "user_roles"` and
-- `ALTER TABLE "users" ADD COLUMN "role"` here, because 20260930160000_single_role_per_user
-- was applied by hand and left no snapshot.json for the diff chain to start from. Both
-- statements are already true of the database, and re-running either one errors, so they
-- have been removed. The snapshot in this folder is the post-single-role state, which
-- fixes the chain for every migration generated after it.
CREATE UNIQUE INDEX "locations_name_unique" ON "locations" ("name");--> statement-breakpoint
CREATE INDEX "pools_vehicle_idx" ON "pools" ("vehicle_id");--> statement-breakpoint
CREATE INDEX "pools_status_idx" ON "pools" ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "pools_one_open_per_vehicle" ON "pools" ("vehicle_id") WHERE "status" in ('matched_accepted', 'driver_arrived', 'started');--> statement-breakpoint
CREATE INDEX "ride_requests_passenger_idx" ON "ride_requests" ("passenger_id");--> statement-breakpoint
CREATE INDEX "ride_requests_pool_idx" ON "ride_requests" ("pool_id");--> statement-breakpoint
CREATE INDEX "ride_requests_open_idx" ON "ride_requests" ("created_at") WHERE "status" = 'requested';--> statement-breakpoint
ALTER TABLE "pools" ADD CONSTRAINT "pools_vehicle_id_vehicles_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "ride_requests" ADD CONSTRAINT "ride_requests_passenger_id_users_id_fkey" FOREIGN KEY ("passenger_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "ride_requests" ADD CONSTRAINT "ride_requests_pool_id_pools_id_fkey" FOREIGN KEY ("pool_id") REFERENCES "pools"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "ride_requests" ADD CONSTRAINT "ride_requests_pickup_location_id_locations_id_fkey" FOREIGN KEY ("pickup_location_id") REFERENCES "locations"("id");--> statement-breakpoint
ALTER TABLE "ride_requests" ADD CONSTRAINT "ride_requests_destination_location_id_locations_id_fkey" FOREIGN KEY ("destination_location_id") REFERENCES "locations"("id");