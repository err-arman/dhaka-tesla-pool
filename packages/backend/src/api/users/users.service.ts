// Business rules for user accounts: what a signup is allowed to do, what a
// profile update means, and what shape the API may return.
import { db, type DbExecutor } from '../../db';
import { AppError } from '../../common/errors/app-error';
import { isUniqueViolation, uniqueConstraintName } from '../../common/errors/db-errors';
import type { Role, SelfAssignableRole } from '../../common/types/auth.types';
import { usersRepository } from './users.repository';
import type { UpdateProfileInput } from './users.validation';

/** The user shape the API sends. Never contains passwordHash. */
export interface PublicUser {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  role: Role;
}

export interface SignupInput {
  fullName: string;
  email: string;
  phone?: string;
  passwordHash: string;
}

const emailTaken = () => new AppError(409, 'That email is already registered', 'EMAIL_TAKEN');
const phoneTaken = () => new AppError(409, 'That phone number is already in use', 'PHONE_TAKEN');

export const usersService = {
  /** Includes passwordHash, so only the auth module may call this. */
  findByEmail(email: string, ex: DbExecutor = db) {
    return usersRepository.findByEmail(email, ex);
  },

  getRole(userId: string, ex: DbExecutor = db) {
    return usersRepository.findRoleById(userId, ex);
  },

  async getPublicUser(userId: string): Promise<PublicUser> {
    // Single query: the role rides along on publicUserColumns, so there is no second
    // round trip and no window where the two halves of the response can disagree.
    const user = await usersRepository.findActivePublicById(userId);
    if (!user) throw new AppError(404, 'User not found', 'NOT_FOUND');
    return user;
  },

  /**
   * Inserts the account with the chosen role. Takes the role as a parameter rather than
   * defaulting to 'passenger', so signup can open as a driver; the narrowing to
   * SelfAssignableRole happens in the signup schema.
   *
   * Does not open a transaction: the caller owns it, so signup can add the driver
   * profile to the same one. The unique-violation mapping works either way.
   */
  async createWithRole(input: SignupInput, role: SelfAssignableRole, ex: DbExecutor = db) {
    try {
      const existing = await usersRepository.findByEmail(input.email, ex);
      if (existing) throw emailTaken();

      const user = await usersRepository.insert(
        {
          fullName: input.fullName,
          email: input.email,
          phone: input.phone,
          passwordHash: input.passwordHash,
          role,
        },
        ex,
      );
      if (!user) throw new AppError(500, 'Could not create the account', 'INTERNAL');
      return user;
    } catch (err) {
      // Two signups can race past the check above, so the unique index is the real
      // guard. Email and phone share the same 23505 code, so read the constraint
      // name to report the right one.
      if (isUniqueViolation(err)) {
        throw uniqueConstraintName(err) === 'users_phone_key' ? phoneTaken() : emailTaken();
      }
      throw err;
    }
  },

  /** Replaces the account's role. Used by driver signup, `apply` and `make-admin`. */
  async setRole(userId: string, role: Role, ex: DbExecutor = db) {
    const updated = await usersRepository.setRole(userId, role, ex);
    if (!updated) throw new AppError(404, 'User not found', 'NOT_FOUND');
    return updated;
  },

  async updateProfile(userId: string, input: UpdateProfileInput): Promise<PublicUser> {
    try {
      // `updatedAt` has no database trigger, so every update must set it. The role is
      // not touched: publicUserColumns carries the current one back out.
      const updated = await usersRepository.update(userId, { ...input, updatedAt: new Date() });
      if (!updated) throw new AppError(404, 'User not found', 'NOT_FOUND');
      return updated;
    } catch (err) {
      if (isUniqueViolation(err)) throw phoneTaken();
      throw err;
    }
  },

  async softDelete(userId: string) {
    const deleted = await usersRepository.softDelete(userId);
    if (!deleted) throw new AppError(404, 'User not found', 'NOT_FOUND');
    return deleted;
  },
};
