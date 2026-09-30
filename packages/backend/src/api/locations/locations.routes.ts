// Maps URLs for the curated location list.
//
// `authenticate` but no role guard, unlike `/vehicles` which also requires an approved
// driver: every role picks a pickup and a destination, so a passenger and a driver
// reading the same list is the normal case, not a leak.
//
// This module has no `*.validation.ts` because its only route takes no input. The file
// is added when the first route that needs a body or a query string arrives.
import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate';
import { locationsController } from './locations.controller';

export const locationsRouter = Router();

locationsRouter.use(authenticate);

locationsRouter.get('/', locationsController.list);
