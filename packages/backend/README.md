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

| Variable                   | Required | Default                 | Purpose                                                                                                                                                    |
| -------------------------- | -------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`                     | no       | `8080`                  | Port the API listens on. Must match the frontend's `VITE_API_URL`, which defaults to `http://localhost:8080/api/v1`.                                       |
| `DATABASE_URL`             | yes      | —                       | PostgreSQL connection string                                                                                                                               |
| `JWT_ACCESS_SECRET`        | yes      | —                       | Signing key for access tokens, min 32 chars                                                                                                                |
| `ACCESS_TOKEN_TTL_SECONDS` | no       | `900`                   | Access token lifetime                                                                                                                                      |
| `REFRESH_TOKEN_TTL_DAYS`   | no       | `30`                    | Refresh token lifetime                                                                                                                                     |
| `CORS_ORIGINS`             | no       | `http://localhost:5173` | Comma-separated allowed origins                                                                                                                            |
| `TRUST_PROXY`              | no       | `0`                     | Number of reverse proxies in front of the app. Leave at `0` unless one is really there, otherwise clients can spoof their IP and defeat the rate limiters. |

The server refuses to start if `DATABASE_URL` or `JWT_ACCESS_SECRET` is missing
or invalid.

## Scripts

| Script                    | What it does                                                                                                          |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `bun run dev`             | Start the server with hot reload                                                                                      |
| `bun run start`           | Start the server                                                                                                      |
| `bun run typecheck`       | Type-check without emitting                                                                                           |
| `bun run db:generate`     | Generate a migration from the schema files                                                                            |
| `bun run db:migrate`      | Apply pending migrations                                                                                              |
| `bun run db:studio`       | Open Drizzle Studio                                                                                                   |
| `bun run test:rides`      | Ride lifecycle test. Runs inside a transaction and rolls back, so it leaves the database as it found it               |
| `bun run test:rides:http` | Ride lifecycle test over real HTTP against a running server. Skips itself rather than disturb live traffic; see below |

## Endpoints

Base path `/api/v1`. Every error comes back as
`{ "error": "CODE", "message": "text" }`, with `issues` added for validation failures.

| Method | Path                                   | Access                   | Body                                                       | Success                                                                |
| ------ | -------------------------------------- | ------------------------ | ---------------------------------------------------------- | ---------------------------------------------------------------------- |
| GET    | `/health`                              | Public                   | —                                                          | 200 `{ status }`                                                       |
| POST   | `/auth/signup`                         | Public                   | `fullName, email, phone?, password, role?`                 | 201 auth result                                                        |
| POST   | `/auth/login`                          | Public                   | `email, password`                                          | 200 auth result                                                        |
| POST   | `/auth/refresh`                        | Public                   | `refreshToken`                                             | 200 token pair                                                         |
| POST   | `/auth/logout`                         | Public                   | `refreshToken`                                             | 204                                                                    |
| GET    | `/users/me`                            | Bearer                   | —                                                          | 200 user                                                               |
| PATCH  | `/users/me`                            | Bearer                   | `fullName?, phone?, avatarUrl?`                            | 200 user                                                               |
| DELETE | `/users/me`                            | Bearer                   | —                                                          | 204 (soft delete)                                                      |
| GET    | `/drivers/me`                          | Bearer                   | —                                                          | 200 driver profile                                                     |
| PATCH  | `/drivers/me/online`                   | Bearer + approved driver | `isOnline, currentZoneId?`                                 | 200 driver profile, 409 if no vehicle, 400 without a zone to go online |
| PATCH  | `/drivers/:userId/status`              | Bearer + admin           | `status`                                                   | 200 driver profile                                                     |
| GET    | `/vehicles`                            | Bearer + approved driver | —                                                          | 200 vehicle, 404 if none                                               |
| PUT    | `/vehicles`                            | Bearer + approved driver | `seats?`                                                   | 200 vehicle (upsert)                                                   |
| PATCH  | `/vehicles`                            | Bearer + approved driver | `seats`                                                    | 200 vehicle, 404 if none                                               |
| DELETE | `/vehicles`                            | Bearer + approved driver | —                                                          | 204 (soft delete)                                                      |
| GET    | `/locations`                           | Bearer                   | —                                                          | 200 areas                                                              |
| POST   | `/ride-requests`                       | Bearer                   | `pickupLocationId, destinationLocationId, seatsRequested?` | 201 request, 409 if one is already live                                |
| GET    | `/ride-requests/mine`                  | Bearer                   | —                                                          | 200 this passenger's requests, newest first                            |
| POST   | `/ride-requests/:requestId/cancel`     | Bearer                   | —                                                          | 200 `{ id, status }`, 404 if not yours, 409 if too late                |
| GET    | `/ride-requests/driver/feed`           | Bearer + approved driver | —                                                          | 200 `{ currentTrip, offers }`                                          |
| POST   | `/ride-requests/pools/:poolId/:action` | Bearer + approved driver | —                                                          | 200 new pool status                                                    |

### Error codes

`VALIDATION_ERROR` 400, `INVALID_JSON` 400, `UNAUTHORIZED` 401, `TOKEN_EXPIRED` 401,
`INVALID_CREDENTIALS` 401, `FORBIDDEN` 403, `DRIVER_NOT_APPROVED` 403, `NOT_FOUND` 404,
`NOT_A_DRIVER` 404, `POOL_NOT_FOUND` 404, `REQUEST_NOT_FOUND` 404, `EMAIL_TAKEN` 409,
`PHONE_TAKEN` 409, `ALREADY_DRIVER` 409, `RIDE_ALREADY_IN_PROGRESS` 409,
`ILLEGAL_POOL_TRANSITION` 409, `REQUEST_NOT_CANCELLABLE` 409, `REQUEST_CHANGING` 409,
`PAYLOAD_TOO_LARGE` 413, `RATE_LIMITED` 429, `INTERNAL` 500, `LOCATION_NOT_FOUND` 422.

`LOCATION_NOT_FOUND` is the one 422. A schema failure is a 400 because the request
malformed the documented shape; an unknown area id is well-formed but names something
that does not exist, and the client can point at the field for it.

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
  once and never removed. An empty string is _not_ how you clear a field: it fails the
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
- Choosing `driver` creates the `users` row, the `driver` role and the `driver_profiles`
  row in **one transaction**. The profile cannot be a follow-up step: a user holding the
  `driver` role but no profile row would fail `requireApprovedDriver` with a 403. The
  role is written onto the `users` row itself, so there is no second grant to get wrong.
- The status is `approved`, so a driver can register a vehicle immediately. The domain
  has no review step yet; `INITIAL_DRIVER_STATUS` in `drivers.service.ts` is the one
  place to change when that arrives.

### Online is not approved

`driver_profiles` carries two independent notions, and conflating them is the easy
mistake here:

| Column      | Set by              | Means                        |
| ----------- | ------------------- | ---------------------------- |
| `status`    | an admin, or signup | may this person drive at all |
| `is_online` | the driver          | are they working right now   |

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
  and a second grant is impossible rather than merely discouraged. This replaced the
  `user_roles` join table, which could hold any
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

One consequence of the precedence: the single account that held `admin` **and** `driver`
became `admin`, so it keeps an approved driver profile it can no longer reach, because
`/driver` is gated on the role. Left as-is rather than silently reclassifying an admin.

One consequence of the precedence: the single account that held `admin` **and** `driver`
became `admin`, so it keeps an approved driver profile it can no longer reach, because
`/driver` is gated on the role. Left as-is rather than silently reclassifying an admin.

Changing the JWT claim from `roles: [...]` to `role` invalidates every access token
already issued, so everyone re-logs-in once. The `payloadSchema` in `authenticate`
deliberately does not accept the old array shape, so no legacy path is left behind.

## Rides

`pools_and_ride_requests` added the first three tables of the ride domain, and the ride
flow on top of them is implemented end to end: a passenger books, matching attaches them
to a nearby driver's vehicle, and the driver drives the trip through to completion.

| Table           | One row is                                                               |
| --------------- | ------------------------------------------------------------------------ |
| `locations`     | a curated Dhaka area, so a trip's endpoints need no map or geocoding API |
| `pools`         | one physical journey by one vehicle, shared by several passengers        |
| `ride_requests` | one passenger's booking, carrying the fare and seat count                |

A `pools` row is the vehicle's journey; a `ride_requests` row is a passenger's place in
one. `ride_requests.pool_id` is null only while a request is still unmatched, which the
`ride_requests_requested_has_no_pool` check enforces so matching code cannot leave a pool
counting a passenger who never got a seat.

`pools.current_available_seats` is `vehicles.seats` minus the seats taken by the requests
attached to the pool. It is stored rather than summed per read because "does this open
pool still have room" is the hot path of matching, and it must be written in the same
transaction that changes a request's status.

`lat`/`lng` are `double precision`, not `numeric`: a coordinate is a measurement that is
never summed or split, so a float is accurate enough and cheaper to index. The integer rule
applies to money only.

### The flow

`POST /ride-requests` validates the two area ids and the seat count (1–4), writes the row
as `requested` with **no pool and a fare of 0**, and returns 201. It deliberately does not
match and does not price: the fare depends on who else ends up sharing the ride, and with
the rule that a driver must be online first, a request submitted at 6am waits until
someone comes online near the pickup. Deciding the fare at submission would mean either
guessing or re-pricing later.

Matching (`ride.matching.ts`) then runs over every waiting request, oldest first, in one
transaction, and it runs on exactly two triggers: a new request, and a driver coming
online. Those are the only two moments at which the set of possible matches can have
changed. There is no queue table and no background worker; anything more would need a
scheduler and a way to stop it, for no gain at this size.

A driver qualifies when they are `is_online`, `approved`, have an active vehicle, and
their `current_zone_id` is within 3 km of the request's pickup. A second passenger joins
an existing pool only when the pickup area matches **exactly** and the destination is
within 3 km of the pool's own destination. Comparing against the pool's anchor rather
than the previous passenger's destination is what stops a group drifting: A→B plus B→C,
each within 3 km, would otherwise chain across a distance nobody agreed to travel.

Ordering by `created_at` is a fairness rule, not a performance one — earlier requests get
first claim on the seats, so a passenger repeatedly submitting cannot jump the queue.

**Nothing reads `is_online` yet** used to be true of the online toggle; it is now the
primary input to matching. Everything else about `status` versus `is_online` still holds.

### Pool states

`matched → accepted → driver_arrived → started → completed`, plus a `cancelled` value in
both enums that no route exposes. The transition table lives in `ride.pool.ts` and is the
only place a state change is permitted; `transitionPool` locks the pool, checks the move,
and writes it in one statement, so two concurrent accepts cannot both win.

`cancelled` is reachable, but only as a consequence of a passenger cancelling (see below),
never as a driver action.

`matched` and `accepted` are **separate** states. The original spec wrote the first state
as "MATCHED/ACCEPTED", which left open whether a match finishes on assignment or only once
the driver has agreed to carry the passenger. Keeping them apart means a driver is never
silently treated as having accepted a trip they have not seen.

That split has a consequence worth stating, because it is enforced in two places:

- **Only a `matched` pool can gain a passenger.** Once a driver accepts, the passenger
  count and every fare in that pool are settled from their point of view — they agreed to
  carry N people. A later join would re-price the passengers already on their way, with
  nobody asked.
- **Only a `matched` pool is offered to another driver.** Showing an accepted pool as an
  offer invites a second driver to Accept a trip that is taken, whose only outcome is a
  409 from `transitionPool`.

An in-flight vehicle is still exactly one pool, enforced by `pools_one_open_per_vehicle`
over all four live states, so a request that cannot join a committed pool waits for a
different vehicle rather than opening a second journey.

### One live ride per passenger

A passenger may hold **one** request while it is `requested`, `matched` or `in_progress`.
Once it is `completed` or `cancelled` it is history and they may book again — the rule is
about a trip in progress, not about one request per lifetime.

It is enforced twice, because neither mechanism is sufficient alone:

- `findLiveByPassenger` runs in the service first, so a second submission gets
  `409 RIDE_ALREADY_IN_PROGRESS` and an explanation instead of a raw `duplicate key value`.
- The partial unique index `ride_requests_one_live_per_passenger` on
  `(passenger_id) WHERE status in (...)` is the actual rule. Without it, two taps in the
  same second both pass the read; without the read, the loser of the race gets a 500. The
  service maps a violation of that index to the same 409, so the caller cannot tell the
  two apart and does not have to.

It is partial for the same reason `vehicles_one_active_per_driver` is: without the
`where`, the index would cap a passenger at one row for the rest of their life. Applying
the migration required confirming no passenger currently had more than one live request,
which was checked first — and should be re-checked before running it anywhere else.

### Concurrency in matching

`runMatching` locks the `requested` rows with `FOR UPDATE SKIP LOCKED` so two passes can
work the queue without fighting, and it also locks the **candidate vehicle rows**
(`for update of vehicles`) before inserting a pool. That second lock is load-bearing: two
passes running at once — two drivers coming online simultaneously, or a request arriving
mid-pass — would otherwise both read the same vehicle as pool-free and each try to insert
a pool for it. `pools_one_open_per_vehicle` then rejects the loser, but as a constraint
violation it aborts that pass's whole transaction, discarding every _other_ successful
match in it. The `order by vehicles.id` immediately below the lock is what keeps the two
passes queueing instead of deadlocking, and `of: vehicles` scopes the lock so a concurrent
"go offline" is not blocked by a matching pass that is only reading the profile.

Fares are stored in **integer poisha**, the 1/100th of a Taka, so 100 is ৳1.00. The
figures are placeholders in `ride.fare.ts` — 5000 base, 2500 per whole km (rounded up),
2000 off each passenger when two or more share — and are the one thing to replace with
real pricing. A pool's fare is split between its passengers, and dividing floating point
money accumulates rounding error that passengers end up overpaying; splitting an integer
is exact and always sums back to the original. Every join **re-prices the whole pool**,
because the discount depends on the passenger count and the founder's fare drops when
someone joins.

### Cancelling a request

`POST /ride-requests/:requestId/cancel` lets a passenger drop their own booking. It lives
in `ride.cancel.ts`, **not** in `ride.pool.ts`, and that split is the point: every entry
point into the pool state machine proves the caller owns the vehicle, and a passenger
cancelling their own seat has no vehicle to prove. Routing it through `transitionPool`
would mean a second path into the same status column with different permissions. As
written, the pool status that cancellation sets is visibly a _consequence_ of a passenger
leaving rather than something anybody asks for.

The policy, since cancelling a shared ride has several reasonable answers:

- **A passenger may cancel until the trip is underway.** `requested` and `matched` are
  cancellable; `in_progress` is not. Once the car is moving the passenger is physically in
  it and the driver owns what happens next. `completed` and `cancelled` are terminal, so a
  second cancel is a 409 rather than a silent success.
- **Cancelling keeps the row** as `cancelled` history, and it keeps its `pool_id` — the
  only record of which journey it was ever part of. That is also why every count in
  matching filters on `status <> 'cancelled'` rather than on `pool_id is null`.
- **Leaving returns the seats and re-prices the others.** The group discount is a function
  of the headcount, so the people left in the car pay **more** each: the test asserts the
  stayer's fare rises from 20500 to 22500 when the other passenger leaves. Not re-pricing
  would keep charging a shared rate to a solo ride.
- **An emptied pool is cancelled**, which also releases `pools_one_open_per_vehicle`.
  That is the point of doing it: with a `cancelled` row still holding the vehicle, the
  driver could never be matched again.
- **A driver cannot cancel.** Abandoning people already in the car is a larger question —
  where do they go, is the fare refunded, is there a penalty — and no route exists for it.

There is **no cancellation penalty**. Fares are computed and stored but never charged, so
a penalty would be a number nobody could act on. If one is wanted later it belongs on the
cancelled request, not in the pool transition.

Lock ordering is the subtle part, and it is easy to get wrong. `transitionPool` locks the
pool first and then updates the member requests, so a cancellation that locked the
request first would invert that order against a concurrent Accept and the two would
deadlock. Cancellation therefore locks the pool first _when there is one_, matching
`transitionPool`, and decides which order it needs from an unlocked read — which can be
stale, so it is re-verified against the locked request and retried once if a match
attached a pool in the meantime.

### Testing the flow

Both suites write to the real database and both are careful to leave it as they found it,
because the app also has real traffic.

- `bun run test:rides` wraps everything in one transaction and rolls back, comparing the
  row counts afterwards against a baseline captured before it started. It asserts against
  that baseline rather than against zero, because "the tables are empty" is a claim about
  the world, not about whether the rollback worked.
- `bun run test:rides:http` drives the real HTTP surface with signed tokens and cleans up
  only the rows it created, identified by id. It refuses to run while any _other_
  passenger is waiting for a driver: going online runs matching over every open request,
  so the test would match a real passenger into its own pool and then delete that pool.
  Skipping is better than taking someone's ride.

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

### Adding a migration after the ride work

Two migrations were added after this was written and both hit the same trap, which is
worth stating as a procedure.

`bun run db:generate` **cannot be trusted in this repo**. Without a `_journal.json` it
cannot find the head of the chain, so it diffs against a snapshot it thinks is stale and
emits the entire schema again. Running that output would fail on the first
`ADD COLUMN` that already exists — and because `migrate` runs the batch in one
transaction, the failure rolls back the whole thing and applies nothing.

So the procedure that worked:

1. Run `db:generate` anyway, for the new folder name and timestamp.
2. **Rewrite `migration.sql` down to only what this change adds.** Keep a comment saying
   why the rest was removed.
3. **Delete the generated `snapshot.json`.** Leaving it made `db:migrate` refuse to run
   at all with `Non-commutative migrations detected`, because the copied snapshot claimed
   to add `current_zone_id` on a branch that drizzle could not reconcile with the one
   already applied. A folder with no snapshot is the pattern
   `20260930160000_single_role_per_user` already uses.
4. Apply with `bun run db:migrate`, after checking the SQL cannot violate existing data.
   `one_live_ride_per_passenger` needed that check: the partial unique index is only
   satisfiable if no passenger already has two live requests.

The schema files remain the source of truth — `drizzle/__drizzle_migrations` and the
`snapshot.json` files are bookkeeping that is known to be incomplete, so neither should
be trusted as a description of the current schema. The generated folder name is still
worth keeping because `migrate` matches on `name`.

A partial index that would fail to apply is a _feature_ in this situation: it refuses to
run against data that violates the rule, which is a data problem to resolve rather than a
schema one to work around.

## Architecture

Each module (`auth`, `users`, `drivers`, `vehicles`) is split into the same layers:

| File              | Responsibility                                                  |
| ----------------- | --------------------------------------------------------------- |
| `*.routes.ts`     | Maps URL and method to middleware plus controller               |
| `*.controller.ts` | Validates input with zod, calls the service, sends the response |
| `*.service.ts`    | Business rules and transactions                                 |
| `*.repository.ts` | Drizzle queries only                                            |
| `*.validation.ts` | Zod schemas                                                     |

Modules never form a cycle: `auth → users`, `auth → drivers`, `drivers → users`,
`vehicles → drivers`. A module that needs data from another module calls that
module's service, never its repository. `auth` reaching `drivers` is the one that
looks surprising, and it exists because a driver signup has to write the account,
the role and the profile atomically.

Errors are thrown as `AppError(status, message, code)` from services and turned
into responses by the single `errorHandler`.
