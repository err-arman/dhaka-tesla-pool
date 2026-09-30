import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'

/** Placeholder until the driver area is built. */
export default function DriverPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [signingOut, setSigningOut] = useState(false)

  const signOut = async () => {
    setSigningOut(true)
    try {
      await logout()
      toast.success('Signed out')
      navigate('/signin', { replace: true })
    } finally {
      setSigningOut(false)
    }
  }

  // RequireDriver has already checked the role, and RequireAuth the session.
  if (!user) return null

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="grid justify-items-start gap-4">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Driver</h1>
          <p className="text-muted-foreground text-sm">
            Signed in as {user.fullName} — role: {user.role}
          </p>
        </div>
        <Button variant="outline" onClick={signOut} disabled={signingOut}>
          {signingOut ? 'Signing out…' : 'Sign out'}
        </Button>
      </div>
    </main>
  )
}
