// Business rules for user accounts: what a signup is allowed to do, what a
// profile update means, and what shape the API may return.
import { db, type DbExecutor } from '../../db';
import { AppError } from '../../common/errors/app-error';
import { isUniqueViolation, uniqueConstraintName } from '../../common/errors/db-errors';
import type { Role } from '../../common/types/auth.types';
import { usersRepository } from './users.repository';
import type { UpdateProfileInput } from './users.validation';

/** The user shape the API sends. Never contains passwordHash. */
export interface PublicUser {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  roles: Role[];
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

  getRoles(userId: string, ex: DbExecutor = db) {
    return usersRepository.getRoles(userId, ex);
  },

  async getPublicUser(userId: string): Promise<PublicUser> {
    const [user, roles] = await Promise.all([
      usersRepository.findActivePublicById(userId),
      usersRepository.getRoles(userId),
    ]);
    if (!user) throw new AppError(404, 'User not found', 'NOT_FOUND');
    return { ...user, roles };
  },

  /** Inserts the account and grants the default `passenger` role atomically. */
  async createWithPassenger(input: SignupInput) {
    try {
      return await db.transaction(async (tx) => {
        const existing = await usersRepository.findByEmail(input.email, tx);
        if (existing) throw emailTaken();

        const user = await usersRepository.insert(
          {
            fullName: input.fullName,
            email: input.email,
            phone: input.phone,
            passwordHash: input.passwordHash,
          },
          tx,
        );
        if (!user) throw new AppError(500, 'Could not create the account', 'INTERNAL');

        await usersRepository.addRole(user.id, 'passenger', tx);
        return user;
      });
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

  addRole(userId: string, role: Role, ex: DbExecutor = db) {
    return usersRepository.addRole(userId, role, ex);
  },

  async updateProfile(userId: string, input: UpdateProfileInput): Promise<PublicUser> {
    try {
      // `updatedAt` has no database trigger, so every update must set it.
      const updated = await usersRepository.update(userId, { ...input, updatedAt: new Date() });
      if (!updated) throw new AppError(404, 'User not found', 'NOT_FOUND');
      return { ...updated, roles: await usersRepository.getRoles(userId) };
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
