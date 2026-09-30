// Drizzle queries for `locations`.
//
// The table is a small, curated, read-only reference set: a fixed list of Dhaka areas
// seeded by `src/seeds/locations.seed.ts`. There is no create/update path from the API,
// because adding an area is a deployment concern, not something an end user does.
//
// `ride_requests` holds two foreign keys into this table, so a row here is referenced
// by history and must not be deletable through the API. That is why this module exposes
// exactly one query.
import { asc, eq } from 'drizzle-orm';
import { db, type DbExecutor } from '../../db';
import { locations } from '../../db/schema';

const locationColumns = {
  id: locations.id,
  name: locations.name,
  lat: locations.lat,
  lng: locations.lng,
};

export const locationsRepository = {
  /**
   * Ordered by name rather than id, because the only consumer is a select input and a
   * stable alphabetical list is what a passenger scans. Sorting on the client instead
   * would mean shipping an order that disagrees with the server's.
   */
  async findAll() {
    return db.select(locationColumns).from(locations).orderBy(asc(locations.name));
  },

  /**
   * Whether this area id exists, for validating a foreign key before a write.
   *
   * Takes an executor so it can run inside the caller's transaction when the caller has
   * one. `id` is already a uuid by the time it arrives -- the zod schemas guarantee that --
   * so a failure here means a well-formed id that names nothing, which is the case worth
   * answering as 422 rather than letting the foreign key raise 500.
   */
  async exists(id: string, ex: DbExecutor = db) {
    const [row] = await ex
      .select({ id: locations.id })
      .from(locations)
      .where(eq(locations.id, id))
      .limit(1);
    return Boolean(row);
  },

};
