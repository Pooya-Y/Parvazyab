import { createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { AppDataSource } from "../database/dataSource";
import { config } from "../config/env";
import { HttpError } from "../http/errors";

/**
 * One-time SMS codes. Six digits, two minutes, five guesses; only an HMAC of
 * the code (bound to its challenge id) is stored. Sending is rationed per number
 * because every SMS costs money and a number can be targeted for harassment.
 */
export type OtpPurpose = "login" | "link";

export const OTP_TTL_SECONDS = 120;
export const OTP_RESEND_SECONDS = 60;
const OTP_MAX_ATTEMPTS = 5;
const OTP_PER_HOUR = 5;
const OTP_PER_DAY = 10;

const codeHash = (challengeId: string, code: string) =>
  createHmac("sha256", config.JWT_SECRET).update(`otp:${challengeId}:${code}`).digest("hex");

/** Seconds until another code may be sent to this number; 0 means now. */
export async function otpCooldown(phone: string): Promise<number> {
  const [row] = (await AppDataSource.query(
    `SELECT count(*) FILTER (WHERE created_at > now() - interval '1 hour')::int AS "lastHour",
            count(*)::int AS "lastDay",
            EXTRACT(EPOCH FROM now() - max(created_at))::float AS "newestAge",
            EXTRACT(EPOCH FROM now() - min(created_at) FILTER (WHERE created_at > now() - interval '1 hour'))::float
              AS "oldestInHourAge",
            EXTRACT(EPOCH FROM now() - min(created_at))::float AS "oldestAge"
       FROM otp_challenges
      WHERE phone = $1 AND created_at > now() - interval '1 day'`,
    [phone],
  )) as {
    lastHour: number;
    lastDay: number;
    newestAge: number | null;
    oldestInHourAge: number | null;
    oldestAge: number | null;
  }[];
  if (row.lastDay >= OTP_PER_DAY && row.oldestAge !== null) return Math.ceil(86_400 - row.oldestAge);
  if (row.lastHour >= OTP_PER_HOUR && row.oldestInHourAge !== null) return Math.ceil(3600 - row.oldestInHourAge);
  if (row.newestAge !== null && row.newestAge < OTP_RESEND_SECONDS)
    return Math.ceil(OTP_RESEND_SECONDS - row.newestAge);
  return 0;
}

export interface OtpChallenge {
  id: string;
  code: string;
  expiresAt: Date;
}

/** Starts a challenge; any earlier open one for the same number and purpose stops working. */
export async function createOtpChallenge(
  phone: string,
  purpose: OtpPurpose,
  accountId?: string,
): Promise<OtpChallenge> {
  const id = randomUUID();
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const [row] = await AppDataSource.transaction(async (m) => {
    await m.query(
      `UPDATE otp_challenges SET consumed_at = now() WHERE phone = $1 AND purpose = $2 AND consumed_at IS NULL`,
      [phone, purpose],
    );
    return (await m.query(
      `INSERT INTO otp_challenges (id, phone, purpose, account_id, code_hash, expires_at)
       VALUES ($1, $2, $3, $4, $5, now() + make_interval(secs => $6))
       RETURNING expires_at AS "expiresAt"`,
      [id, phone, purpose, accountId ?? null, codeHash(id, code), OTP_TTL_SECONDS],
    )) as { expiresAt: Date }[];
  });
  return { id, code, expiresAt: row.expiresAt };
}

/**
 * Checks a code and, if it matches, uses the challenge up. Returns the verified
 * number. Every guess counts, right or wrong; after five the challenge is dead.
 * `accountId` must match for "link" challenges, which belong to one account.
 */
export async function verifyOtp(
  challengeId: string,
  code: string,
  purpose: OtpPurpose,
  accountId?: string,
): Promise<string> {
  // Through CTEs: a bare UPDATE … RETURNING comes back from TypeORM as [rows, rowCount].
  const [challenge] = (await AppDataSource.query(
    `WITH counted AS (
       UPDATE otp_challenges SET attempts = attempts + 1
        WHERE id = $1 AND purpose = $2 AND consumed_at IS NULL AND expires_at > now() AND attempts < $3
       RETURNING phone, code_hash, account_id, attempts
     )
     SELECT phone, code_hash AS "codeHash", account_id AS "accountId", attempts FROM counted`,
    [challengeId, purpose, OTP_MAX_ATTEMPTS],
  )) as { phone: string; codeHash: string; accountId: string | null; attempts: number }[];
  if (!challenge || (purpose === "link" && challenge.accountId !== accountId)) {
    throw new HttpError(400, "OTP_EXPIRED");
  }

  const expected = Buffer.from(challenge.codeHash, "hex");
  const actual = Buffer.from(codeHash(challengeId, code), "hex");
  if (!timingSafeEqual(expected, actual)) {
    throw new HttpError(400, challenge.attempts >= OTP_MAX_ATTEMPTS ? "OTP_EXPIRED" : "OTP_INVALID");
  }

  const [used] = (await AppDataSource.query(
    `WITH used AS (
       UPDATE otp_challenges SET consumed_at = now() WHERE id = $1 AND consumed_at IS NULL RETURNING 1 AS ok
     )
     SELECT ok FROM used`,
    [challengeId],
  )) as { ok: number }[];
  // Lost a race with a concurrent correct guess: the code was used once, by the other request.
  if (!used) throw new HttpError(400, "OTP_EXPIRED");
  return challenge.phone;
}
