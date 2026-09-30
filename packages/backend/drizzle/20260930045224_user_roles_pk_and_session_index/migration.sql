-- Composite primary key on user_roles, plus the missing session indexes.
--
-- The first migration was generated while the schema imported primaryKey, index and
-- uniqueIndex from drizzle-orm/cockroach-core. drizzle-kit's postgres serializer
-- ignores those, so it emitted neither the user_roles primary key nor
-- sessions_user_idx — the schema declared both and the database got neither. The
-- schema now imports from drizzle-orm/pg-core, and this migration adds the three
-- constraints that were silently dropped. (vehicles_one_active_per_driver did land,
-- because that one was hand-written in the second migration.)
--
-- 1. user_roles (user_id, role). With no key the database stores the same role
--    twice, and the application worked around it with a check-then-insert that two
--    concurrent grants could both pass. usersRepository.addRole now relies on the key
--    with onConflictDoNothing, so it has to exist.
--
-- 2. sessions.refresh_token_hash. Every refresh, rotation and logout filters on this
--    column, and it was unindexed, so each of those was a sequential scan that got
--    slower as sessions accumulated.
--
-- 3. sessions(user_id). Declared in the schema since the start, never created.
--
-- As in the previous migration there is no explicit BEGIN/COMMIT: drizzle's migrator
-- already wraps the file in one transaction, and an inner COMMIT would end it early,
-- leaving these changes committed even if the bookkeeping insert then failed.
--
-- Adding the primary key fails if a concurrent grant already inserted a duplicate, so
-- collapse any duplicates first, keeping the earliest row. ctid is used only here, at
-- migration time, and is never referenced by application code.
DELETE FROM "user_roles"
WHERE "ctid" IN (
	SELECT "ctid"
	FROM (
		SELECT
			"ctid",
			row_number() OVER (PARTITION BY "user_id", "role" ORDER BY ctid) AS rn
		FROM "user_roles"
	) AS ranked
	WHERE ranked.rn > 1
);
--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY("user_id","role");
--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" ("user_id");
--> statement-breakpoint
CREATE INDEX "sessions_refresh_token_hash_idx" ON "sessions" ("refresh_token_hash");
