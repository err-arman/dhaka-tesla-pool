import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'

import { useAuth } from '@/hooks/use-auth'
import { loginSchema, type LoginInput, type Portal } from '@/lib/schemas'
import { ApiError } from '@/lib/types'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [portal, setPortal] = useState<Portal>('passenger')
  const [formError, setFormError] = useState<string | null>(null)

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  const onSubmit = async (values: LoginInput) => {
    setFormError(null)
    try {
      /*
       * The tab is not an auth decision. The backend has a single /auth/login and
       * hands back the roles it actually holds, so we send the same request either
       * way and only choose the landing page from the chosen tab. A passenger who
       * picks the driver tab still lands on the driver area, where the backend's
       * guard decides they may not add vehicles.
       */
      await login(values)
      toast.success('Signed in')
      navigate(portal === 'driver' ? '/driver' : '/dashboard', { replace: true })
    } catch (err) {
      // The backend returns one message for a wrong email, a wrong password and a
      // disabled account alike, so there is nothing more specific to show.
      setFormError(
        err instanceof ApiError ? err.message : 'Could not reach the server. Try again.'
      )
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Welcome back</CardTitle>
          <CardDescription>Sign in to your Tesla Pool account</CardDescription>
        </CardHeader>

        <CardContent>
          <Tabs
            value={portal}
            onValueChange={(value) => setPortal(value as Portal)}
            className="mb-5"
          >
            <TabsList className="w-full" aria-label="Portal">
              <TabsTrigger value="passenger">Passenger</TabsTrigger>
              <TabsTrigger value="driver">Driver</TabsTrigger>
            </TabsList>
          </Tabs>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        autoComplete="email"
                        placeholder="you@example.com"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="current-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {formError && (
                <p role="alert" className="text-destructive text-sm">
                  {formError}
                </p>
              )}

              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting
                  ? 'Signing in…'
                  : portal === 'driver'
                    ? 'Sign in as driver'
                    : 'Sign in'}
              </Button>
            </form>
          </Form>

          <p className="text-muted-foreground mt-4 text-center text-sm">
            No account yet?{' '}
            <Link to="/signup" className="text-primary underline-offset-4 hover:underline">
              Create one
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  )
}
