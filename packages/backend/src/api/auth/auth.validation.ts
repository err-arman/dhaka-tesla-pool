// Zod schemas for the auth endpoints. Self-contained on purpose: a validation file
// may only depend on zod, so it does not reuse the field rules in users.validation.
import { z } from 'zod';
import type { SelfAssignableRole } from '../../common/types/auth.types';

// Stored lowercased so uniqueness comparisons are reliable.
const email = z.string().trim().toLowerCase().pipe(z.email());

// E.164, e.g. +8801XXXXXXXXX. Enforced here as well as on update, so a signup
// cannot store a phone that a later profile update would reject.
const phone = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{7,14}$/, 'Use international format, e.g. +8801XXXXXXXXX');

/*
 * The roles a client may pick for itself. `admin` is absent on purpose: signup takes
 * this from the request body, so accepting the full `role` enum would let anyone
 * promote themselves by posting {"role":"admin"}. Admins are only created by
 * `bun run make-admin`.
 *
 * `satisfies` is the guard, not a comment: if the database enum ever gains a value,
 * this line stops compiling and forces a decision about whether the new role is
 * self-assignable. Keeping the array as the schema's source means the check cannot
 * drift away from what is actually accepted.
 */
const selfAssignableRoles = ['passenger', 'driver'] as const satisfies readonly SelfAssignableRole[];

export const signupSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  email,
  phone: phone.optional(),
  password: z.string().min(8).max(128),
  role: z.enum(selfAssignableRoles).default('passenger'),
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
