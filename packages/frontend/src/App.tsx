import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'

import { AuthProvider } from '@/providers/auth-provider'
import {
  RedirectIfAuthenticated,
  RequireAuth,
} from '@/hooks/use-guarded-route'
import { DriverLayout } from '@/components/driver-layout'
import LoginPage from '@/pages/login'
import SignupPage from '@/pages/signup'
import DashboardPage from '@/pages/dashboard'
import DriverDashboardPage from '@/pages/driver-dashboard'
import DriverVehiclePage from '@/pages/driver-vehicle'

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
              path="/login"
              element={
                <RedirectIfAuthenticated>
                  <LoginPage />
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
            <Route
              path="/dashboard"
              element={
                <RequireAuth>
                  <DashboardPage />
                </RequireAuth>
              }
            />

            {/* The driver area is its own shell: sidebar, header and nested routes. */}
            <Route
              path="/driver"
              element={
                <RequireAuth>
                  <DriverLayout />
                </RequireAuth>
              }
            >
              <Route index element={<DriverDashboardPage />} />
              <Route path="vehicle" element={<DriverVehiclePage />} />
            </Route>

            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
          <Toaster richColors position="top-center" />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
