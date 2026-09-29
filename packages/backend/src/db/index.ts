// Single database connection for the whole app.
// Repositories accept either `db` or a transaction handle, so the same query works inside or outside a transaction.
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { env } from '../config/env';

export const pool = new Pool({ connectionString: env.DATABASE_URL });

// `schema` is deliberately not passed to drizzle(): the 1.0 RC line omits it from
// DrizzlePgConfig. All queries use `db.select().from(table)`, which does not need it.
export const db = drizzle({ client: pool });

export type Db = typeof db;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
/** Either the normal client or an open transaction. */
export type DbExecutor = Db | Tx;
