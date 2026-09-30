import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { driversApi } from '@/lib/api'
import { ApiError, type DriverProfile } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

/**
 * The driver's own availability switch, separate from the admin-controlled approval
 * `status`. A button rather than a switch primitive: the project has none, and the
 * label already states the action, so the control is unambiguous either way.
 *
 * A driver who is not approved cannot go online, and one with no active vehicle is
 * rejected by the backend with 409 NO_ACTIVE_VEHICLE. The button is disabled in the
 * first case so the reason is visible before the click; the second is left to the
 * server, which is the only place that knows the current vehicle.
 */
export function DriverOnlineToggle({ profile }: { profile: DriverProfile }) {
  const queryClient = useQueryClient()
  const approved = profile.status === 'approved'

  const toggle = useMutation({
    // Send the opposite of what we hold, not a blind flip: a retry of the same intent
    // then lands on the same value instead of toggling back.
    mutationFn: () => driversApi.setOnline(!profile.isOnline),
    onSuccess: (updated) => {
      queryClient.setQueryData(['driver', 'me'], updated)
      toast.success(updated.isOnline ? 'You are online' : 'You are offline')
    },
    onError: (err) => {
      toast.error(
        err instanceof ApiError ? err.message : 'Could not change your availability',
      )
    },
  })

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>Availability</CardTitle>
          <Badge variant={profile.isOnline ? 'default' : 'secondary'}>
            {profile.isOnline ? 'Online' : 'Offline'}
          </Badge>
        </div>
        <CardDescription>
          {!approved
            ? 'Your account is not approved, so you cannot take passengers yet.'
            : profile.isOnline
              ? 'You are visible to passengers looking for a driver.'
              : 'Go online when you are ready to take passengers.'}
        </CardDescription>
      </CardHeader>

      <CardContent>
        <Button
          variant={profile.isOnline ? 'outline' : 'default'}
          disabled={!approved || toggle.isPending}
          onClick={() => toggle.mutate()}
        >
          {toggle.isPending
            ? 'Saving…'
            : profile.isOnline
              ? 'Go offline'
              : 'Go online'}
        </Button>
      </CardContent>
    </Card>
  )
}
