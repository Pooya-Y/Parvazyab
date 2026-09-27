import { accounts, isUniqueViolation } from "../database/dataSource";
import type { Account } from "../database/entities";
import { isGuestAccount } from "../auth/auth";
import { verifyOtp } from "../auth/otp";
import { mergeGuestInto, upgradeGuest } from "./guests";

/** Until they pick one, accounts made by SMS code are addressed as "traveller". */
export const DEFAULT_PHONE_ACCOUNT_NAME = "مسافر";

/**
 * Finishes SMS sign-in: the verified number signs in to its account, or
 * becomes a new one. From a guest session the guest's saved flights come
 * along, as with email sign-up and sign-in.
 */
export async function signInWithCode(
  challengeId: string,
  code: string,
  current: Account | null,
): Promise<{ user: Account; created: boolean }> {
  const phone = await verifyOtp(challengeId, code, "login");
  const guest = current && isGuestAccount(current) ? current : null;

  const existing = await accounts().findOne({ where: { phone } });
  if (existing) {
    if (guest) await mergeGuestInto(guest, existing);
    return { user: existing, created: false };
  }

  const fields = { phone, phoneVerifiedAt: new Date(), name: DEFAULT_PHONE_ACCOUNT_NAME };
  if (guest) {
    // The guest's placeholder address and throwaway password go; the number is its sign-in now.
    return { user: await upgradeGuest(guest, { ...fields, email: null, passwordHash: null }), created: true };
  }
  const repo = accounts();
  try {
    return {
      user: await repo.save(repo.create({ ...fields, email: null, passwordHash: null, role: "user" })),
      created: true,
    };
  } catch (err) {
    // Defensive: a concurrent sign-in created the account for this number first.
    if (!isUniqueViolation(err)) throw err;
    return { user: await accounts().findOneOrFail({ where: { phone } }), created: false };
  }
}
