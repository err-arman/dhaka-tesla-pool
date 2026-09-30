// Zod schemas for the users endpoints. Controllers parse with these and use only
// the parsed result, so unknown keys in the request body are dropped.
// Shared field rules are kept outside feature modules so auth and profile validation
// cannot drift apart.
import { z } from "zod";
import { avatarUrl, fullName, phone } from "../../common/validation/fields";

// Email is deliberately absent: changing it needs a verification step, so the
// endpoint cannot silently repoint an account at an address nobody proved they own.
//
// `phone` and `avatarUrl` are nullable so a field can actually be cleared. Omitting a
// key leaves the column alone, which is different from sending null: without the null
// a client could only ever set these once and never remove them.
export const updateProfileSchema = z
  .object({
    fullName: fullName.optional(),
    phone: phone.nullable().optional(),
    avatarUrl: avatarUrl.nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field",
  });

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
