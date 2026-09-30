# Tesla Pool — frontend

Vite + React 19 + TypeScript, with shadcn/ui on Tailwind v4. Covers the auth flow
(signup, login, session persistence, sign-out) and the shared-ride flow: booking a ride,
matching it to an online driver, and driving a trip through to completion.

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

| Route          | Access                                                    |
| -------------- | --------------------------------------------------------- |
| `/signin`      | public, redirects to the role's own page when signed in   |
| `/signup`      | public, redirects when signed in; sends the chosen role   |
| `/`            | lands on `/driver` or `/passenger` by the user's own role |
| `/passenger/*` | requires a session; the landing area for non-drivers      |
| `/driver/*`    | requires a session **and** the `driver` role              |

Landing and gating both come from the role the server returned, not from UI state.
`lib/roles.ts` holds the two helpers: `isDriver(role)` and `homePathFor(role)`.

`/signin` and `/signup` are the only screens that are not inside a portal. Both the
driver and the passenger areas are built out; see the two sections below. Every page
component and every feature component is imported somewhere — the only unimported files
are the unused `separator` primitive and `vite-env.d.ts`.

## Structure

```
src/
  components/ui/   shadcn primitives (button, card, form, input, label, separator)
  hooks/           useAuth, route guards
  lib/             api client, zod schemas, types, roles, cn()
  pages/driver/    index (redirect), dashboard, vechile, incoming-request, settings
  pages/passenger/ index (redirect), profile, request
  pages/           signin, signup
  providers/       auth context and provider
```

## Scripts

```bash
bun run dev       # dev server
bun run build     # tsc -b && vite build
bun run lint      # eslint
bun run preview   # serve the production build
```

## Role selection

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

## Driver area

`DriverLayout` is the shell: a fixed left sidebar, a header, and an `<Outlet />`. It
renders only for a driver, because `RequireDriver` wraps the whole route. The four nav
items, in order:

| Route                     | Page                     | Shows                                        |
| ------------------------- | ------------------------ | -------------------------------------------- |
| `/driver/dashboard`       | `DriverDashboardPage`    | availability, vehicle status, approval status |
| `/driver/vechile`         | `DriverVehiclePage`      | register, edit seats, or remove the vehicle  |
| `/driver/incoming-request`| `DriverRequestsPage`     | nearby offers and the current trip, with the lifecycle actions |
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

`Incoming requests` polls `GET /ride-requests/driver/feed` every 10 seconds and renders
two things: the driver's **current trip** and nearby **offers**. An offer is a `matched`
pool on someone else's vehicle within 3 km of the driver's current area, which is why
going online asks for an area first — `DriverOnlineToggle` will not flip to online without
one, and going offline clears it.

Which action buttons appear is derived from the pool's status rather than stored in
state, so a stale page cannot offer an action that is no longer legal: `Accept` on
`matched`, then `Arrived` / `Start` / `Complete` as the trip progresses. The backend
re-checks every transition and answers `409 ILLEGAL_POOL_TRANSITION` regardless, and the
404 it returns for another driver's pool means "not yours" without confirming the pool
exists. A driver's own pool is never shown back to them as an offer.

Every action invalidates the feed query, so the driver sees the result of their own tap
without waiting for the next poll. Polling exists because the changes that matter are
made on *other* people's devices and there is no socket to push them.

The sidebar is `hidden md:flex`, so below `md` the nav moves into a scrollable header row
— four labels do not fit a phone, and the row scrolls sideways rather than wrapping the
header onto a second line.

## Passenger area

`PassengerLayout` is the same shell as the driver one — sidebar, header, `<Outlet />` —
and is a separate component on purpose rather than a shared shell parameterised by nav
items. Two nav items:

| Route                  | Page                    | Shows                                     |
| ---------------------- | ----------------------- | ----------------------------------------- |
| `/passenger/profile`   | `PassengerProfilePage`  | read-only summary, edit form, apply, delete |
| `/passenger/request`   | `PassengerRequestPage`  | booking form and this passenger's request history |

`/passenger` is the layout, not a page, so it redirects to `/passenger/profile`, and it
is where `homePathFor` sends a passenger — and an `admin`, who is not a driver.

**The passenger area is not role-gated.** It is wrapped in `RequireAuth` only, because
`homePathFor` deliberately routes every non-driver here. A driver who types
`/passenger/profile` by hand is not turned away; the driver area is the one that is
closed to non-drivers, and `RequireDriver` is the only role guard that exists.

The profile page is deliberately a summary *and* a form, in that order. `ProfileForm` can
only edit the three fields the backend accepts, and email is absent from
`updateProfileSchema` entirely because changing it needs a verification flow. The
read-only `Card` above it is therefore the only place a passenger can see their own
email or role. `PublicUser` has no `createdAt`, so there is no join date to show.

`ApplyToDrive` and `DeleteAccount` are rendered at the foot of the profile page. This is
the only area a passenger can reach, so it is where the apply CTA belongs.

A passenger signs up as a passenger and becomes a driver later with the Apply button
(`POST /drivers/apply`) in `ApplyToDrive`, which lives on the passenger profile page
rather than in the driver area for exactly the gating reason above. Applying **replaces**
the role in one transaction and refetches the user, so the next visit to `/` lands on
`/driver`.

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
  the reason shows before the click rather than after. Going online requires both an
  active vehicle and a **current area**, because the area is what matching measures the
  driver against: `currentZoneId` is required to go online and is cleared on going
  offline, so an offline driver is never treated as being somewhere. The area is chosen
  in a select rather than typed, since it comes from `GET /locations`. Going online with
  no vehicle is left to the server, which answers `409 NO_ACTIVE_VEHICLE`; the toggle
  shows that message verbatim.
- `VehicleCard` uses **PUT** to register and **PATCH** to change seats, with a
  `mode` prop choosing the verb and the schema. PATCH requires a value because the
  backend refuses an empty body; PUT allows an empty one so the server can apply its
  column default.

## The ride flow

The passenger page is a booking form plus this passenger's history, and it polls
`GET /ride-requests/mine` every 10 seconds because a driver accepting a pool is a change
on another device. Pickup, destination and seats all come from `GET /locations`, so a
request can never be invalid for want of a map.

Two details on that page are easy to get wrong:

- **No fare is shown until the request is matched.** A fresh request comes back with
  `fareAmount: 0`, which is not a price of zero — it is "not priced yet", because the
  fare depends on who else ends up sharing the ride. Rendering it as ৳0 would be a lie,
  so the list says "Fare pending" until matching sets it.
- **The form is disabled while a trip is live.** A passenger may hold one request at a
  time while it is `requested`, `matched` or `in_progress`; the backend enforces it with
  a partial unique index and answers `409 RIDE_ALREADY_IN_PROGRESS`. `liveRequest` is
  derived from the same polled list the page renders, not from a second request, so the
  notice and the list cannot disagree and it clears itself on the next poll once the trip
  completes. The rule is surfaced here so the passenger finds out before filling in a
  form, rather than after submitting it. Once the trip is `completed` or `cancelled` the
  button comes back on its own — the passenger can book again.

`LIVE_RIDE_REQUEST_STATUSES` in `lib/types.ts` mirrors the backend's index predicate. If
one side changes the other has to follow, or the UI will enable a button the server
refuses.

### Cancelling

Each request in the history carries a **Cancel request** button, but only while the server
would accept it — `requested` and `matched`. `in_progress` gets no button: the car has
moved, the passenger is in it, and the driver owns what happens next. The status is
re-checked server-side regardless, so a stale page gets a 409 rather than a wrong outcome.

It is two-step rather than a dialog, because the project has no dialog primitive and adding
`@radix-ui/react-dialog` for one button is not worth a dependency — the same reasoning
`DeleteAccount` uses for its typed confirmation, one step lighter. `confirmingId` holds the
single row awaiting confirmation, so the Confirm/Keep buttons replace the cancel button
instead of stacking beside it.

`onSuccess` **invalidates** the `['ride-requests','mine']` query instead of patching the
returned status into the list. The server only returns the new status, but cancelling
changes more than that: the seat went back, the pool may have been cancelled, and anyone
left sharing it was re-priced. Refetching keeps the row consistent with the rest of the
list rather than showing a stale fare next to a cancelled badge.

A cancelled request keeps the fare it was quoted, and the list still renders it — it is a
record of what the trip would have cost, not a price of zero. Once cancelled, the
one-live-request rule no longer blocks the passenger, so the form's disabled state clears
on the next poll without a page reload.

## Not built yet

Payments. Fares are computed and stored as integer poisha and shown, but nothing charges
anything — there is no payment method, gateway or transaction table.

Driver-side cancellation. A passenger can cancel their own booking, but a driver cannot
cancel a trip. Abandoning passengers who are already in the car needs a rule about where
they go and whether they are refunded, so there is no driver action for it and the driver
feed has no cancel button.

Password reset and email verification stay as they were: no routes, tables or tokens.

Password reset, email verification and change-password. There are no routes, tables
or tokens for any of them, so a user who forgets their password is locked out.
