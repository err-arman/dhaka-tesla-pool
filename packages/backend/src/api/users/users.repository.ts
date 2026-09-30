// Drizzle queries for `users` and `user_roles`. No business rules and no HTTP
// errors live here — services decide what a failed query means.
import { and, eq, isNull } from 'drizzle-orm';
import { db, type DbExecutor } from '../../db';
import { users, userRoles } from '../../db/schema';
import type { Role } from '../../common/types/auth.types';

/** The only user columns that may ever be sent to a client. passwordHash is absent. */
export const publicUserColumns = {
  id: users.id,
  fullName: users.fullName,
  email: users.email,
  phone: users.phone,
  avatarUrl: users.avatarUrl,
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

  async getRoles(userId: string, ex: DbExecutor = db): Promise<Role[]> {
    const rows = await ex
      .select({ role: userRoles.role })
      .from(userRoles)
      .where(eq(userRoles.userId, userId));
    return rows.map((row) => row.role);
  },

  /**
   * The composite primary key on (user_id, role) is what makes this safe: the
   * earlier check-then-insert left a window where two concurrent grants both saw
   * no row and both inserted, giving a user a token with `roles: ['driver','driver']`.
   * `onConflictDoNothing` keeps it to a single atomic statement and makes a repeat
   * grant a no-op rather than a 23505.
   */
  async addRole(userId: string, role: Role, ex: DbExecutor = db) {
    await ex.insert(userRoles).values({ userId, role }).onConflictDoNothing();
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
