import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'

import { useAuth } from '@/hooks/use-auth'
import { homePathFor } from '@/lib/roles'
import { signupSchema, type Portal, type SignupInput } from '@/lib/schemas'
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

export default function SignupPage() {
  const { signup } = useAuth()
  const navigate = useNavigate()
  const [formError, setFormError] = useState<string | null>(null)

  const form = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      fullName: '',
      email: '',
      phone: '',
      password: '',
      confirmPassword: '',
      role: 'passenger',
    },
  })

  // The tab reads and writes the form, so the role has exactly one home and the
  // description below cannot drift out of sync with what will be submitted.
  // useWatch rather than form.watch(): the compiler cannot memoise form.watch, and
  // this is the subscription API meant for a field value used during render.
  const role = useWatch({ control: form.control, name: 'role' })

  const onSubmit = async (values: SignupInput) => {
    setFormError(null)
    try {
      // The backend treats an empty phone as absent, so send undefined, not ''.
      const user = await signup({
        fullName: values.fullName,
        email: values.email,
        phone: values.phone || undefined,
        password: values.password,
        role: values.role,
      })
      toast.success('Account created')
      // The granted role decides the landing page, not the tab: the server is the only
      // thing that knows what was actually granted. A driver can register a vehicle
      // straight away, so they go to the driver portal.
      navigate(homePathFor(user.role), { replace: true })
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message)
        // EMAIL_TAKEN and PHONE_TAKEN are per-field, so point at the field itself.
        const field = err.code === 'EMAIL_TAKEN' ? 'email' : err.code === 'PHONE_TAKEN' ? 'phone' : null
        if (field) {
          form.setError(field, { message: err.message })
          setFormError(null)
        }
        return
      }
      setFormError('Could not reach the server. Try again.')
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Create your account</CardTitle>
          <CardDescription>
            {role === 'driver'
              ? 'Sign up to drive — you can add your vehicle next'
              : 'Sign up to ride with Tesla Pool'}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {/*
           * Unlike login, this tab is a real decision: the role is sent to the
           * backend, which grants it and creates the driver profile in the same
           * transaction. The role lives in form state rather than component state so
           * it is validated and submitted with everything else.
           */}
          <Tabs
            value={role}
            onValueChange={(value) =>
              form.setValue('role', value as Portal, { shouldValidate: true })
            }
            className="mb-5"
          >
            <TabsList className="w-full" aria-label="Account type">
              <TabsTrigger value="passenger">Passenger</TabsTrigger>
              <TabsTrigger value="driver">Driver</TabsTrigger>
            </TabsList>
          </Tabs>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
              <FormField
                control={form.control}
                name="fullName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full name</FormLabel>
                    <FormControl>
                      <Input autoComplete="name" placeholder="Alice Ahmed" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

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
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Phone <span className="text-muted-foreground">(optional)</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="tel"
                        autoComplete="tel"
                        placeholder="+8801712345678"
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
                      <Input type="password" autoComplete="new-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm password</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="new-password" {...field} />
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
                {form.formState.isSubmitting ? 'Creating account…' : 'Create account'}
              </Button>
            </form>
          </Form>

          <p className="text-muted-foreground mt-4 text-center text-sm">
            Already have an account?{' '}
            <Link to="/signin" className="text-primary underline-offset-4 hover:underline">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  )
}
