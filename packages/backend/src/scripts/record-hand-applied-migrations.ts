/**
 * One-off repair: record the five migrations that were applied to the database by hand
 * so that `drizzle-kit migrate` stops trying to replay them.
 *
 * Why this is needed
 * ------------------
 * drizzle 1.0-rc has no `meta/_journal.json`; it reads every `<folder>/migration.sql`
 * under the migrations dir and compares them against the `name` column of
 * `drizzle.__drizzle_migrations`. That table did not exist, because migrations 1-5 were
 * applied with hand-run SQL rather than through drizzle. So drizzle considered all six
 * pending, began at migration 1, and died at migration 5 on
 * `ALTER TABLE "users" ADD COLUMN "role"` because that column already exists. The whole
 * batch runs in one transaction, so it rolled back and the database was unaffected.
 *
 * This inserts the five already-applied names. It does not touch any application table.
 * After it runs, `bun run db:migrate` applies only the pools/ride_requests migration.
 *
 * Hashes are sha256 of each migration.sql exactly as drizzle computes it, and created_at
 * is Date.UTC of the 14-digit folder prefix, so the recorded rows are indistinguishable
 * from rows drizzle wrote itself. Drizzle matches on `name` only, so the hash is for
 * integrity rather than for the pending check.
 *
 * Usage: bun run src/scripts/record-hand-applied-migrations.ts [--apply]
 *        (no flag = dry run, prints the SQL and touches nothing)
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import { pool } from '../db';

/*
 * Anchored to this file rather than `process.cwd()`, so the script finds the same
 * migrations no matter which directory it is run from.
 */
const MIGRATIONS_DIR = fileURLToPath(new URL('../../drizzle', import.meta.url));

/** Folders already applied to the database by hand, oldest first. */
const ALREADY_APPLIED = [
  '20260928213332_colossal_morlocks',
  '20260929231500_one_vehicle_per_driver',
  '20260930045224_user_roles_pk_and_session_index',
  '20260930092054_driver_online_toggle',
  '20260930160000_single_role_per_user',
];

/** Mirrors drizzle-orm/migrator.js readMigrationFiles(). */
function readMigrationFiles() {
  return readdirSync(MIGRATIONS_DIR)
    .map((subdir) => ({ name: subdir, path: join(MIGRATIONS_DIR, subdir, 'migration.sql') }))
    .filter((it) => existsSync(it.path))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(({ name, path }) => {
      const query = readFileSync(path).toString();
      const d = name.slice(0, 14);
      return {
        name,
        hash: createHash('sha256').update(query).digest('hex'),
        millis: Date.UTC(
          parseInt(d.slice(0, 4), 10),
          parseInt(d.slice(4, 6), 10) - 1,
          parseInt(d.slice(6, 8), 10),
          parseInt(d.slice(8, 10), 10),
          parseInt(d.slice(10, 12), 10),
          parseInt(d.slice(12, 14), 10)
        ),
      };
    });
}

const apply = process.argv.includes('--apply');
const known = new Map(readMigrationFiles().map((m) => [m.name, m]));

for (const name of ALREADY_APPLIED) {
  if (!known.has(name)) {
    console.error(`FATAL: ${name} is not in ${MIGRATIONS_DIR}; refusing to guess.`);
    process.exit(1);
  }
}

const rows = ALREADY_APPLIED.map((name) => {
  const m = known.get(name)!;
  return { name, hash: m.hash, createdAt: m.millis };
});
const pending = readMigrationFiles()
  .filter((m) => !ALREADY_APPLIED.includes(m.name))
  .map((m) => m.name);

console.log(`migrations on disk : ${readMigrationFiles().length}`);
console.log(`to record as done  : ${rows.length}`);
console.log(`left for drizzle   : ${pending.join(', ') || '(none)'}\n`);

const values = rows.map((r) => `('${r.hash}', ${r.createdAt}, '${r.name}')`).join(',\n    ');

/*
 * `on conflict do nothing` would be useless here: drizzle's bookkeeping table has only
 * a primary key on `id` and no unique index on `name`, so there is no conflict to catch
 * and a second run would insert the same five rows again. `where not exists` against the
 * names themselves is what actually makes this idempotent.
 */
const insert = `insert into drizzle.__drizzle_migrations (hash, created_at, name)
select v.hash, v.created_at, v.name
from (values
    ${values}
  ) as v(hash, created_at, name)
where not exists (
  select 1 from drizzle.__drizzle_migrations m where m.name = v.name
);`;

console.log('--- SQL that would run ---');
console.log(insert);
console.log('--------------------------\n');

if (!apply) {
  console.log('DRY RUN. Nothing written. Re-run with --apply to record these rows.');
  await pool.end();
  process.exit(0);
}

const db = drizzle({ client: pool });
await db.execute(sql`CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
  id SERIAL PRIMARY KEY,
  hash text NOT NULL,
  created_at bigint,
  name text,
  applied_at timestamp with time zone DEFAULT now()
)`);
await db.execute(sql.raw(insert));
const recorded = await db.execute<{ name: string }>(
  sql`select name from drizzle.__drizzle_migrations order by created_at`
);
console.log('recorded:', recorded.rows.map((r) => r.name));
console.log('\nNow run: bun run db:migrate');
await pool.end();
