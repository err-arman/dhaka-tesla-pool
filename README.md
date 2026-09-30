# dhaka-tesla

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

This project was created using `bun init` in bun v1.3.14. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.

# dhaka-tesla-pool

## Run with Docker

Install Docker with Compose, then start PostgreSQL, the backend, and the frontend:

```bash
docker compose up --build
```

Open `http://localhost:5173` for the frontend. The API is available at
`http://localhost:8080/api/v1`, and database migrations run automatically when the
backend starts.

To seed the location data once the services are running:

```bash
docker compose exec backend bun run db:seed:locations
```

Stop the services with `docker compose down`. Add `-v` only when you also want to delete
the PostgreSQL data volume.
