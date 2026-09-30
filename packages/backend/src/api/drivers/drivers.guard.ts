// Blocks requests from users without an approved driver profile.
//
// This checks the database instead of the roles inside the access token, so a driver
// can start using the vehicles endpoints immediately after applying, without having
// to wait for their token to expire and refresh.
import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error';
import { driversRepository } from './drivers.repository';

export const requireApprovedDriver: RequestHandler = async (req, _res, next) => {
  const userId = req.user?.id;
  if (!userId) throw new AppError(401, 'Not authenticated', 'UNAUTHORIZED');

  const approved = await driversRepository.hasApprovedProfile(userId);
  if (!approved) {
    throw new AppError(403, 'Only an approved driver may do this', 'DRIVER_NOT_APPROVED');
  }
  next();
};
