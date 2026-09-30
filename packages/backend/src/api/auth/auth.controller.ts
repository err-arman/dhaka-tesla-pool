// HTTP layer for /auth. Validation happens here, one line per endpoint.
import type { Request, Response } from 'express';
import { authService } from './auth.service';
import { loginSchema, refreshSchema, signupSchema } from './auth.validation';

export const authController = {
  async signup(req: Request, res: Response) {
    const input = signupSchema.parse(req.body ?? {});
    res.status(201).json(await authService.signup(input, req.get('user-agent')));
  },

  async login(req: Request, res: Response) {
    const input = loginSchema.parse(req.body ?? {});
    res.json(await authService.login(input, req.get('user-agent')));
  },

  async refresh(req: Request, res: Response) {
    const { refreshToken } = refreshSchema.parse(req.body ?? {});
    res.json(await authService.refresh(refreshToken));
  },

  async logout(req: Request, res: Response) {
    const { refreshToken } = refreshSchema.parse(req.body ?? {});
    await authService.logout(refreshToken);
    res.status(204).send();
  },
};
