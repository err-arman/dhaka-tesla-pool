# Tesla Pool — frontend

Vite + React 19 + TypeScript, with shadcn/ui on Tailwind v4. Currently covers the
auth flow: signup, login, session persistence, and sign-out.

## Setup

```bash
bun install
bun run dev        # http://localhost:5173
```

The API must be running on port 8080. From the repo root, `bun run dev` starts both
via mprocs.

## Env

| Variable       | Default                     | Purpose                        |
| -------------- | --------------------------- | ------------------------------ |
| `VITE_API_URL` | `http://localhost:8080/api/v1` | Backend origin, `/api/v1` included |

Copy `.env.example` to `.env` to change it. The backend's `CORS_ORIGINS` must list
the frontend origin — it currently allows only `http://localhost:5173`, so Vite
falling back to 5174 will be blocked by CORS.

## Auth design

- Tokens live in `localStorage` under `tesla-pool.accessToken` / `tesla-pool.refreshToken`.
  A page reload keeps the session, and the backend has no cookie session to fall back on.
  A stricter deployment would move the refresh token to an httpOnly cookie.
- `src/lib/api.ts` refreshes automatically on a `401`: it swaps the tokens and replays
  the original request once. Concurrent 401s share a single in-flight refresh, because
  the backend rotates the refresh token and two parallel refreshes would sign the user out.
- `AuthProvider` re-hydrates the user on mount via `GET /users/me`, so `status` is
  `loading` until that resolves. `RequireAuth` renders nothing while loading, which
  avoids flashing the login screen at a signed-in user.
- Sign out clears local state and cache first, then revokes the one refresh token it
  held, so it still works offline. There is no "sign out everywhere": the backend has no
  such route, and revoking another device's session from a shared browser is a foot-gun.
- If a refresh fails, `src/lib/api.ts` evicts the tokens and calls the handler
  `AuthProvider` registers, so an expired session lands on the login screen instead of
  stranding the user on a page where every request 401s.
- The zod schemas in `src/lib/schemas.ts` mirror the backend's, but only for instant
  feedback. The backend validates every request again and its response wins on conflict.

## Routes

| Route        | Access                                                     |
| ------------ | ---------------------------------------------------------- |
| `/signin`    | public, redirects to the role's own page when signed in     |
| `/signup`    | public, redirects when signed in; sends the chosen role      |
| `/`          | lands on `/driver` or `/passenger` by the user's own role   |
| `/passenger` | requires a session; the landing page for non-drivers         |
| `/driver/*`  | requires a session **and** the `driver` role                 |

Landing and gating both come from the role the server returned, not from UI state.
`lib/roles.ts` holds the two helpers: `isDriver(role)` and `homePathFor(role)`.

`/passenger` is still a placeholder, so `/signin` and `/signup` are the only fully built
passenger-side screens. The whole driver area is built out; see Driver area below. The
one component left unimported is `apply-to-drive`, which belongs on `/passenger` and is
waiting for that page to be built.

## Structure

```
src/
  components/ui/   shadcn primitives (button, card, form, input, label, separator)
  hooks/           useAuth, route guards
  lib/             api client, zod schemas, types, roles, cn()
  pages/driver/    index (redirect), dashboard, vechile, incoming-request, settings
  pages/           signin, signup, passenger
  providers/       auth context and provider
```

## Scripts

```bash
bun run dev       # dev server
bun run build     # tsc -b && vite build
bun run lint      # eslint
bun run preview   # serve the production build
```

## Driver area

`/signin` and `/signup` both have a Passenger | Driver tab, but only one of them
grants anything:

- **On signup** the tab is a real decision. The chosen `role` is sent to the server,
  which grants it and creates the driver profile in the same transaction. A driver can
  therefore register a vehicle straight away.
- **On login** the tab only expresses intent. There is one `/auth/login`, the server
  returns the single role the account holds, and that decides the landing page. A
  passenger who picks the Driver tab is told they have no driver role and lands on
  `/passenger` instead of being shown the driver portal and bounced.

Both login and signup route on the user object the server returned rather than reading
`user` from context afterwards, which would still be stale at that point in the render.

The signup tab lives in form state (`role`, read with `useWatch`) rather than component
state, so the tab, the card description and the submitted payload cannot disagree.
`admin` is not an option on either tab; the server rejects it.

### Why only `/driver` is gated

An account holds exactly one role, so `RequireDriver` is a plain comparison: anything
that is not a driver is redirected to `/passenger`. `/passenger` is not gated, because
nothing needs to keep a driver out of it — a driver with a passenger role is no longer a
state the database can represent.

`POST /drivers/apply` **replaces** `passenger` with `driver` rather than adding to it, so
applying permanently gives up the passenger role. The one-way nature of that is the
intended trade for now: the two portals are cleanly separate, and if a driver ever needs
to be a passenger again, that is a deliberate role change rather than an accident of
ordering.

An `admin` is not a driver, so `homePathFor('admin')` returns `/passenger`. Admins have no
portal of their own yet.

### Driver area

`DriverLayout` is the shell: a fixed left sidebar, a header, and an `<Outlet />`. It
renders only for a driver, because `RequireDriver` wraps the whole route. The four nav
items, in order:

| Route                     | Page                     | Shows                                        |
| ------------------------- | ------------------------ | -------------------------------------------- |
| `/driver/dashboard`       | `DriverDashboardPage`    | availability, vehicle status, approval status |
| `/driver/vechile`         | `DriverVehiclePage`      | register, edit seats, or remove the vehicle  |
| `/driver/incoming-request`| `DriverRequestsPage`     | placeholder, no backend yet                  |
| `/driver/settings`        | `DriverSettingsPage`     | profile edit and delete account              |

`/driver` is the layout, not a page, so it redirects to `/driver/dashboard`. That keeps
the dashboard at one address instead of also answering to the parent, and it is where
`homePathFor` sends a driver who has just signed in.

On the dashboard the order is deliberate: **availability first**, because whether the
driver is currently taking passengers is the one thing they open the page to find. Then
the vehicle summary, then the approval status. `DriverOnlineToggle` and
`DriverVehicleSummary` both read the same query keys the dedicated pages use
(`['driver','me']` and `['vehicle']`), so the dashboard and the vehicle page render from
one cache entry and registering a vehicle on either updates both.

`Incoming requests` is an honest placeholder. Rides, fares and payments do not exist
yet, so there is no endpoint to list requests from and nothing to accept or reject; the
page says so rather than rendering invented rows.

The sidebar is `hidden md:flex`, so below `md` the nav moves into a scrollable header row
— four labels do not fit a phone, and the row scrolls sideways rather than wrapping the
header onto a second line.

A passenger signs up as a passenger and becomes a driver later with the Apply button
(`POST /drivers/apply`) in `ApplyToDrive`, which is rendered on `/passenger` rather than
in the driver area for exactly the gating reason above. Applying **replaces** the role in
one transaction and refetches the user, so the next visit to `/` lands on `/driver`.

A driver has at most one active vehicle, so `VehicleCard` renders a single vehicle
rather than a list. A `404` from `GET /vehicles` means "not registered yet" and
shows the register form instead of an error. `PUT` is an upsert, `PATCH` is a partial
change that `404`s when there is nothing to change, and `DELETE` is a soft delete, so
a removed driver can register again.

## Account management

`/passenger` carries the whole account surface, because it is where the signed-in
user already lands:

- `ProfileForm` edits `fullName`, `phone` and `avatarUrl`. Email has no input on
  purpose — the backend has no email key, since changing it needs a verification step.
  The form holds `''` for an unset column and `profilePayload` turns that into `null`,
  which is how a field gets **cleared**; sending an empty string would fail the format
  check instead. After a save it calls `refreshUser()` and then `form.reset()` from
  the response, so the header and the form re-seed from what the server actually
  stored. It uses `defaultValues`, not `values`, because a fresh object literal on
  every render would reset the form mid-typing.
- `DeleteAccount` is a typed confirmation rather than a dialog: the project has no
  dialog primitive, and adding `@radix-ui/react-dialog` for one destructive button is
  not worth a dependency. The button reveals a field that must read `DELETE` exactly.
- `DriverOnlineToggle` is the driver's own availability switch, kept separate from the
  admin-controlled approval `status`: approval is "may this person drive", online is
  "are they working now". The button is disabled when the account is not approved, so
  the reason shows before the click rather than after. Going online with no vehicle is
  left to the server, which answers `409 NO_ACTIVE_VEHICLE`; the toggle shows that
  message verbatim.
- `VehicleCard` uses **PUT** to register and **PATCH** to change seats, with a
  `mode` prop choosing the verb and the schema. PATCH requires a value because the
  backend refuses an empty body; PUT allows an empty one so the server can apply its
  column default.

## Not built yet

Password reset, email verification and change-password. There are no routes, tables
or tokens for any of them, so a user who forgets their password is locked out.
