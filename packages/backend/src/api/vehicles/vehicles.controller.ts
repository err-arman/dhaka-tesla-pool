// HTTP layer for /vehicles.
//
// No :id routes, because a driver has at most one active vehicle and the caller's
// own driverId is the only key involved.
import type { Request, Response } from 'express';
import { requireUser } from '../../common/middleware/authenticate';
import { vehiclesService } from './vehicles.service';
import { patchVehicleSchema, putVehicleSchema } from './vehicles.validation';

export const vehiclesController = {
  /** GET the caller's vehicle. 404 when they have not registered one yet. */
  async get(req: Request, res: Response) {
    const user = requireUser(req);
    res.json(await vehiclesService.get(user.id));
  },

  /** PUT registers the vehicle, or changes the seats of the one they have. */
  async put(req: Request, res: Response) {
    const user = requireUser(req);
    const input = putVehicleSchema.parse(req.body ?? {});
    res.json(await vehiclesService.put(user.id, input));
  },

  /** PATCH changes part of the vehicle they already have. 404 if they have none. */
  async update(req: Request, res: Response) {
    const user = requireUser(req);
    const input = patchVehicleSchema.parse(req.body ?? {});
    res.json(await vehiclesService.patch(user.id, input));
  },

  /** DELETE deactivates the caller's vehicle. 204 on success. */
  async remove(req: Request, res: Response) {
    const user = requireUser(req);
    await vehiclesService.remove(user.id);
    res.status(204).send();
  },
};
