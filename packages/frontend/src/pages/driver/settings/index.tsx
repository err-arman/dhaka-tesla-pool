import { DeleteAccount } from '@/components/delete-account'
import { ProfileForm } from '@/components/profile-form'

export default function DriverSettingsPage() {
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground text-sm">
          Your account details. The driver role itself is not editable here — it is set
          at signup or by an admin.
        </p>
      </div>

      <ProfileForm />
      <DeleteAccount />
    </div>
  )
}
