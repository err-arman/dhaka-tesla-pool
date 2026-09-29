// Maps URLs for vehicle management. The guard is imported from the drivers module
// because driver approval is that module's rule, not the vehicles module's.
import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate';
import { requireApprovedDriver } from '../drivers/drivers.guard';
import { vehiclesController } from './vehicles.controller';

export const vehiclesRouter = Router();

vehiclesRouter.use(authenticate, requireApprovedDriver);

vehiclesRouter.post('/', vehiclesController.create);
vehiclesRouter.get('/', vehiclesController.list);
vehiclesRouter.patch('/:id', vehiclesController.update);
vehiclesRouter.delete('/:id', vehiclesController.remove);
