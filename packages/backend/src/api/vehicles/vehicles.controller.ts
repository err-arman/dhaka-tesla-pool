// HTTP layer for /vehicles.
import type { Request, Response } from 'express';
import { requireUser } from '../../common/middleware/authenticate';
import { vehiclesService } from './vehicles.service';
import {
  createVehicleSchema,
  updateVehicleSchema,
  vehicleParamsSchema,
} from './vehicles.validation';

export const vehiclesController = {
  async create(req: Request, res: Response) {
    const user = requireUser(req);
    const input = createVehicleSchema.parse(req.body ?? {});
    res.status(201).json(await vehiclesService.create(user.id, input));
  },

  async list(req: Request, res: Response) {
    const user = requireUser(req);
    res.json(await vehiclesService.list(user.id));
  },

  async update(req: Request, res: Response) {
    const user = requireUser(req);
    const { id } = vehicleParamsSchema.parse(req.params);
    const input = updateVehicleSchema.parse(req.body ?? {});
    res.json(await vehiclesService.update(user.id, id, input));
  },

  async remove(req: Request, res: Response) {
    const user = requireUser(req);
    const { id } = vehicleParamsSchema.parse(req.params);
    await vehiclesService.deactivate(user.id, id);
    res.status(204).send();
  },
};
