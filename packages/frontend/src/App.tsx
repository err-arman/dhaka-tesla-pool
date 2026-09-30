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
import { DriverLayout } from '@/components/driver-layout'
import { PassengerLayout } from '@/components/passenger-layout'
import SigninPage from '@/pages/signin'
import SignupPage from '@/pages/signup'
import PassengerIndexPage from '@/pages/passenger'
import PassengerProfilePage from '@/pages/passenger/profile'
import PassengerRequestPage from '@/pages/passenger/request'
import DriverIndexPage from '@/pages/driver'
import DriverDashboardPage from '@/pages/driver/dashboard'
import DriverVehiclePage from '@/pages/driver/vechile'
import DriverRequestsPage from '@/pages/driver/incoming-request'
import DriverSettingsPage from '@/pages/driver/settings'

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

            {/*
              The passenger area is its own shell, same shape as the driver one. It is
              gated on a session only and not on a role, because `homePathFor` sends
              every non-driver here, admins included.
            */}
            <Route
              path="/passenger"
              element={
                <RequireAuth>
                  <PassengerLayout />
                </RequireAuth>
              }
            >
              <Route index element={<PassengerIndexPage />} />
              <Route path="profile" element={<PassengerProfilePage />} />
              <Route path="request" element={<PassengerRequestPage />} />
            </Route>
            {/* The driver area is its own shell: sidebar, header and nested routes. */}
            <Route
              path="/driver"
              element={
                <RequireAuth>
                  <RequireDriver>
                    <DriverLayout />
                  </RequireDriver>
                </RequireAuth>
              }
            >
              <Route index element={<DriverIndexPage />} />
              <Route path="dashboard" element={<DriverDashboardPage />} />
              <Route path="vechile" element={<DriverVehiclePage />} />
              <Route path="incoming-request" element={<DriverRequestsPage />} />
              <Route path="settings" element={<DriverSettingsPage />} />
            </Route>

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
