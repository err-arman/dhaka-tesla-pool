// Read-only business rules for the curated location list.
//
// There is nothing to enforce here yet, and that is deliberate rather than an oversight:
// the list is seeded, immutable through the API, and has no per-user state. The service
// exists so the controller has one thing to call and so the module keeps the same shape
// as the others — the moment a location needs a rule (an active flag, a search filter,
// an admin-only write) that rule lands here rather than in the controller.
import { locationsRepository } from './locations.repository';

export const locationsService = {
  /**
   * Every seeded area, ordered by name. An empty array is a normal answer: the seed has
   * not been run yet, which the request page has to render as a fixable state rather
   * than an error.
   */
  async list() {
    return locationsRepository.findAll();
  },
};
