import { z } from "zod";

// Shared field rules used by authentication and profile endpoints.
export const email = z.string().trim().toLowerCase().pipe(z.email());

export const phone = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{7,14}$/, "Use international format, e.g. +8801XXXXXXXXX");

export const fullName = z.string().trim().min(2).max(100);

export const avatarUrl = z.url().max(500);
