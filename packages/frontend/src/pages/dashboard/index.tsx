import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { useAuth } from '@/hooks/use-auth'
import { DeleteAccount } from '@/components/delete-account'
import { ProfileForm } from '@/components/profile-form'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

export default function DashboardPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)

  const signOut = async () => {
    setBusy(true)
    try {
      await logout()
      toast.success('Signed out')
      navigate('/login', { replace: true })
    } finally {
      setBusy(false)
    }
  }

  // `user` is guaranteed non-null: RequireAuth only renders once status is authenticated.
  if (!user) return null

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Welcome, {user.fullName}
          </h1>
          <p className="text-muted-foreground text-sm">
            Signed in as {user.email ?? 'no email on file'}
          </p>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Your details, and the sign-in for this session</CardDescription>
        </CardHeader>

        <CardContent className="grid gap-4">
          <dl className="grid gap-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">User ID</dt>
              <dd className="font-mono text-xs break-all">{user.id}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Email</dt>
              <dd className="truncate">{user.email ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Roles</dt>
              <dd className="flex flex-wrap justify-end gap-1">
                {user.roles.map((role) => (
                  <span
                    key={role}
                    className="bg-secondary text-secondary-foreground rounded-md px-2 py-0.5 text-xs font-medium"
                  >
                    {role}
                  </span>
                ))}
              </dd>
            </div>
          </dl>

          <Separator />

          <ProfileForm />

          <Separator />

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={busy} onClick={() => void signOut()}>
              Sign out
            </Button>
          </div>

          <Separator />

          <DeleteAccount />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Next up</CardTitle>
          <CardDescription>Driver registration and vehicles</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Apply to drive and register your vehicle from the driver portal. Both flows
            are live; rides, fares and payments are not built yet.
          </p>
          <Button variant="outline" className="mt-4" asChild>
            <Link to="/driver">Open driver portal</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  )
}
