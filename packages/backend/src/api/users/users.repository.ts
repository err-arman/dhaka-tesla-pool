// Drizzle queries for `users`. No business rules and no HTTP errors live here —
// services decide what a failed query means.
import { and, eq, isNull } from 'drizzle-orm';
import { db, type DbExecutor } from '../../db';
import { users } from '../../db/schema';
import type { Role } from '../../common/types/auth.types';

/** The only user columns that may ever be sent to a client. passwordHash is absent. */
export const publicUserColumns = {
  id: users.id,
  fullName: users.fullName,
  email: users.email,
  phone: users.phone,
  avatarUrl: users.avatarUrl,
  role: users.role,
};

type NewUser = typeof users.$inferInsert;
type UserChanges = Partial<NewUser>;

export const usersRepository = {
  /** Full row, including passwordHash. Only the auth module may call this. */
  async findByEmail(email: string, ex: DbExecutor = db) {
    const [row] = await ex.select().from(users).where(eq(users.email, email)).limit(1);
    return row;
  },

  /** Public columns only, and soft-deleted users are invisible. */
  async findActivePublicById(id: string, ex: DbExecutor = db) {
    const [row] = await ex
      .select(publicUserColumns)
      .from(users)
      .where(and(eq(users.id, id), isNull(users.deletedAt)))
      .limit(1);
    return row;
  },

  async insert(values: NewUser, ex: DbExecutor = db) {
    const [row] = await ex.insert(users).values(values).returning(publicUserColumns);
    return row;
  },

  /**
   * Reads the role for token signing. Checks `isActive` as well as `deletedAt`, so a
   * deactivated account cannot have a fresh access token minted from an old refresh
   * token. No row means the caller decides whether that is a 401.
   */
  async findRoleById(id: string, ex: DbExecutor = db) {
    const [row] = await ex
      .select({ role: users.role })
      .from(users)
      .where(and(eq(users.id, id), isNull(users.deletedAt), eq(users.isActive, true)))
      .limit(1);
    return row?.role;
  },

  /**
   * Replaces the account's role. This is the only way a role changes now that an
   * account holds exactly one, which is what `POST /drivers/apply` relies on to turn
   * a passenger into a driver instead of stacking a second role on top.
   *
   * The `isNull(deletedAt)` and `isActive` conditions match `update`, so a soft-deleted
   * or deactivated account cannot have its role escalated while an access token for it
   * is still inside its TTL.
   */
  async setRole(id: string, role: Role, ex: DbExecutor = db) {
    const [row] = await ex
      .update(users)
      .set({ role, updatedAt: new Date() })
      .where(and(eq(users.id, id), isNull(users.deletedAt), eq(users.isActive, true)))
      .returning({ id: users.id });
    return row;
  },

  /**
   * Same visibility rule as `findActivePublicById`: a soft-deleted or deactivated
   * account must not be able to mutate itself while its access token is still
   * within TTL. Without this guard `PATCH /users/me` returned 200 for a user that
   * `GET /users/me` treats as gone. No row means the caller maps it to 404.
   */
  async update(id: string, changes: UserChanges, ex: DbExecutor = db) {
    const [row] = await ex
      .update(users)
      .set(changes)
      .where(and(eq(users.id, id), isNull(users.deletedAt), eq(users.isActive, true)))
      .returning(publicUserColumns);
    return row;
  },

  async softDelete(id: string, ex: DbExecutor = db) {
    const [row] = await ex
      .update(users)
      .set({ deletedAt: new Date(), isActive: false, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning({ id: users.id });
    return row;
  },
};
