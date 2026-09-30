import { uuid, text, doublePrecision } from 'drizzle-orm/pg-core/columns';
import { pgTable, uniqueIndex, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/*
 * Static geography: a small, admin-curated list of Dhaka areas. A ride request points
 * at two of these instead of carrying free-form coordinates, so validating where a trip
 * starts and ends needs no geocoding or map API.
 *
 * `lat`/`lng` are `double precision` (float8) rather than `numeric`. Money is stored as
 * an integer of poisha precisely because a decimal must never be used for it; a
 * coordinate is a measurement that is never summed or split, so a float is accurate
 * enough here and is the cheaper type to index.
 */
export const locations = pgTable(
  'locations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    lat: doublePrecision('lat').notNull(),
    lng: doublePrecision('lng').notNull(),
  },
  (t) => [
    // The table is meant to hold a fixed set of areas, so a repeated name is a data
    // entry mistake rather than a legitimate second place.
    uniqueIndex('locations_name_unique').on(t.name),
    // Postgres has no range type for these, so the valid bounds are checks instead.
    check('locations_lat_range', sql`${t.lat} between -90 and 90`),
    check('locations_lng_range', sql`${t.lng} between -180 and 180`),
  ],
);
