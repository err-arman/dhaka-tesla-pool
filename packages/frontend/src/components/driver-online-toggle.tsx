import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { driversApi, locationsApi } from '@/lib/api'
import { ApiError, type DriverProfile, type Location } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'

/**
 * The driver's own availability switch, separate from the admin-controlled approval
 * `status`.
 *
 * Going online requires picking a current area, because that is what makes the driver's
 * feed geographic: matching measures a driver's distance to a pool's pickup from it. The
 * area is chosen before the button is pressed rather than after, since the backend
 * rejects an online request without one and the driver would see a failure for something
 * the form could have asked.
 */
export function DriverOnlineToggle({ profile }: { profile: DriverProfile }) {
  const queryClient = useQueryClient()
  const approved = profile.status === 'approved'
  const [zone, setZone] = useState(profile.currentZoneId ?? '')

  const locations = useQuery<Location[]>({
    queryKey: ['locations'],
    queryFn: locationsApi.list,
    staleTime: 5 * 60_000,
  })

  const toggle = useMutation({
    // Sends the opposite of what we hold, not a blind flip: a retry of the same intent
    // then lands on the same value instead of toggling back.
    mutationFn: () =>
      driversApi.setOnline(!profile.isOnline, profile.isOnline ? null : zone),
    onSuccess: (updated) => {
      queryClient.setQueryData(['driver', 'me'], updated)
      /*
       * Coming online runs matching on the server, so any waiting request may now have
       * been placed in this driver's feed. Invalidating it here means the offer list
       * updates on the same screen rather than on the next poll tick.
       */
      if (updated.isOnline) {
        void queryClient.invalidateQueries({ queryKey: ['driver', 'feed'] })
      }
      toast.success(updated.isOnline ? 'You are online' : 'You are offline')
    },
    onError: (err) => {
      toast.error(
        err instanceof ApiError ? err.message : 'Could not change your availability',
      )
    },
  })

  const goingOnline = !profile.isOnline
  const needsZone = goingOnline && !zone

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
              ? 'You are visible to passengers looking for a driver near your current area.'
              : 'Go online when you are ready to take passengers.'}
        </CardDescription>
      </CardHeader>

      <CardContent className="grid gap-4">
        {/*
          The area picker is only shown when going online. While offline the server
          ignores it and clears the stored zone, so asking would be a question with no
          answer.
        */}
        {goingOnline && (
          <div className="grid gap-2">
            <Label htmlFor="driver-current-zone">Current area</Label>
            <Select
              id="driver-current-zone"
              value={zone}
              onChange={(event) => setZone(event.target.value)}
              disabled={locations.isLoading}
            >
              <option value="">{locations.isLoading ? 'Loading areas…' : 'Choose an area'}</option>
              {(locations.data ?? []).map((area) => (
                <option key={area.id} value={area.id}>
                  {area.name}
                </option>
              ))}
            </Select>
            <p className="text-muted-foreground text-sm">
              Only requests picking up within 3 km of this area are offered to you.
            </p>
          </div>
        )}

        <Button
          variant={profile.isOnline ? 'outline' : 'default'}
          disabled={!approved || toggle.isPending || needsZone}
          className="justify-self-start"
          onClick={() => toggle.mutate()}
        >
          {toggle.isPending
            ? 'Saving…'
            : profile.isOnline
              ? 'Go offline'
              : 'Go online'}
        </Button>

        {needsZone && (
          <p className="text-muted-foreground text-sm">
            Choose your current area to go online.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
