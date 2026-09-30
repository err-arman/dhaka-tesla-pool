// HTTP layer for /users. Reads the request, validates it, calls the service and
// sends the response. No database access and no business rules live here.
import type { Request, Response } from 'express';
import { requireUser } from '../../common/middleware/authenticate';
import { authService } from '../auth/auth.service';
import { usersService } from './users.service';
import { updateProfileSchema } from './users.validation';

export const usersController = {
  async getMe(req: Request, res: Response) {
    const user = requireUser(req);
    res.json(await usersService.getPublicUser(user.id));
  },

  async updateMe(req: Request, res: Response) {
    const user = requireUser(req);
    const input = updateProfileSchema.parse(req.body ?? {});
    res.json(await usersService.updateProfile(user.id, input));
  },

  async deleteMe(req: Request, res: Response) {
    const user = requireUser(req);
    // The module dependency rule stops users.service from importing auth, and a
    // service must not call another module. This controller is the only layer that
    // sees both, so it performs the two writes in the order the spec requires:
    // deactivate the account first, then revoke every session it owns. Without the
    // second write the account would keep working until its access token expired.
    await usersService.softDelete(user.id);
    await authService.revokeAllSessions(user.id);
    res.status(204).send();
  },
};
