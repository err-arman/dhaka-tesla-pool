import { Navigate } from 'react-router-dom'

/**
 * `/driver` is the layout, not a page. The dashboard lives at `/driver/dashboard`, so
 * this sends the address bar to the canonical path. A driver signing in lands on
 * `/driver` via homePathFor and is forwarded from here, which keeps the dashboard at a
 * single address instead of also answering to the parent.
 */
export default function DriverIndexPage() {
  return <Navigate to="/driver/dashboard" replace />
}
