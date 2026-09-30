// HTTP layer for /drivers.
import type { Request, Response } from "express";
import { requireUser } from "../../common/middleware/authenticate";
import { AppError } from "../../common/errors/app-error";
import { vehiclesService } from "../vehicles/vehicles.service";
import { locationsRepository } from "../locations/locations.repository";
import { driversService } from "./drivers.service";
import {
  driverParamsSchema,
  setOnlineSchema,
  updateStatusSchema,
} from "./drivers.validation";

export const driversController = {
  async getMe(req: Request, res: Response) {
    const user = requireUser(req);
    res.json(await driversService.getProfile(user.id));
  },

  /**
   * Going online needs an active vehicle; going offline never does. That rule spans two
   * modules, and `vehicles` already depends on `drivers`, so `drivers.service` cannot
   * import `vehicles` without a cycle. This controller is the only layer that sees
   * both, so it enforces the precondition here and the service stays a pure write.
   */
  async setOnline(req: Request, res: Response) {
    const user = requireUser(req);
    const { isOnline, currentZoneId } = setOnlineSchema.parse(req.body ?? {});
    if (isOnline && !(await vehiclesService.hasActive(user.id))) {
      throw new AppError(
        409,
        "Register an active vehicle before going online",
        "NO_ACTIVE_VEHICLE",
      );
    }

    /*
     * The zone is a `locations` row and this layer already imports `vehicles`, so it is
     * also the cheapest place to confirm it exists. Letting the foreign key reject the
     * write instead would surface as a 500 on a field the driver filled in correctly
     * except for picking a stale option, which is not a useful error to act on.
     */
    if (isOnline && currentZoneId) {
      const known = await locationsRepository.exists(currentZoneId);
      if (!known) throw new AppError(422, "Unknown area", "LOCATION_NOT_FOUND");
    }

    res.json(
      await driversService.setOnline(user.id, isOnline, currentZoneId ?? null),
    );
  },

  async updateStatus(req: Request, res: Response) {
    requireUser(req);
    const { userId } = driverParamsSchema.parse(req.params);
    const { status } = updateStatusSchema.parse(req.body ?? {});
    res.json(await driversService.updateStatus(userId, status));
  },
};
