-- One vehicle per driver.
--
-- The domain moved from one-to-many to a singleton: a driver has at most one
-- *active* vehicle. Two things are needed.
--
-- 1. Dedupe. Existing data has drivers with 2-4 vehicles (21 rows total, 5 drivers
--    with more than one). The vehicles table has no created_at, so "newest" is
--    taken from ctid, which reflects physical insertion order. The newest row per
--    driver is kept and the rest are deleted. ctid is only used here, at migration
--    time, and is never referenced by application code.
--
-- 2. A partial unique index. It is partial on is_active, so a driver who removes
--    their vehicle keeps the deactivated row for history and may register a new
--    one later. A plain UNIQUE(driver_id) would permanently block that.
--
-- No BEGIN/COMMIT here on purpose. Drizzle's migrator already wraps every pending
-- migration in a single transaction, so an explicit BEGIN only produced
-- "there is already a transaction in progress" and the COMMIT ended that
-- transaction early — leaving the DELETE and the index committed even if the
-- bookkeeping insert afterwards failed, which then made a re-run fail on
-- "index already exists".
DELETE FROM "vehicles"
WHERE "id" IN (
	SELECT "id"
	FROM (
		SELECT
			"id",
			row_number() OVER (PARTITION BY "driver_id" ORDER BY ctid DESC) AS rn
		FROM "vehicles"
	) AS ranked
	WHERE ranked.rn > 1
);
--> statement-breakpoint
CREATE UNIQUE INDEX "vehicles_one_active_per_driver" ON "vehicles" ("driver_id") WHERE "is_active";
