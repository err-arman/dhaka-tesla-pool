// Maps URLs for signup, login, token rotation and logout.
// Every route is public; each carries its own rate limiter.
import { Router } from 'express';
import { authLimiter, loginLimiter } from '../../common/middleware/rate-limit';
import { authController } from './auth.controller';

export const authRouter = Router();

authRouter.post('/signup', authLimiter, authController.signup);
authRouter.post('/login', loginLimiter, authController.login);
authRouter.post('/refresh', authLimiter, authController.refresh);
authRouter.post('/logout', authLimiter, authController.logout);
