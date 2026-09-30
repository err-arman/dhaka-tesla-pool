// Seeds the curated Dhaka areas that `ride_requests.pickup_location_id` and
// `destination_location_id` reference. Keeping the list static is deliberate: the spec
// asks for predefined areas precisely so a trip's endpoints need no map or geocoding
// API, and a fixed list is the cheapest way to get that.
//
// Coordinates are the centre of each area, not a boundary. They are accurate enough to
// sort and group areas and to sanity-check a pickup, not to navigate to.
//
// Re-running is safe. `locations.name` is uniquely indexed, so this upserts on it and
// refreshes the coordinates rather than inserting duplicates. That matters because these
// are hand-entered approximations that will get corrected.
//
// Usage: bun run db:seed:locations          (upsert)
//        bun run db:seed:locations --dry    (print, write nothing)
import { sql } from 'drizzle-orm';

import { db, pool } from '../db';
import { locations } from '../db/locations/locations.schema';

export const DHAKA_ZONES = {
  BANANI: { lat: 23.79350280197614, lng: 90.40412117589868 },
  GULSHAN_1: { lat: 23.780279802296754, lng: 90.41677815946119 }, // Centered near Gulshan 1
  MOHAKHALI: { lat: 23.778365475122996, lng: 90.39787308844559 },
  DHANMONDI: { lat: 23.750094253290953, lng: 90.37766438721876 },
  MIRPUR: { lat: 23.807213193963243, lng: 90.368611618133 }, // Centered near Mirpur 10
  UTTARA: { lat: 23.875706353422636, lng: 90.39948795142519 },
  FARMGATE: { lat: 23.756463220446644, lng: 90.38776821876638 },
  BASHUNDHARA: { lat: 23.82794417829647, lng: 90.45066450247964 },
} as const;

/**
 * Turns a zone key into the name a passenger reads in a dropdown: `GULSHAN_1` becomes
 * "Gulshan 1" and `BASHUNDHARA` becomes "Bashundhara". Deriving it means adding a zone is
 * one line above rather than two, and the two can never drift apart.
 */
function displayName(key: string): string {
  return key
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

const rows = Object.entries(DHAKA_ZONES).map(([key, zone]) => ({
  name: displayName(key),
  lat: zone.lat,
  lng: zone.lng,
}));

if (process.argv.includes('--dry')) {
  console.log(`${rows.length} locations, nothing written:\n`);
  for (const row of rows) {
    console.log(`  ${row.name.padEnd(14)} ${row.lat}, ${row.lng}`);
  }
  await pool.end();
  process.exit(0);
}

/*
 * `excluded` is the row Postgres was about to insert, so the coordinate columns are
 * taken from the incoming value. Writing them literally would make a re-run silently
 * leave the original coordinates in place, which is exactly the case a seed has to get
 * right.
 */
const seeded = await db
  .insert(locations)
  .values(rows)
  .onConflictDoUpdate({
    target: locations.name,
    set: {
      lat: sql`excluded.lat`,
      lng: sql`excluded.lng`,
    },
  })
  .returning();

console.log(`Seeded ${seeded.length} location(s):\n`);
for (const row of seeded) {
  console.log(`  ${row.name.padEnd(14)} ${row.lat}, ${row.lng}`);
}

await pool.end();
