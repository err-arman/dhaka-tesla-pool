import { Navigate } from 'react-router-dom'

/**
 * `/passenger` is the layout, not a page. The profile lives at `/passenger/profile`, and
 * `homePathFor` sends every non-driver here, so this forwards to the canonical path
 * instead of letting the profile answer to the parent address as well.
 */
export default function PassengerIndexPage() {
  return <Navigate to="/passenger/profile" replace />
}
