// Zod schemas for the auth endpoints. Shared field rules live in common/validation.
import { z } from "zod";
import type { SelfAssignableRole } from "../../common/types/auth.types";
import { email, phone, fullName } from "../../common/validation/fields";

/*
 * The roles a client may pick for itself. `admin` is absent on purpose: signup takes
 * this from the request body, so accepting the full `role` enum would let anyone
 * promote themselves by posting {"role":"admin"}. Admin accounts are provisioned
 * outside the public signup flow.
 *
 * `satisfies` is the guard, not a comment: if the database enum ever gains a value,
 * this line stops compiling and forces a decision about whether the new role is
 * self-assignable. Keeping the array as the schema's source means the check cannot
 * drift away from what is actually accepted.
 */
const selfAssignableRoles = [
  "passenger",
  "driver",
] as const satisfies readonly SelfAssignableRole[];

export const signupSchema = z.object({
  fullName,
  email,
  phone: phone.optional(),
  password: z.string().min(8).max(128),
  role: z.enum(selfAssignableRoles).default("passenger"),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(128),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(20).max(200),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
