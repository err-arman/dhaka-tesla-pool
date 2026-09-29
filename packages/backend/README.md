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
| `PORT` | no | `3000` | Port the API listens on |
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
| `bun run make-admin <email>` | Grant the admin role to an existing account |

## Endpoints

Base path `/api/v1`. Every error comes back as
`{ "error": "CODE", "message": "text" }`, with `issues` added for validation failures.

| Method | Path | Access | Body | Success |
| --- | --- | --- | --- | --- |
| GET | `/health` | Public | — | 200 `{ status }` |
| POST | `/auth/signup` | Public | `fullName, email, phone?, password` | 201 auth result |
| POST | `/auth/login` | Public | `email, password` | 200 auth result |
| POST | `/auth/refresh` | Public | `refreshToken` | 200 token pair |
| POST | `/auth/logout` | Public | `refreshToken` | 204 |
| POST | `/auth/logout-all` | Bearer | — | 204 |
| GET | `/users/me` | Bearer | — | 200 user |
| PATCH | `/users/me` | Bearer | `fullName?, phone?, avatarUrl?` | 200 user |
| DELETE | `/users/me` | Bearer | — | 204 (soft delete) |
| POST | `/drivers/apply` | Bearer | — | 201 driver profile |
| GET | `/drivers/me` | Bearer | — | 200 driver profile |
| PATCH | `/drivers/:userId/status` | Bearer + admin | `status` | 200 driver profile |
| POST | `/vehicles` | Bearer + approved driver | `seats?` | 201 vehicle |
| GET | `/vehicles` | Bearer + approved driver | — | 200 list |
| PATCH | `/vehicles/:id` | Bearer + approved driver | `seats?, isActive?` | 200 vehicle |
| DELETE | `/vehicles/:id` | Bearer + approved driver | — | 204 |

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
5. `POST /auth/logout` revokes one refresh token; `POST /auth/logout-all` revokes every
   session of the signed-in user.

Driver approval is checked against the database on every `/vehicles` call, so a new
driver does not need to refresh their token after applying.

## Architecture

Each module (`auth`, `users`, `drivers`, `vehicles`) is split into the same layers:

| File | Responsibility |
| --- | --- |
| `*.routes.ts` | Maps URL and method to middleware plus controller |
| `*.controller.ts` | Validates input with zod, calls the service, sends the response |
| `*.service.ts` | Business rules and transactions |
| `*.repository.ts` | Drizzle queries only |
| `*.validation.ts` | Zod schemas |

Modules depend on each other in one direction only: `auth → users`,
`drivers → users`, `vehicles → drivers`. A module that needs data from another
module calls that module's service, never its repository.

Errors are thrown as `AppError(status, message, code)` from services and turned
into responses by the single `errorHandler`.
