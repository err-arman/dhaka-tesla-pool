// HTTP layer for /drivers.
import type { Request, Response } from 'express';
import { requireUser } from '../../common/middleware/authenticate';
import { driversService } from './drivers.service';
import { driverParamsSchema, updateStatusSchema } from './drivers.validation';

export const driversController = {
  async apply(req: Request, res: Response) {
    const user = requireUser(req);
    res.status(201).json(await driversService.apply(user.id));
  },

  async getMe(req: Request, res: Response) {
    const user = requireUser(req);
    res.json(await driversService.getProfile(user.id));
  },

  async updateStatus(req: Request, res: Response) {
    requireUser(req);
    const { userId } = driverParamsSchema.parse(req.params);
    const { status } = updateStatusSchema.parse(req.body ?? {});
    res.json(await driversService.updateStatus(userId, status));
  },
};
