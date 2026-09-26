import { AppDataSource } from "../database/dataSource";
import { GUEST_EMAIL_DOMAIN } from "../auth/auth";

/**
 * Guest accounts can't sign back in once their 7-day session cookie expires, so
 * after 14 days they (and their saved flights, via ON DELETE CASCADE) are dead data.
 */
export async function purgeStaleGuests(olderThanDays = 14): Promise<number> {
  // Counted through a CTE: for a bare DELETE, TypeORM's raw query result is [rows, rowCount].
  const [{ count }] = (await AppDataSource.query(
    `WITH purged AS (
       DELETE FROM accounts
        WHERE email LIKE $2
          AND role = 'user'
          AND created_at < now() - make_interval(days => $1)
       RETURNING 1
     )
     SELECT count(*)::int AS count FROM purged`,
    [olderThanDays, `guest-%@${GUEST_EMAIL_DOMAIN}`],
  )) as { count: number }[];
  return count;
}

/**
 * Emailed-link tokens are dead once used or expired. A day's grace keeps recent
 * ones around for the resend cooldown, which looks back one hour.
 */
export async function purgeDeadAuthTokens(): Promise<number> {
  const [{ count }] = (await AppDataSource.query(
    `WITH purged AS (
       DELETE FROM auth_tokens
        WHERE COALESCE(consumed_at, expires_at) < now() - interval '1 day'
       RETURNING 1
     )
     SELECT count(*)::int AS count FROM purged`,
  )) as { count: number }[];
  return count;
}

/** The audit log keeps a year of history. */
export async function purgeOldAuditEntries(olderThanDays = 365): Promise<number> {
  const [{ count }] = (await AppDataSource.query(
    `WITH purged AS (
       DELETE FROM audit_log WHERE created_at < now() - make_interval(days => $1) RETURNING 1
     )
     SELECT count(*)::int AS count FROM purged`,
    [olderThanDays],
  )) as { count: number }[];
  return count;
}
