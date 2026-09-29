// Zod schemas for the auth endpoints. Self-contained on purpose: a validation file
// may only depend on zod, so it does not reuse the field rules in users.validation.
import { z } from 'zod';

// Stored lowercased so uniqueness comparisons are reliable.
const email = z.string().trim().toLowerCase().pipe(z.email());

// E.164, e.g. +8801XXXXXXXXX. Enforced here as well as on update, so a signup
// cannot store a phone that a later profile update would reject.
const phone = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{7,14}$/, 'Use international format, e.g. +8801XXXXXXXXX');

export const signupSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  email,
  phone: phone.optional(),
  password: z.string().min(8).max(128),
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
