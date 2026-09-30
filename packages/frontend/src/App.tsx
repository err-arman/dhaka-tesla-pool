import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'

import { AuthProvider } from '@/providers/auth-provider'
import {
  HomeRedirect,
  RedirectIfAuthenticated,
  RequireAuth,
  RequireDriver,
} from '@/hooks/use-guarded-route'
import SigninPage from '@/pages/signin'
import SignupPage from '@/pages/signup'
import PassengerPage from '@/pages/passenger'
import DriverPage from '@/pages/driver'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // The api client already retries once on a 401 by refreshing the token, so a
      // short staleTime avoids refetching the same data on every component mount.
      staleTime: 30_000,
      retry: false,
    },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route
              path="/signin"
              element={
                <RedirectIfAuthenticated>
                  <SigninPage />
                </RedirectIfAuthenticated>
              }
            />
            <Route
              path="/signup"
              element={
                <RedirectIfAuthenticated>
                  <SignupPage />
                </RedirectIfAuthenticated>
              }
            />

            {/* Post-auth landing pages. Still placeholders. */}
            <Route
              path="/passenger"
              element={
                <RequireAuth>
                  <PassengerPage />
                </RequireAuth>
              }
            />
            <Route
              path="/driver"
              element={
                <RequireAuth>
                  <RequireDriver>
                    <DriverPage />
                  </RequireDriver>
                </RequireAuth>
              }
            />

            {/* `/` and anything unmatched land by role, not on a fixed page. */}
            <Route path="/" element={<HomeRedirect />} />
            <Route path="*" element={<HomeRedirect />} />
          </Routes>
          <Toaster richColors position="top-center" />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
