// Maps URLs for driver registration and admin approval.
// Every route needs a token; changing a status additionally needs the admin role.
import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate';
import { requireRole } from '../../common/middleware/require-role';
import { driversController } from './drivers.controller';

export const driversRouter = Router();

driversRouter.use(authenticate);

driversRouter.post('/apply', driversController.apply);
driversRouter.get('/me', driversController.getMe);
// Before `/:userId/status`: the literal path has to win over the parameter.
driversRouter.patch('/me/online', driversController.setOnline);
driversRouter.patch('/:userId/status', requireRole('admin'), driversController.updateStatus);
