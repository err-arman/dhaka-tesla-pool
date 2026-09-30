// Maps URLs for vehicle management. The guard is imported from the drivers module
// because driver approval is that module's rule, not the vehicles module's.
//
// These are singleton routes: a driver has at most one active vehicle, so there is
// no :id anywhere.
import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate';
import { requireApprovedDriver } from '../drivers/drivers.guard';
import { vehiclesController } from './vehicles.controller';

export const vehiclesRouter = Router();

vehiclesRouter.use(authenticate, requireApprovedDriver);

vehiclesRouter.get('/', vehiclesController.get);
vehiclesRouter.put('/', vehiclesController.put);
vehiclesRouter.patch('/', vehiclesController.update);
vehiclesRouter.delete('/', vehiclesController.remove);
