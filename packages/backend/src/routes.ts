// Mounts every module router under a single base path.
import { Router } from 'express';
import { authRouter } from './api/auth/auth.routes';
import { driversRouter } from './api/drivers/drivers.routes';
import { usersRouter } from './api/users/users.routes';
import { vehiclesRouter } from './api/vehicles/vehicles.routes';

export const routes = Router();

routes.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

routes.use('/auth', authRouter);
routes.use('/users', usersRouter);
routes.use('/drivers', driversRouter);
routes.use('/vehicles', vehiclesRouter);
