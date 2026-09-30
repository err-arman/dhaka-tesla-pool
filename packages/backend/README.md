# Tesla Pool — Backend

REST API for the accounts side of a ride-sharing app: users, roles, driver
registration, vehicles and authentication.

- **Runtime** Bun, TypeScript (strict)
- **Framework** Express 5
- **Database** PostgreSQL with Drizzle ORM

## Setup

1. Install dependencies:

   ```bash
   bun install
   ```

2. Create the environment file and fill it in:

   ```bash
   cp .env.example .env
   openssl rand -base64 48   # paste this into JWT_ACCESS_SECRET
   ```

3. Apply the migrations:

   ```bash
   bun run db:migrate
   ```

4. Start the server:

   ```bash
   bun run dev
   ```

The API is served under `http://localhost:<PORT>/api/v1`.

## Environment variables

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `PORT` | no | `8080` | Port the API listens on. Must match the frontend's `VITE_API_URL`, which defaults to `http://localhost:8080/api/v1`. |
| `DATABASE_URL` | yes | — | PostgreSQL connection string |
| `JWT_ACCESS_SECRET` | yes | — | Signing key for access tokens, min 32 chars |
| `ACCESS_TOKEN_TTL_SECONDS` | no | `900` | Access token lifetime |
| `REFRESH_TOKEN_TTL_DAYS` | no | `30` | Refresh token lifetime |
| `CORS_ORIGINS` | no | `http://localhost:5173` | Comma-separated allowed origins |
| `TRUST_PROXY` | no | `0` | Number of reverse proxies in front of the app. Leave at `0` unless one is really there, otherwise clients can spoof their IP and defeat the rate limiters. |

The server refuses to start if `DATABASE_URL` or `JWT_ACCESS_SECRET` is missing
or invalid.

## Scripts

| Script | What it does |
| --- | --- |
| `bun run dev` | Start the server with hot reload |
| `bun run start` | Start the server |
| `bun run typecheck` | Type-check without emitting |
| `bun run db:generate` | Generate a migration from the schema files |
| `bun run db:migrate` | Apply pending migrations |
| `bun run db:studio` | Open Drizzle Studio |
| `bun run make-admin <email>` | Replace an account's role with `admin` |

## Endpoints

Base path `/api/v1`. Every error comes back as
`{ "error": "CODE", "message": "text" }`, with `issues` added for validation failures.

| Method | Path | Access | Body | Success |
| --- | --- | --- | --- | --- |
| GET | `/health` | Public | — | 200 `{ status }` |
| POST | `/auth/signup` | Public | `fullName, email, phone?, password, role?` | 201 auth result |
| POST | `/auth/login` | Public | `email, password` | 200 auth result |
| POST | `/auth/refresh` | Public | `refreshToken` | 200 token pair |
| POST | `/auth/logout` | Public | `refreshToken` | 204 |
| GET | `/users/me` | Bearer | — | 200 user |
| PATCH | `/users/me` | Bearer | `fullName?, phone?, avatarUrl?` | 200 user |
| DELETE | `/users/me` | Bearer | — | 204 (soft delete) |
| POST | `/drivers/apply` | Bearer | — | 201 driver profile |
| GET | `/drivers/me` | Bearer | — | 200 driver profile |
| PATCH | `/drivers/me/online` | Bearer + approved driver | `isOnline` | 200 driver profile, 409 if no vehicle |
| PATCH | `/drivers/:userId/status` | Bearer + admin | `status` | 200 driver profile |
| GET | `/vehicles` | Bearer + approved driver | — | 200 vehicle, 404 if none |
| PUT | `/vehicles` | Bearer + approved driver | `seats?` | 200 vehicle (upsert) |
| PATCH | `/vehicles` | Bearer + approved driver | `seats` | 200 vehicle, 404 if none |
| DELETE | `/vehicles` | Bearer + approved driver | — | 204 (soft delete) |

### Error codes

`VALIDATION_ERROR` 400, `INVALID_JSON` 400, `UNAUTHORIZED` 401, `TOKEN_EXPIRED` 401,
`INVALID_CREDENTIALS` 401, `FORBIDDEN` 403, `DRIVER_NOT_APPROVED` 403, `NOT_FOUND` 404,
`NOT_A_DRIVER` 404, `EMAIL_TAKEN` 409, `PHONE_TAKEN` 409, `ALREADY_DRIVER` 409,
`PAYLOAD_TOO_LARGE` 413, `RATE_LIMITED` 429, `INTERNAL` 500.

## Token flow

1. `POST /auth/login` returns an access token (JWT, 15 min) and a refresh token (30 days).
   Store the refresh token; it is shown only once.
2. Send the access token on every private call: `Authorization: Bearer <accessToken>`.
3. When a call returns 401 `TOKEN_EXPIRED`, call `POST /auth/refresh` with the refresh token.
4. Refresh rotates the token: the response contains a **new** pair, and the old refresh
   token stops working immediately. Replace whatever you stored with the new pair.
5. `POST /auth/logout` revokes one refresh token. There is no "sign out everywhere"
   route: `authService.revokeAllSessions` exists but is not exposed, and is called only
   by `DELETE /users/me` so a deleted account stops working immediately.

Driver approval is checked against the database on every `/vehicles` call, so a new
driver does not need to refresh their token after applying.

### Editing your profile

`PATCH /users/me` takes `fullName`, `phone` and `avatarUrl`. Two rules are easy to get
wrong from the client side:

- **Omitting a key leaves that column alone; sending `null` clears it.** `phone` and
  `avatarUrl` are nullable for exactly this reason — without it a field could be set
  once and never removed. An empty string is *not* how you clear a field: it fails the
  format check, so clients must send `null`.
- **Email is not accepted at all.** It is stripped as an unknown key, which leaves an
  empty object, which the `Provide at least one field` refine then rejects. Changing
  an email needs a verification step, and there is no such flow yet.
- A phone that another account already holds comes back as `409 PHONE_TAKEN`, so the
  client can attach the message to the phone field rather than showing a generic error.

### Choosing a role at signup

`POST /auth/signup` takes an optional `role` of `passenger` or `driver`, which is what
the signup page's two tabs send. It defaults to `passenger`, so a client that omits it
keeps working.

- `admin` is **not** accepted. `SelfAssignableRole` in `common/types/auth.types.ts` is
  `Exclude<Role, 'admin'>`, and the signup schema's enum is a `satisfies` that array, so
  the narrowing is checked at compile time. A request with `"role":"admin"` is a 400.
  Admins are only created by `bun run make-admin`.
- Choosing `driver` creates the `users` row, the `driver` role and the `driver_profiles`
  row in **one transaction**. The profile cannot be a follow-up step: a user holding the
  `driver` role but no profile row would fail `requireApprovedDriver` with a 403. The
  role is written onto the `users` row itself, so there is no second grant to get wrong.
- The status is `approved`, so a driver can register a vehicle immediately. The domain
  has no review step yet; `INITIAL_DRIVER_STATUS` in `drivers.service.ts` is the one
  place to change when that arrives.
- `POST /drivers/apply` still exists for a passenger who signed up as a passenger and
  later wants to drive. It shares `driversService.registerProfile` with signup.

### Online is not approved

`driver_profiles` carries two independent notions, and conflating them is the easy
mistake here:

| Column | Set by | Means |
| --- | --- | --- |
| `status` | an admin, or signup | may this person drive at all |
| `is_online` | the driver | are they working right now |

`PATCH /drivers/me/online` therefore does **not** require the admin role, and
`PATCH /drivers/:userId/status` does **not** touch `is_online`. Suspending a driver
leaves their `is_online` as it was, which is correct: the approval is what gates them,
and the flag becomes true again if they are reinstated.

- The body is `{ isOnline: boolean }`, not a bare toggle. Sending the intended value
  means a retried request is idempotent instead of flipping the state back.
- **Going online requires an active vehicle** and answers `409 NO_ACTIVE_VEHICLE`
  without it. Going offline is never blocked, so a driver can always stop working even
  if their vehicle was removed underneath them.
- That rule is enforced in `driversController.setOnline`, not the service. It spans two
  modules, and `vehicles` already depends on `drivers`, so `drivers.service` importing
  `vehicles` would be a cycle. The controller is the only layer that sees both — the
  same seam `users.controller.deleteMe` uses to reach `auth`.
- The column defaults to `false`, so a newly approved driver is not dispatchable until
  they choose to be. Added by `20260930092054_driver_online_toggle` as a single
  `ADD COLUMN ... NOT NULL DEFAULT false`, which needs no backfill.
- **Nothing reads `is_online` yet.** There is no dispatch or matching code, so this
  stores the state without changing any behaviour until that exists.

### One vehicle per driver

A driver has at most one **active** vehicle, so `/vehicles` is a singleton: there is
no `:id` in any route and every query is scoped by the caller's `driverId`.

- `PUT /vehicles` is an upsert. It registers the vehicle when there is none, and
  changes the seats of the existing one otherwise. An empty body keeps the current
  seats, and applies the column default of 2 when registering.
- `PATCH /vehicles` only ever changes what already exists, and answers `404` when the
  driver has not registered a vehicle yet, so the client can send them to the register
  form. It rejects an empty body, which is what keeps the two verbs distinct:
  `PUT {}` registers one with the default seats, `PATCH {}` would be a no-op write the
  caller did not intend. The schema's `refine` narrows the parsed type to
  `{ seats: number }`, so the service never re-checks what the schema already proved.
- `DELETE /vehicles` is a soft delete. The row stays with `is_active = false`, and
  the driver can register a new vehicle afterwards.
- The rule is enforced in the database by a **partial** unique index,
  `vehicles_one_active_per_driver` on `vehicles (driver_id) WHERE is_active`. It is
  partial precisely so the deactivated history rows do not block a new vehicle. The
  service maps a violation of that index to `409 ALREADY_HAS_VEHICLE`, which is only
  reachable when two requests race.

The dedupe that introduced the index kept the most recently inserted vehicle per
driver and deleted the rest, 21 rows down to 12. `ctid` was used to determine
insertion order because the table has no `created_at`; it is referenced only in that
migration and never in application code.

### Database constraints

Two things are enforced by the database rather than by the service layer:

- `users.role` is a **single `NOT NULL` column**, so an account holds exactly one role
  and a second grant is impossible rather than merely discouraged. `usersRepository.setRole`
  replaces the value. This replaced the `user_roles` join table, which could hold any
  number of rows per user; see `single_role_per_user` below.
- `sessions.refresh_token_hash` is **indexed**, because every refresh, rotation and
  logout filters on it.

The refresh-token index was added in the `user_roles_pk_and_session_index` migration.
Note that `primaryKey`, `index` and `uniqueIndex` must be imported from
`drizzle-orm/pg-core` in a PostgreSQL project: importing them from
`drizzle-orm/cockroach-core` makes drizzle-kit silently ignore the constraint, which is
how `user_roles` shipped without its primary key in the first place.

### One role per account

`single_role_per_user` collapsed the `user_roles` join table into `users.role`. The
backfill kept `admin > driver > passenger`, so no one lost a driver profile.

`POST /drivers/apply` therefore **replaces** `passenger` with `driver` rather than adding
to it, and both writes share the caller's transaction — a failure cannot leave a user
with a driver profile and a passenger role, or the reverse. The role and the profile are
created together on driver signup, so "has the driver role" and "has a driver profile" do
not normally diverge.

One consequence of the precedence: the single account that held `admin` **and** `driver`
became `admin`, so it keeps an approved driver profile it can no longer reach, because
`/driver` is gated on the role. Left as-is rather than silently reclassifying an admin.

Changing the JWT claim from `roles: [...]` to `role` invalidates every access token
already issued, so everyone re-logs-in once. The `payloadSchema` in `authenticate`
deliberately does not accept the old array shape, so no legacy path is left behind.

## Rides

`pools_and_ride_requests` added the first three tables of the ride domain. Nothing reads
or writes them yet — the passenger and driver request pages are still placeholders.

| Table | One row is |
| --- | --- |
| `locations` | a curated Dhaka area, so a trip's endpoints need no map or geocoding API |
| `pools` | one physical journey by one vehicle, shared by several passengers |
| `ride_requests` | one passenger's booking, carrying the fare and seat count |

A `pools` row is the vehicle's journey; a `ride_requests` row is a passenger's place in
one. `ride_requests.pool_id` is null only while a request is still unmatched, which the
`ride_requests_requested_has_no_pool` check enforces so matching code cannot leave a pool
counting a passenger who never got a seat.

`pools.current_available_seats` is `vehicles.seats` minus the seats taken by the requests
attached to the pool. It is stored rather than summed per read because "does this open
pool still have room" is the hot path of matching, and it must be written in the same
transaction that changes a request's status.

**Money is an integer of poisha**, the 1/100th of a Taka, so 100 is ৳1.00. A pool's fare
is split between its passengers, and dividing floating point money accumulates rounding
error that passengers end up overpaying; splitting an integer is exact and always sums
back to the original.

Two judgement calls worth knowing:

- **`matched_accepted` is one state.** The spec wrote the first pool state as
  "MATCHED/ACCEPTED", which left it open whether a match finishes on assignment or only
  once the driver accepts. It is modelled as one state so a driver is never silently
  treated as having accepted. Splitting it into `matched` + `accepted` later is a one-line
  enum change.
- **No "one open request per passenger" constraint.** Whether a passenger may hold
  several unmatched requests at once is a product decision, not a database one, so it is
  deliberately absent. Add it when the rule is decided.

`lat`/`lng` are `double precision`, not `numeric`: a coordinate is a measurement that is
never summed or split, so a float is accurate enough and cheaper to index. The integer rule
applies to money only.

## Migration bookkeeping

drizzle 1.0-rc has no `meta/_journal.json`. `drizzle-kit generate` diffs the schema files
against the newest `snapshot.json`, and `drizzle-kit migrate` reads every
`drizzle/*/migration.sql` and skips the ones already named in `drizzle.__drizzle_migrations`.

Migrations 1–5 were applied by hand, so that table did not exist and `db:migrate` tried to
replay all of them, dying at `single_role_per_user` on the `users.role` column that
already existed. The batch runs in one transaction, so it rolled back and changed nothing.
`src/scripts/record-hand-applied-migrations.ts` inserted the five missing names — it
creates only the bookkeeping table, and hashes and timestamps match what drizzle writes
itself. The snapshot in `pools_and_ride_requests` is the post-single-role state, which
repairs the chain for every later migration.

Two consequences worth remembering:

- **A hand-applied migration must be recorded, or `db:migrate` will replay it.** Prefer
  `bun run db:migrate` from now on.
- **A migration folder without a `snapshot.json` breaks the next `generate`**, which
  silently re-emits everything that folder did. `db:generate` printed
  `DROP TABLE "user_roles"` and `ADD COLUMN "role"` in that situation; those statements
  were removed by hand, with a comment in the SQL saying why.

## Architecture

Each module (`auth`, `users`, `drivers`, `vehicles`) is split into the same layers:

| File | Responsibility |
| --- | --- |
| `*.routes.ts` | Maps URL and method to middleware plus controller |
| `*.controller.ts` | Validates input with zod, calls the service, sends the response |
| `*.service.ts` | Business rules and transactions |
| `*.repository.ts` | Drizzle queries only |
| `*.validation.ts` | Zod schemas |

Modules never form a cycle: `auth → users`, `auth → drivers`, `drivers → users`,
`vehicles → drivers`. A module that needs data from another module calls that
module's service, never its repository. `auth` reaching `drivers` is the one that
looks surprising, and it exists because a driver signup has to write the account,
the role and the profile atomically.

Errors are thrown as `AppError(status, message, code)` from services and turned
into responses by the single `errorHandler`.
