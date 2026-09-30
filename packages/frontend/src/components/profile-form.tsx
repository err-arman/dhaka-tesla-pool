import { useForm } from 'react-hook-form'
import { useMutation } from '@tanstack/react-query'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'

import { useAuth } from '@/hooks/use-auth'
import { usersApi } from '@/lib/api'
import { profilePayload, profileSchema, type ProfileInput } from '@/lib/schemas'
import { ApiError } from '@/lib/types'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'

/**
 * Edits the three fields the backend allows. Email is not here on purpose: changing
 * it needs a verification step, and `updateProfileSchema` has no email key at all.
 */
export function ProfileForm() {
  const { user, refreshUser } = useAuth()

  const form = useForm<ProfileInput>({
    resolver: zodResolver(profileSchema),
    // Seeded once. `values` is deliberately not used: a fresh object literal on
    // every render would reset the form and wipe what the user is typing.
    defaultValues: {
      fullName: user?.fullName ?? '',
      phone: user?.phone ?? '',
      avatarUrl: user?.avatarUrl ?? '',
    },
  })

  const save = useMutation({
    mutationFn: (values: ProfileInput) => usersApi.update(profilePayload(values)),
    onSuccess: async (updated) => {
      // The auth context holds the user, so the header and the role list only update
      // once it is refetched. Resetting from the response is what re-seeds the form
      // with what the server actually stored.
      await refreshUser()
      form.reset({
        fullName: updated.fullName,
        phone: updated.phone ?? '',
        avatarUrl: updated.avatarUrl ?? '',
      })
      toast.success('Profile updated')
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        // VALIDATION_ERROR arrives as issues keyed by field path; PHONE_TAKEN has no
        // path, only a code, because it comes from the unique index and not the schema.
        const fields = err.fieldErrors
        const field = (['fullName', 'phone', 'avatarUrl'] as const).find((k) => k in fields)
        if (field) {
          form.setError(field, { message: fields[field] })
          return
        }
        if (err.code === 'PHONE_TAKEN') {
          form.setError('phone', { message: err.message })
          return
        }
        toast.error(err.message)
        return
      }
      toast.error('Could not save your profile')
    },
  })

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => save.mutate(values))}
        className="grid gap-4"
      >
        <FormField
          control={form.control}
          name="fullName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Full name</FormLabel>
              <FormControl>
                <Input autoComplete="name" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Phone</FormLabel>
              <FormControl>
                <Input autoComplete="tel" placeholder="+8801712345678" {...field} />
              </FormControl>
              <FormDescription>International format. Leave empty to remove it.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="avatarUrl"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Avatar URL</FormLabel>
              <FormControl>
                <Input placeholder="https://…" {...field} />
              </FormControl>
              <FormDescription>Leave empty to remove it.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" disabled={save.isPending} className="justify-self-start">
          {save.isPending ? 'Saving…' : 'Save changes'}
        </Button>
      </form>
    </Form>
  )
}
