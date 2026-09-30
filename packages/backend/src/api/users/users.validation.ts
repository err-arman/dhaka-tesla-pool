// Zod schemas for the users endpoints. Controllers parse with these and use only
// the parsed result, so unknown keys in the request body are dropped.
// This module is not allowed to import the auth module, so it redeclares the shared
// field rules instead of importing them.
import { z } from 'zod';

// E.164, e.g. +8801XXXXXXXXX.
const phone = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{7,14}$/, 'Use international format, e.g. +8801XXXXXXXXX');

const fullName = z.string().trim().min(2).max(100);

const avatarUrl = z.url().max(500);

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
    message: 'Provide at least one field',
  });

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
