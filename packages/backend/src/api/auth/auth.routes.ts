// Maps URLs for signup, login, token rotation and logout.
// The public routes carry their own rate limiters; logout-all needs a valid token.
import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate';
import { authLimiter, loginLimiter } from '../../common/middleware/rate-limit';
import { authController } from './auth.controller';

export const authRouter = Router();

authRouter.post('/signup', authLimiter, authController.signup);
authRouter.post('/login', loginLimiter, authController.login);
authRouter.post('/refresh', authLimiter, authController.refresh);
authRouter.post('/logout', authLimiter, authController.logout);
authRouter.post('/logout-all', authenticate, authController.logoutAll);
