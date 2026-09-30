import {
  pgTable, pgEnum, uuid, text, boolean, integer, timestamp, primaryKey, index,
} from 'drizzle-orm/pg-core';

export const roleEnum = pgEnum('role', ['passenger', 'driver', 'admin']);
export const driverStatusEnum = pgEnum('driver_status', ['pending', 'approved', 'rejected', 'suspended']);
export const otpPurposeEnum = pgEnum('otp_purpose', ['login', 'verify_phone', 'reset_password']);

// 1. Core identity: shared by every role
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  fullName: text('full_name').notNull(),
  email: text('email').unique(),               // store lowercased
  phone: text('phone').unique(),               // store in E.164, e.g. +8801XXXXXXXXX
  passwordHash: text('password_hash'),         // nullable if you allow OTP/social only
  avatarUrl: text('avatar_url'),
  // Exactly one role per account. This was a many-to-many `user_roles` join table;
  // the column makes "one role" a database constraint instead of a convention.
  role: roleEnum('role').notNull().default('passenger'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }), // soft delete
});