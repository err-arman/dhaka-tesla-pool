import { createContext } from 'react'
import type { Portal } from '@/lib/schemas'
import type { PublicUser } from '@/lib/types'

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous'

export type AuthContextValue = {
  status: AuthStatus
  user: PublicUser | null
  login: (input: { email: string; password: string }) => Promise<void>
  signup: (input: {
    fullName: string
    email: string
    phone?: string
    password: string
    role: Portal
  }) => Promise<void>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
