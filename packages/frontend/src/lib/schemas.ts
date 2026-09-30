import { z } from 'zod'

/*
 * These mirror the backend's zod schemas under packages/backend/src/api. They are
 * duplicated rather than shared because the frontend cannot import backend code,
 * and they exist to give instant feedback, not to be the source of truth: the
 * backend validates every request again and its response wins on conflict.
 */

// Stored lowercased by the backend, so compare the same way.
const email = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address'))

// E.164, e.g. +8801XXXXXXXXX.
const phone = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{7,14}$/, 'Use international format, e.g. +8801712345678')

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required'),
})

/*
 * The two portals. Shared with the login page's tab, and the same set the backend's
 * signup schema accepts: `admin` is not self-assignable, so it is not an option here.
 */
export const portalValues = ['passenger', 'driver'] as const
export type Portal = (typeof portalValues)[number]

export const signupSchema = z.object({
  fullName: z.string().trim().min(2, 'At least 2 characters').max(100),
  email,
  phone: phone.optional().or(z.literal('')),
  // Matches the backend's 8..128, with one extra rule for strength.
  password: z
    .string()
    .min(8, 'At least 8 characters')
    .max(128)
    .regex(/[a-zA-Z]/, 'Include at least one letter')
    .regex(/[0-9]/, 'Include at least one number'),
  confirmPassword: z.string(),
  // Sent to the backend, which grants it and creates a driver profile for 'driver'.
  // No `.default()` here: that would make the schema's input and output types differ,
  // which zodResolver cannot reconcile with useForm's value type. The form seeds the
  // default in `defaultValues` instead, and the tab always supplies an explicit value.
  role: z.enum(portalValues),
}).refine((value) => value.password === value.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
})

export type LoginInput = z.infer<typeof loginSchema>
export type SignupInput = z.infer<typeof signupSchema>

/*
 * Seats are 1..4 in the backend schema. The form holds a string because that is
 * what an <input type="number"> really contains; `vehiclePayload` converts it and
 * turns the empty case into undefined so the server applies the column default.
 */
function seatsField() {
  return z
    .string()
    .trim()
    .refine((v) => v === '' || /^\d+$/.test(v), 'Whole numbers only')
    .refine((v) => v === '' || Number(v) >= 1, 'At least 1 seat')
    .refine((v) => v === '' || Number(v) <= 4, 'At most 4 seats')
}

/** Registering: an empty value is allowed and lets the server apply its default. */
export const vehicleSchema = z.object({ seats: seatsField() })

/**
 * Editing: a value is required, because `PATCH /vehicles` refuses an empty body
 * rather than writing nothing. The backend enforces the same rule.
 */
export const vehicleSchemaRequired = z.object({
  seats: seatsField().refine((v) => v !== '', 'Enter the number of seats'),
})

export type VehicleInput = z.infer<typeof vehicleSchema>

export function vehiclePayload(values: VehicleInput): { seats?: number } {
  return { seats: values.seats === '' ? undefined : Number(values.seats) }
}

/*
 * Profile editing. Email is absent for the same reason it is absent on the backend:
 * changing it needs a verified address. The two optional columns accept an empty
 * string in the form and `profilePayload` turns it into `null`, which is how a field
 * gets cleared rather than left untouched.
 */
export const profileSchema = z.object({
  fullName: z.string().trim().min(2, 'At least 2 characters').max(100),
  phone: phone.or(z.literal('')),
  avatarUrl: z
    .string()
    .trim()
    .refine((v) => v === '' || z.url().safeParse(v).success, 'Enter a valid URL')
    .refine((v) => v.length <= 500, 'At most 500 characters'),
})

export type ProfileInput = z.infer<typeof profileSchema>

export function profilePayload(values: ProfileInput): {
  fullName: string
  phone: string | null
  avatarUrl: string | null
} {
  return {
    fullName: values.fullName,
    phone: values.phone === '' ? null : values.phone,
    avatarUrl: values.avatarUrl === '' ? null : values.avatarUrl,
  }
}
