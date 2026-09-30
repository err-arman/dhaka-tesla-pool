// Drizzle queries for the `sessions` table. No business rules and no HTTP errors.
import { and, eq, gt, isNull } from 'drizzle-orm';
import { db, type DbExecutor } from '../../db';
import { sessions, users } from '../../db/schema';

export interface NewSession {
  userId: string;
  refreshTokenHash: string;
  userAgent?: string;
  expiresAt: Date;
}

export const authRepository = {
  async create(values: NewSession, ex: DbExecutor = db) {
    const [row] = await ex.insert(sessions).values(values).returning({ id: sessions.id });
    return row;
  },

  /**
   * A usable session: not revoked, not expired, joined to its user so the caller
   * can also check whether the account is still active.
   */
  async findActiveByHash(refreshTokenHash: string, ex: DbExecutor = db) {
    const [row] = await ex
      .select({
        sessionId: sessions.id,
        userId: sessions.userId,
        userIsActive: users.isActive,
        userDeletedAt: users.deletedAt,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(
        and(
          eq(sessions.refreshTokenHash, refreshTokenHash),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, new Date()),
        ),
      )
      .limit(1);
    return row;
  },

  /**
   * Swaps the stored hash only if it still matches the one the caller presented.
   * Two requests racing with the same refresh token cannot both get a row back,
   * which is what makes rotation safe.
   */
  async rotate(
    sessionId: string,
    oldHash: string,
    newHash: string,
    expiresAt: Date,
    ex: DbExecutor = db,
  ) {
    const [row] = await ex
      .update(sessions)
      .set({ refreshTokenHash: newHash, expiresAt })
      .where(
        and(
          eq(sessions.id, sessionId),
          eq(sessions.refreshTokenHash, oldHash),
          isNull(sessions.revokedAt),
        ),
      )
      .returning({ id: sessions.id });
    return row;
  },

  async revokeByHash(refreshTokenHash: string, ex: DbExecutor = db) {
    await ex
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.refreshTokenHash, refreshTokenHash), isNull(sessions.revokedAt)));
  },

  async revokeAllForUser(userId: string, ex: DbExecutor = db) {
    await ex
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
  },
};
