import { z } from "zod";

const schema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().default(3000), // env values are strings, so coerce
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(30),
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:5173")
    .transform((s) =>
      s
        .split(",")
        .map((o) => o.trim())
        .filter(Boolean),
    ),
  TRUST_PROXY: z.coerce.number().default(0), // number of proxies in front of the app
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment:");
  for (const i of parsed.error.issues)
    console.error(` - ${i.path.join(".")}: ${i.message}`);
  process.exit(1);
}
export const env = parsed.data;
