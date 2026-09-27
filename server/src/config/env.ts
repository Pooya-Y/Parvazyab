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

/** Compose passes unset variables through as empty strings; treat those as unset. */
const blankAsUnset = (value: unknown) => (value === "" ? undefined : value);

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
  /** Public origin of the web app, used in links sent by email. */
  APP_URL: z.preprocess(blankAsUnset, z.string().url().default("http://localhost:8080")),
  /** console = log mail (links only outside production); smtp = send via SMTP_URL; memory = tests only. */
  MAIL_TRANSPORT: z.preprocess(blankAsUnset, z.enum(["console", "smtp", "memory"]).default("console")),
  /** e.g. smtps://user:pass@smtp.example.com:465 */
  SMTP_URL: z.preprocess(blankAsUnset, z.string().url().optional()),
  MAIL_FROM: z.preprocess(blankAsUnset, z.string().default("پروازیاب <no-reply@parvazyab.example>")),
  /** console = log (codes only outside production); kavenegar = Kavenegar verify/lookup; memory = tests only. */
  SMS_TRANSPORT: z.preprocess(blankAsUnset, z.enum(["console", "kavenegar", "memory"]).default("console")),
  KAVENEGAR_API_KEY: z.preprocess(blankAsUnset, z.string().optional()),
  /** A Kavenegar verify template whose text contains %token. */
  KAVENEGAR_TEMPLATE: z.preprocess(blankAsUnset, z.string().default("parvazyab-otp")),
  /** Web push (VAPID). Generate a pair with `npx web-push generate-vapid-keys`; without one, push is off. */
  VAPID_PUBLIC_KEY: z.preprocess(blankAsUnset, z.string().optional()),
  VAPID_PRIVATE_KEY: z.preprocess(blankAsUnset, z.string().optional()),
  /** A contact for push services: mailto: or https: URL. */
  VAPID_SUBJECT: z.preprocess(blankAsUnset, z.string().default("mailto:support@parvazyab.example")),
  /** webpush = send (needs the VAPID keys; the default when they are set); off; memory = tests only. */
  PUSH_TRANSPORT: z.preprocess(blankAsUnset, z.enum(["webpush", "off", "memory"]).optional()),
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

/**
 * Why the process can't start. Lists every problem at once and names each
 * setting, but never repeats a value: several of them are secrets.
 */
export class ConfigError extends Error {
  constructor(readonly problems: string[]) {
    super(["Invalid configuration (see .env.example):", ...problems.map((p) => `  - ${p}`)].join("\n"));
    this.name = "ConfigError";
  }
}

const SECRET_HINT = `generate one with: node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`;

function describeIssue(issue: z.ZodIssue, env: NodeJS.ProcessEnv): string {
  // `a.or(b)` only reports "Invalid input"; the first alternative's reason is the useful one.
  if (issue.code === "invalid_union" && issue.unionErrors[0]?.issues[0]) {
    return describeIssue(issue.unionErrors[0].issues[0], env);
  }
  const name = issue.path.join(".");
  if (issue.code === "too_small" && issue.type === "string") {
    const problem = `${name} must be at least ${issue.minimum} characters (it has ${String(env[name] ?? "").length})`;
    return name === "JWT_SECRET" ? `${problem}; ${SECRET_HINT}` : problem;
  }
  return `${name}: ${issue.message}`;
}

export function parseConfig(env: NodeJS.ProcessEnv): Config {
  const result = envSchema.safeParse(env);
  if (!result.success) throw new ConfigError(result.error.issues.map((issue) => describeIssue(issue, env)));
  const parsed = result.data;
  const hasVapid = Boolean(parsed.VAPID_PUBLIC_KEY && parsed.VAPID_PRIVATE_KEY);
  const problems = [
    parsed.NODE_ENV === "production" &&
      PLACEHOLDER_SECRETS.includes(parsed.JWT_SECRET) &&
      `JWT_SECRET is missing or still a placeholder; ${SECRET_HINT}`,
    parsed.MAIL_TRANSPORT === "smtp" && !parsed.SMTP_URL && "MAIL_TRANSPORT=smtp requires SMTP_URL",
    parsed.SMS_TRANSPORT === "kavenegar" &&
      !parsed.KAVENEGAR_API_KEY &&
      "SMS_TRANSPORT=kavenegar requires KAVENEGAR_API_KEY",
    parsed.PUSH_TRANSPORT === "webpush" &&
      !hasVapid &&
      "PUSH_TRANSPORT=webpush requires VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY",
    ...(["MAIL_TRANSPORT", "SMS_TRANSPORT", "PUSH_TRANSPORT"] as const).map(
      (name) => parsed[name] === "memory" && parsed.NODE_ENV !== "test" && `${name}=memory is only for tests`,
    ),
  ].filter((p): p is string => Boolean(p));
  if (problems.length) throw new ConfigError(problems);
  parsed.PUSH_TRANSPORT ??= hasVapid ? "webpush" : "off";
  return parsed;
}

function loadConfig(): Config {
  try {
    return parseConfig(process.env);
  } catch (err) {
    if (!(err instanceof ConfigError)) throw err;
    // A readable reason instead of a stack trace. 78 is EX_CONFIG, "configuration error".
    console.error(err.message);
    process.exit(78);
  }
}

export const config = loadConfig();

export const allowedOrigins = config.CLIENT_ORIGIN.split(",")
  .map((o) => o.trim())
  .filter(Boolean);
