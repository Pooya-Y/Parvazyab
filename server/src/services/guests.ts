import { AppDataSource, accounts } from "../database/dataSource";
import type { Account } from "../database/entities";
import { isGuestAccount } from "../auth/auth";

/**
 * A guest who signs up keeps everything they saved: the guest account itself
 * becomes the permanent one. The session version moves on, so a copy of the old
 * guest cookie can't follow it into the real account.
 */
export async function upgradeGuest(
  guest: Account,
  fields: { name: string; email: string; passwordHash: string },
): Promise<Account> {
  await accounts().update(guest.id, { ...fields, sessionVersion: () => "session_version + 1" });
  return accounts().findOneByOrFail({ id: guest.id });
}

/**
 * Signing in to an existing account from a guest session carries the guest's
 * saved flights over (skipping ones the account already has), then removes the
 * guest, whose session is about to be replaced anyway.
 */
export async function mergeGuestInto(guest: Account, account: Account): Promise<void> {
  if (guest.id === account.id || !isGuestAccount(guest)) return;
  await AppDataSource.transaction(async (m) => {
    await m.query(
      `UPDATE saved_flights s SET account_id = $2
        WHERE s.account_id = $1
          AND NOT EXISTS (SELECT 1 FROM saved_flights t WHERE t.account_id = $2 AND t.flight_key = s.flight_key)`,
      [guest.id, account.id],
    );
    await m.query(`DELETE FROM accounts WHERE id = $1`, [guest.id]);
  });
}
