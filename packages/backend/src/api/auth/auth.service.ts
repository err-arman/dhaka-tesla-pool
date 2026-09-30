// Business rules for signup, login, refresh rotation and logout.
import { env } from '../../config/env';
import { db } from '../../db';
import { AppError } from '../../common/errors/app-error';
import { driversService } from '../drivers/drivers.service';
import { usersService } from '../users/users.service';
import { authRepository } from './auth.repository';
import {
  generateRefreshToken,
  hashRefreshToken,
  refreshExpiresAt,
  signAccessToken,
} from './auth.tokens';
import type { LoginInput, SignupInput } from './auth.validation';

// Verified when the email does not exist, so response time does not reveal which
// emails are registered. Hashed lazily on first miss, so importing this module does
// not pay for a key derivation that only login may need.
let dummyHash: string | undefined;
const getDummyHash = async () => (dummyHash ??= await Bun.password.hash('not-a-real-password'));

const invalidCredentials = () =>
  new AppError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');

const invalidRefresh = () => new AppError(401, 'Invalid refresh token', 'UNAUTHORIZED');

/** Creates a session row and returns a fresh token pair. Roles always come from the database. */
async function startSession(userId: string, userAgent?: string) {
  const roles = await usersService.getRoles(userId);
  const refreshToken = generateRefreshToken();
  await authRepository.create({
    userId,
    refreshTokenHash: hashRefreshToken(refreshToken),
    userAgent,
    expiresAt: refreshExpiresAt(),
  });
  return {
    accessToken: signAccessToken(userId, roles),
    refreshToken,
    expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
  };
}

export const authService = {
  async signup(input: SignupInput, userAgent?: string) {
    const passwordHash = await Bun.password.hash(input.password);

    /*
     * One transaction for the account, the role and the driver profile. A driver
     * without a profile row would pass the `driver` role but fail requireApprovedDriver
     * with a 403, so the profile cannot be created in a follow-up request.
     */
    const user = await db.transaction(async (tx) => {
      const created = await usersService.createWithRole(
        {
          fullName: input.fullName,
          email: input.email,
          phone: input.phone,
          passwordHash,
        },
        input.role,
        tx,
      );
      if (input.role === 'driver') await driversService.registerProfile(created.id, tx);
      return created;
    });

    const tokens = await startSession(user.id, userAgent);
    return { user: await usersService.getPublicUser(user.id), ...tokens };
  },

  async login(input: LoginInput, userAgent?: string) {
    const user = await usersService.findByEmail(input.email);
    // Always run the hash comparison, even for an unknown email, so the timing of
    // the two failure paths stays similar.
    const hash = user?.passwordHash ?? (await getDummyHash());
    const passwordOk = await Bun.password.verify(input.password, hash);
    if (!user || !user.passwordHash || !passwordOk || !user.isActive || user.deletedAt) {
      // One error for every reason, so nothing leaks about which accounts exist.
      throw invalidCredentials();
    }
    const tokens = await startSession(user.id, userAgent);
    return { user: await usersService.getPublicUser(user.id), ...tokens };
  },

  async refresh(refreshToken: string) {
    const oldHash = hashRefreshToken(refreshToken);
    const session = await authRepository.findActiveByHash(oldHash);
    if (!session || !session.userIsActive || session.userDeletedAt) throw invalidRefresh();

    const newToken = generateRefreshToken();
    // Only one request can win this update, so a replayed token always fails.
    const rotated = await authRepository.rotate(
      session.sessionId,
      oldHash,
      hashRefreshToken(newToken),
      refreshExpiresAt(),
    );
    if (!rotated) throw invalidRefresh();

    const roles = await usersService.getRoles(session.userId);
    return {
      accessToken: signAccessToken(session.userId, roles),
      refreshToken: newToken,
      expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
    };
  },

  /** Always succeeds, so an unknown token does not reveal which tokens exist. */
  async logout(refreshToken: string) {
    await authRepository.revokeByHash(hashRefreshToken(refreshToken));
  },

  /**
   * Revokes every session the account owns. Not exposed as a route: there is no
   * "sign out everywhere" button, and revoking other devices' sessions is a
   * foot-gun (one shared machine signs out the household). It exists because
   * `DELETE /users/me` needs it — a soft-deleted account must not keep working
   * until its access token expires.
   */
  async revokeAllSessions(userId: string) {
    await authRepository.revokeAllForUser(userId);
  },
};
