import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { authApi, setSessionEndedHandler, usersApi } from '@/lib/api'
import type { Portal } from '@/lib/schemas'
import { tokenStore, type AuthResult, type PublicUser } from '@/lib/types'
import { AuthContext, type AuthContextValue, type AuthStatus } from './auth-context'

export function AuthProvider({ children }: { children: ReactNode }) {
  /*
   * 'loading' is the initial value whenever a token exists, because a reload keeps the
   * tokens but loses the user object. Deriving the initial state here means the
   * signed-out case never needs an effect to correct it, which avoids the
   * setState-in-effect cascade.
   */
  const [user, setUser] = useState<PublicUser | null>(null)
  const [status, setStatus] = useState<AuthStatus>(() =>
    tokenStore.getAccess() || tokenStore.getRefresh() ? 'loading' : 'anonymous'
  )
  const queryClient = useQueryClient()

  /*
   * Re-hydrate once on mount. If the refresh token is no longer valid this request
   * 401s, the api client clears storage, and we settle as anonymous.
   */
  useEffect(() => {
    if (!tokenStore.getAccess() && !tokenStore.getRefresh()) return

    let cancelled = false

    usersApi
      .me()
      .then((me) => {
        if (cancelled) return
        setUser(me)
        setStatus('authenticated')
      })
      .catch(() => {
        if (cancelled) return
        tokenStore.clear()
        setUser(null)
        setStatus('anonymous')
      })

    return () => {
      cancelled = true
    }
  }, [])

  const adopt = useCallback((result: AuthResult) => {
    tokenStore.set(result)
    setUser(result.user)
    setStatus('authenticated')
  }, [])

  const login = useCallback(
    async (input: { email: string; password: string }) => {
      adopt(await authApi.login(input))
    },
    [adopt]
  )

  const signup = useCallback(
    async (input: {
      fullName: string
      email: string
      phone?: string
      password: string
      role: Portal
    }) => {
      adopt(await authApi.signup(input))
    },
    [adopt]
  )

  const endSession = useCallback(() => {
    tokenStore.clear()
    setUser(null)
    setStatus('anonymous')
    // Drop any cached server data, so the next sign-in cannot read the old account.
    queryClient.clear()
  }, [queryClient])

  /*
   * The api client evicts the tokens itself when a refresh fails, but it has no way
   * to reach React state. Without this bridge the provider would keep reporting
   * 'authenticated' after the tokens were gone, and the user would sit on a page
   * where every request fails. endSession is idempotent, so re-clearing is fine.
   */
  useEffect(() => {
    setSessionEndedHandler(endSession)
    return () => setSessionEndedHandler(null)
  }, [endSession])

  const logout = useCallback(async () => {
    const refreshToken = tokenStore.getRefresh()
    // Clear locally first: signing out must succeed even if the network is down.
    endSession()
    if (refreshToken) {
      await authApi.logout(refreshToken).catch(() => undefined)
    }
  }, [endSession])

  const refreshUser = useCallback(async () => {
    setUser(await usersApi.me())
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, login, signup, logout, refreshUser }),
    [status, user, login, signup, logout, refreshUser]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
