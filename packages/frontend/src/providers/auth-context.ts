import { createContext } from 'react'
import type { Portal } from '@/lib/schemas'
import type { PublicUser } from '@/lib/types'

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous'

export type AuthContextValue = {
  status: AuthStatus
  user: PublicUser | null
  /** Resolves with the user the server returned, so callers can route on its role. */
  login: (input: { email: string; password: string }) => Promise<PublicUser>
  signup: (input: {
    fullName: string
    email: string
    phone?: string
    password: string
    role: Portal
  }) => Promise<PublicUser>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
