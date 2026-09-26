import { AppDataSource } from "../database/dataSource";

/**
 * Guest accounts can't sign back in once their 7-day session cookie expires, so
 * after 14 days they (and their saved flights, via ON DELETE CASCADE) are dead data.
 */
export async function purgeStaleGuests(olderThanDays = 14): Promise<number> {
  // Counted through a CTE: for a bare DELETE, TypeORM's raw query result is [rows, rowCount].
  const [{ count }] = (await AppDataSource.query(
    `WITH purged AS (
       DELETE FROM accounts
        WHERE email LIKE 'guest-%@guest.parvazyab.local'
          AND role = 'user'
          AND created_at < now() - make_interval(days => $1)
       RETURNING 1
     )
     SELECT count(*)::int AS count FROM purged`,
    [olderThanDays],
  )) as { count: number }[];
  return count;
}
