import type { Request } from "express";
import { AppDataSource, accounts } from "../database/dataSource";
import { AccountEntity, type Account } from "../database/entities";
import { hashPassword, isGuestAccount, verifyPassword } from "../auth/auth";
import { consumeToken, issueToken, peekToken, revokeTokens, tokenCooldown } from "../auth/tokens";
import { HttpError } from "../http/errors";
import { runInBackground } from "../lib/background";
import { sendMail } from "../notify/mailer";
import { passwordChangedMail, passwordResetMail, verifyEmailMail } from "../notify/templates";
import { audit } from "./audit";

const invalidToken = () => new HttpError(400, "INVALID_OR_EXPIRED_TOKEN");

/** Queues the verification email for a new (or unverified) account. */
export function queueVerificationEmail(account: Account): void {
  runInBackground("verification email", async () => {
    const token = await issueToken(account.id, "email_verify");
    await sendMail({ to: account.email, ...verifyEmailMail(account.name, token) });
  });
}

export async function resendVerificationEmail(user: Account): Promise<void> {
  if (isGuestAccount(user)) throw new HttpError(403, "GUEST_ACCOUNT");
  if (user.emailVerifiedAt) throw new HttpError(409, "EMAIL_ALREADY_VERIFIED");
  const wait = await tokenCooldown(user.id, "email_verify");
  if (wait > 0) throw new HttpError(429, "RESEND_TOO_SOON", { "Retry-After": String(wait) });
  queueVerificationEmail(user);
}

export async function verifyEmail(token: string, req: Request): Promise<void> {
  const accountId = await consumeToken(token, "email_verify");
  if (!accountId) throw invalidToken();
  await accounts()
    .createQueryBuilder()
    .update()
    .set({ emailVerifiedAt: () => "COALESCE(email_verified_at, now())" })
    .where("id = :id", { id: accountId })
    .execute();
  await audit(req, { actorId: accountId, action: "auth.email_verified", targetType: "account", targetId: accountId });
}

/**
 * The forgot-password work. The endpoint has already answered 202 by the time
 * this runs, identically for every email, so nothing here can reveal whether an
 * account exists: not the response, not its timing.
 */
export async function requestPasswordReset(email: string, req: Request): Promise<void> {
  const account = await accounts().findOne({ where: { email } });
  if (!account || isGuestAccount(account)) return;
  if ((await tokenCooldown(account.id, "password_reset")) > 0) return;
  const token = await issueToken(account.id, "password_reset");
  await sendMail({ to: account.email, ...passwordResetMail(account.name, account.email, token) });
  await audit(req, {
    actorId: null,
    action: "auth.password_reset_requested",
    targetType: "account",
    targetId: account.id,
  });
}

function notifyPasswordChanged(account: Account) {
  const at = account.passwordChangedAt ?? new Date();
  runInBackground("password-changed email", () =>
    sendMail({ to: account.email, ...passwordChangedMail(account.name, account.email, at) }),
  );
}

/** Sets a new password from an emailed link; every existing session ends. Returns the updated account. */
export async function resetPassword(token: string, password: string, req: Request): Promise<Account> {
  // A cheap check first so a stream of bad tokens can't make us burn bcrypt time;
  // the consume inside the transaction is the authoritative, atomic one.
  if (!(await peekToken(token, "password_reset"))) throw invalidToken();
  const passwordHash = await hashPassword(password);
  const account = await AppDataSource.transaction(async (m) => {
    const accountId = await consumeToken(token, "password_reset", m);
    if (!accountId) throw invalidToken();
    const repo = m.getRepository<Account>(AccountEntity);
    await repo.update(accountId, {
      passwordHash,
      passwordChangedAt: () => "now()",
      sessionVersion: () => "session_version + 1",
      // Following the emailed link proves the address works.
      emailVerifiedAt: () => "COALESCE(email_verified_at, now())",
    });
    return repo.findOneByOrFail({ id: accountId });
  });
  await audit(req, { actorId: account.id, action: "auth.password_reset", targetType: "account", targetId: account.id });
  notifyPasswordChanged(account);
  return account;
}

/** Changes the password of a signed-in user; every session, this one included, is revoked. */
export async function changePassword(
  user: Account,
  currentPassword: string,
  newPassword: string,
  req: Request,
): Promise<Account> {
  if (isGuestAccount(user)) throw new HttpError(403, "GUEST_ACCOUNT");
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new HttpError(400, "INVALID_CURRENT_PASSWORD");
  }
  if (await verifyPassword(newPassword, user.passwordHash)) throw new HttpError(400, "PASSWORD_UNCHANGED");
  const passwordHash = await hashPassword(newPassword);
  await accounts().update(user.id, {
    passwordHash,
    passwordChangedAt: () => "now()",
    sessionVersion: () => "session_version + 1",
  });
  // A reset link sitting in a mailbox would otherwise undo the change.
  await revokeTokens(user.id, "password_reset");
  const updated = await accounts().findOneByOrFail({ id: user.id });
  await audit(req, { actorId: user.id, action: "auth.password_changed", targetType: "account", targetId: user.id });
  notifyPasswordChanged(updated);
  return updated;
}
