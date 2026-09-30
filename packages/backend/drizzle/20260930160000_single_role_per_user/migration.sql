-- One role per user. Collapses the `user_roles` join table into a single
-- `users.role` column and drops the table.
--
-- Backfill precedence is admin > driver > passenger, so no one loses a driver
-- profile: the 31 users holding both driver and passenger keep `driver`, and the
-- 5 holding an admin role keep `admin`.
ALTER TABLE "users" ADD COLUMN "role" role DEFAULT 'passenger' NOT NULL;

UPDATE "users" AS u
SET "role" = COALESCE(
  (
    SELECT r.role
    FROM "user_roles" AS r
    WHERE r.user_id = u.id
    ORDER BY CASE r.role WHEN 'admin' THEN 1 WHEN 'driver' THEN 2 ELSE 3 END
    LIMIT 1
  ),
  'passenger'::role
);

DROP TABLE "user_roles";
