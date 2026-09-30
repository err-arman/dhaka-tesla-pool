// Maps URLs for the current user to controllers. Every route here is private.
import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate';
import { usersController } from './users.controller';

export const usersRouter = Router();

usersRouter.use(authenticate);

usersRouter.get('/me', usersController.getMe);
usersRouter.patch('/me', usersController.updateMe);
usersRouter.delete('/me', usersController.deleteMe);
