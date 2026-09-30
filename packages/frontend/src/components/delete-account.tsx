import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'

import { useAuth } from '@/hooks/use-auth'
import { usersApi } from '@/lib/api'
import { ApiError } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const CONFIRM_WORD = 'DELETE'

/**
 * There is no dialog primitive in the project, so this is an inline two-step
 * confirmation instead of adding a dependency: the destructive button reveals a
 * field, and the real button only enables once the word is typed exactly.
 *
 * Deleting is a soft delete and revokes every session server-side, so this also
 * signs the user out. `logout()` is still called because it clears the local token
 * and query cache, and the revoke call it makes is a no-op after the delete.
 */
export function DeleteAccount() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [armed, setArmed] = useState(false)
  const [typed, setTyped] = useState('')

  const remove = useMutation({
    mutationFn: usersApi.remove,
    onSuccess: async () => {
      await logout()
      toast.success('Account deleted')
      navigate('/login', { replace: true })
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Could not delete the account')
    },
  })

  if (!armed) {
    return (
      <div className="grid gap-2">
        <Button
          variant="destructive"
          size="sm"
          className="justify-self-start"
          onClick={() => setArmed(true)}
        >
          Delete account
        </Button>
        <p className="text-muted-foreground text-sm">
          Deactivates the account and signs out every device. Your vehicle registration
          goes with it.
        </p>
      </div>
    )
  }

  const confirmed = typed === CONFIRM_WORD

  return (
    <div className="grid gap-3">
      <Label htmlFor="confirm-delete">
        Type <span className="font-mono font-semibold">{CONFIRM_WORD}</span> to confirm
      </Label>
      <Input
        id="confirm-delete"
        value={typed}
        autoComplete="off"
        autoFocus
        onChange={(e) => setTyped(e.target.value)}
        placeholder={CONFIRM_WORD}
      />
      <div className="flex gap-2">
        <Button
          variant="destructive"
          size="sm"
          disabled={!confirmed || remove.isPending}
          onClick={() => remove.mutate()}
        >
          {remove.isPending ? 'Deleting…' : 'Permanently delete'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={remove.isPending}
          onClick={() => {
            setArmed(false)
            setTyped('')
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  )
}
