import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { z } from "zod";

/*
 * Loaded here, from the module every other module already imports, rather than relying
 * on a bare `bun` invocation.
 *
 * Bun loads `.env` from `process.cwd()`, so a script run from a subdirectory — `bun run
 * locations.seed.ts` from `src/seeds` — sees no variables at all and dies in the
 * validation below with `DATABASE_URL: expected string, received undefined`. Anchoring
 * the path to this file makes every entrypoint work from any directory.
 *
 * Two details: `quiet` silences dotenv's startup banner, which would otherwise appear in
 * the middle of a script's own output; and dotenv never overwrites a variable that is
 * already set, so a real environment (Docker, CI, an exported shell var) still wins over
 * the file.
 */
config({ path: fileURLToPath(new URL("../../.env", import.meta.url)), quiet: true });

const schema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  // 8080, not 3000: the frontend's VITE_API_URL default points at 8080, and a
  // mismatch here fails at the network layer with no error message at all.
  PORT: z.coerce.number().int().positive().default(8080), // env values are strings, so coerce
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:5173")
    .transform((s) =>
      s
        .split(",")
        .map((o) => o.trim())
        .filter(Boolean),
    ),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0), // number of proxies in front of the app
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment:");
  for (const i of parsed.error.issues)
    console.error(` - ${i.path.join(".")}: ${i.message}`);
  process.exit(1);
}
export const env = parsed.data;
