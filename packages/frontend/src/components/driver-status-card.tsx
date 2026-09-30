import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import type { DriverProfile, DriverStatus } from '@/lib/types'

/** Maps the database enum to a badge variant and a human label. */
const statusMeta: Record<DriverStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  approved: { label: 'Approved', variant: 'default' },
  pending: { label: 'Pending review', variant: 'secondary' },
  rejected: { label: 'Rejected', variant: 'destructive' },
  suspended: { label: 'Suspended', variant: 'destructive' },
}

export function DriverStatusCard({ profile }: { profile: DriverProfile }) {
  const meta = statusMeta[profile.status]
  const approved = profile.status === 'approved'

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>Driver status</CardTitle>
          <Badge variant={meta.variant}>{meta.label}</Badge>
        </div>
        <CardDescription>
          {approved
            ? 'You can add and edit vehicles.'
            : profile.status === 'pending'
              ? 'An admin has to approve you before you can manage vehicles.'
              : 'Vehicle management is unavailable while your account is not approved.'}
        </CardDescription>
      </CardHeader>

      <CardContent>
        <p className="text-muted-foreground text-sm">
          Registered on{' '}
          <time dateTime={profile.createdAt}>
            {new Date(profile.createdAt).toLocaleDateString(undefined, {
              dateStyle: 'medium',
            })}
          </time>
        </p>
      </CardContent>
    </Card>
  )
}
