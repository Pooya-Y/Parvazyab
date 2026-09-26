import "dotenv/config";
import { z } from "zod";

/**
 * `z.coerce.boolean()` turns the string "false" into `true`, so env flags are
 * parsed explicitly.
 */
const envFlag = z
  .enum(["true", "false", "1", "0", ""])
  .default("false")
  .transform((v) => v === "true" || v === "1");

const PLACEHOLDER_SECRETS = [
  "change-this-development-secret-please-32",
  "replace-with-at-least-32-random-characters",
  "replace-this-in-production-with-a-long-random-secret",
];

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().default("postgres://parvazyab:parvazyab@localhost:5432/parvazyab"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  JWT_SECRET: z.string().min(32).default(PLACEHOLDER_SECRETS[0]),
  /** Comma-separated list of allowed browser origins. */
  CLIENT_ORIGIN: z.string().default("http://localhost:8080,http://localhost:5173"),
  COOKIE_SECURE: envFlag,
  /** Insert demo agencies/flights on startup (idempotent). */
  SEED_DEMO_DATA: envFlag,
  /** Optional bootstrap admin account, created on startup if missing. */
  ADMIN_EMAIL: z
    .string()
    .email()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  ADMIN_PASSWORD: z
    .string()
    .min(12)
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

export type Config = z.infer<typeof envSchema>;

export function parseConfig(env: NodeJS.ProcessEnv): Config {
  const parsed = envSchema.parse(env);
  if (parsed.NODE_ENV === "production" && PLACEHOLDER_SECRETS.includes(parsed.JWT_SECRET)) {
    throw new Error("JWT_SECRET must be set to a unique random value in production");
  }
  return parsed;
}

export const config = parseConfig(process.env);

export const allowedOrigins = config.CLIENT_ORIGIN.split(",")
  .map((o) => o.trim())
  .filter(Boolean);
