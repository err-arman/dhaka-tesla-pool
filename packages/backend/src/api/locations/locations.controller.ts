// HTTP layer for /locations.
//
// Read-only, and deliberately the only route: `ride_requests` references these rows, so
// an area that has been used cannot be removed, and adding one is a seed-time concern.
// There is no :id either, because a client that lists the areas already has every id it
// could need.
import type { Request, Response } from 'express';
import { locationsService } from './locations.service';

export const locationsController = {
  /**
   * GET every area. Requires a session like the rest of the API, so the list is not
   * scrapable by an anonymous caller, but it is the same for all three roles.
   */
  async list(_req: Request, res: Response) {
    res.json(await locationsService.list());
  },
};
