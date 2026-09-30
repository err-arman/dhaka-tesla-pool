import { useAuth } from "@/hooks/use-auth";
import { DeleteAccount } from "@/components/delete-account";
import { ProfileForm } from "@/components/profile-form";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/** Shown where the user has not set a value yet. */
const EMPTY = "—";

export default function PassengerProfilePage() {
  const { user } = useAuth();

  // RequireAuth only renders this once the session is authenticated.
  if (!user) return null;

  const initial = user.fullName.trim().charAt(0).toUpperCase() || "?";

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
        <p className="text-muted-foreground text-sm">Your account details.</p>
      </div>

      {/*
        The summary is read-only on purpose. `ProfileForm` below can only edit the three
        fields the backend accepts, and email is absent from `updateProfileSchema`
        entirely because changing it needs a verification flow. Without this card a
        passenger could never see their own email or role.
      */}
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>
            Your email and role are not editable here. The role is set at
            signup.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt=""
              className="size-16 rounded-full border object-cover"
            />
          ) : (
            <div className="bg-secondary text-secondary-foreground flex size-16 items-center justify-center rounded-full text-xl font-semibold">
              {initial}
            </div>
          )}

          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[8rem_1fr]">
            <dt className="text-muted-foreground text-sm">Full name</dt>
            <dd className="text-sm font-medium">{user.fullName || EMPTY}</dd>

            <dt className="text-muted-foreground text-sm">Email</dt>
            <dd className="text-sm">{user.email ?? EMPTY}</dd>

            <dt className="text-muted-foreground text-sm">Phone</dt>
            <dd className="text-sm">{user.phone ?? EMPTY}</dd>

            <dt className="text-muted-foreground text-sm">Role</dt>
            <dd className="text-sm">
              <Badge variant="secondary">{user.role}</Badge>
            </dd>
          </dl>
        </CardContent>
      </Card>

      <ProfileForm />
      <DeleteAccount />
    </div>
  );
}
