import { createHash, randomBytes } from "node:crypto";
import type { EntityManager } from "typeorm";
import { AppDataSource } from "../database/dataSource";
import type { AuthTokenPurpose } from "../database/entities";

/**
 * Single-use tokens for emailed links. The token (32 random bytes) only ever
 * exists in the email; the database keeps its SHA-256, so a leaked table can't be
 * replayed. A plain hash is enough (no salt or KDF): the input is 256 bits of
 * randomness, not a guessable secret.
 */
export const TOKEN_TTL_MINUTES: Record<AuthTokenPurpose, number> = {
  password_reset: 30,
  email_verify: 3 * 24 * 60,
};

/** Per account and purpose: at most one email a minute and five an hour, so nobody can mail-bomb an address. */
export const TOKEN_RESEND_SECONDS = 60;
const TOKENS_PER_HOUR = 5;

const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Issues a fresh token and revokes any earlier unused one: only the newest link works. */
export async function issueToken(accountId: string, purpose: AuthTokenPurpose): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await AppDataSource.transaction(async (m) => {
    await m.query(
      `UPDATE auth_tokens SET consumed_at = now() WHERE account_id = $1 AND purpose = $2 AND consumed_at IS NULL`,
      [accountId, purpose],
    );
    await m.query(
      `INSERT INTO auth_tokens (account_id, purpose, token_hash, expires_at)
       VALUES ($1, $2, $3, now() + make_interval(mins => $4))`,
      [accountId, purpose, hashToken(token), TOKEN_TTL_MINUTES[purpose]],
    );
  });
  return token;
}

/** Seconds until another token of this purpose may be sent to the account; 0 means now. */
export async function tokenCooldown(accountId: string, purpose: AuthTokenPurpose): Promise<number> {
  const [row] = (await AppDataSource.query(
    `SELECT count(*)::int AS "count",
            EXTRACT(EPOCH FROM now() - max(created_at))::float AS "newestAge",
            EXTRACT(EPOCH FROM now() - min(created_at))::float AS "oldestAge"
       FROM auth_tokens
      WHERE account_id = $1 AND purpose = $2 AND created_at > now() - interval '1 hour'`,
    [accountId, purpose],
  )) as { count: number; newestAge: number | null; oldestAge: number | null }[];
  if (row.count >= TOKENS_PER_HOUR && row.oldestAge !== null) return Math.ceil(3600 - row.oldestAge);
  if (row.newestAge !== null && row.newestAge < TOKEN_RESEND_SECONDS) {
    return Math.ceil(TOKEN_RESEND_SECONDS - row.newestAge);
  }
  return 0;
}

/** The account a live (unused, unexpired) token belongs to, without using it up. */
export async function peekToken(token: string, purpose: AuthTokenPurpose): Promise<string | null> {
  if (!TOKEN_SHAPE.test(token)) return null;
  const [row] = (await AppDataSource.query(
    `SELECT account_id AS "accountId" FROM auth_tokens
      WHERE token_hash = $1 AND purpose = $2 AND consumed_at IS NULL AND expires_at > now()`,
    [hashToken(token), purpose],
  )) as { accountId: string }[];
  return row?.accountId ?? null;
}

/**
 * Uses a live token up and returns its account, or null when it is unknown,
 * expired or already used. The conditional UPDATE makes this atomic: of two
 * concurrent requests with the same token, exactly one gets the account.
 */
export async function consumeToken(
  token: string,
  purpose: AuthTokenPurpose,
  manager: EntityManager = AppDataSource.manager,
): Promise<string | null> {
  if (!TOKEN_SHAPE.test(token)) return null;
  // Through a CTE: a bare UPDATE … RETURNING comes back from TypeORM as [rows, rowCount].
  const [row] = (await manager.query(
    `WITH used AS (
       UPDATE auth_tokens SET consumed_at = now()
        WHERE token_hash = $1 AND purpose = $2 AND consumed_at IS NULL AND expires_at > now()
       RETURNING account_id
     )
     SELECT account_id AS "accountId" FROM used`,
    [hashToken(token), purpose],
  )) as { accountId: string }[];
  return row?.accountId ?? null;
}

/** Revokes every outstanding token of a purpose (e.g. other reset links once the password changed). */
export async function revokeTokens(
  accountId: string,
  purpose: AuthTokenPurpose,
  manager: EntityManager = AppDataSource.manager,
): Promise<void> {
  await manager.query(
    `UPDATE auth_tokens SET consumed_at = now() WHERE account_id = $1 AND purpose = $2 AND consumed_at IS NULL`,
    [accountId, purpose],
  );
}
