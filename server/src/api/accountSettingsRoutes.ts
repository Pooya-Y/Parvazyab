import { Router } from "express";
import { accounts, isUniqueViolation } from "../database/dataSource";
import {
  hashPassword,
  isGuestAccount,
  requireUser,
  revokeSessions,
  sanitizeUser,
  sessionUser,
  setSession,
} from "../auth/auth";
import { OTP_RESEND_SECONDS, createOtpChallenge, otpCooldown, verifyOtp } from "../auth/otp";
import { nationalMobile } from "../domain/phone";
import { HttpError } from "../http/errors";
import { runInBackground } from "../lib/background";
import { otpText, sendOtpSms } from "../notify/sms";
import { changePassword, queueVerificationEmail, resendVerificationEmail } from "../services/accountSecurity";
import { audit } from "../services/audit";
import { credentialLimiter, otpRequestLimiter, passwordChangeLimiter } from "./limiters";
import { addEmailSchema, changePasswordSchema, otpRequestSchema, otpVerifySchema, profileSchema } from "./schemas";

/** `/api/account`: the signed-in user's own profile, password, email and sessions. */
const router = Router();
router.use(requireUser);

router.patch("/profile", async (req, res) => {
  const user = sessionUser(res);
  const { name } = profileSchema.parse(req.body);
  if (name !== user.name) {
    await accounts().update(user.id, { name });
    await audit(req, { actorId: user.id, action: "account.profile_updated", targetType: "account", targetId: user.id });
  }
  res.json({ user: sanitizeUser({ ...user, name }) });
});

/** Every other session ends; this browser gets a fresh cookie so it stays signed in. */
router.put("/password", passwordChangeLimiter, async (req, res) => {
  const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
  const user = await changePassword(sessionUser(res), currentPassword, newPassword, req);
  setSession(res, user);
  res.json({ user: sanitizeUser(user) });
});

router.post("/email/verification", async (_req, res) => {
  await resendVerificationEmail(sessionUser(res));
  res.status(202).json({ ok: true });
});

/** Step one of adding (or replacing) the account's mobile number: a code to the new number. */
router.post("/phone/verification", otpRequestLimiter, async (req, res) => {
  const user = sessionUser(res);
  if (isGuestAccount(user)) throw new HttpError(403, "GUEST_ACCOUNT");
  const { phone } = otpRequestSchema.parse(req.body);
  if (user.phone === phone) throw new HttpError(409, "PHONE_ALREADY_LINKED");
  if (await accounts().exists({ where: { phone } })) throw new HttpError(409, "PHONE_IN_USE");
  const wait = await otpCooldown(phone);
  if (wait > 0) throw new HttpError(429, "OTP_TOO_SOON", { "Retry-After": String(wait) });
  const challenge = await createOtpChallenge(phone, "link", user.id);
  runInBackground("phone-link SMS", () =>
    sendOtpSms({ to: phone, code: challenge.code, text: otpText(challenge.code) }),
  );
  res.status(201).json({
    challengeId: challenge.id,
    phone,
    expiresAt: challenge.expiresAt.getTime(),
    resendAfter: OTP_RESEND_SECONDS,
  });
});

/** Step two: the code proves the number is the user's. */
router.put("/phone", credentialLimiter, async (req, res) => {
  const user = sessionUser(res);
  const { challengeId, code } = otpVerifySchema.parse(req.body);
  const phone = await verifyOtp(challengeId, code, "link", user.id);
  try {
    await accounts().update(user.id, { phone, phoneVerifiedAt: new Date() });
  } catch (err) {
    // Someone else verified the same number between the two steps.
    if (isUniqueViolation(err)) throw new HttpError(409, "PHONE_IN_USE");
    throw err;
  }
  await audit(req, {
    actorId: user.id,
    action: "account.phone_linked",
    targetType: "account",
    targetId: user.id,
    details: { phone: nationalMobile(phone) },
  });
  res.json({ user: sanitizeUser(await accounts().findOneByOrFail({ id: user.id })) });
});

router.delete("/phone", async (req, res) => {
  const user = sessionUser(res);
  // Without an email the number is the only way back in.
  if (!user.email) throw new HttpError(400, "LAST_SIGN_IN_METHOD");
  if (user.phone) {
    await accounts().update(user.id, { phone: null, phoneVerifiedAt: null });
    await audit(req, { actorId: user.id, action: "account.phone_removed", targetType: "account", targetId: user.id });
  }
  res.json({ user: sanitizeUser({ ...user, phone: null, phoneVerifiedAt: null }) });
});

/** Accounts created by SMS code can add an email and password (for email sign-in and mail). */
router.post("/email", passwordChangeLimiter, async (req, res) => {
  const user = sessionUser(res);
  if (user.email) throw new HttpError(409, "EMAIL_ALREADY_SET");
  const { email, password } = addEmailSchema.parse(req.body);
  if (await accounts().exists({ where: { email } })) throw new HttpError(409, "ACCOUNT_ALREADY_EXISTS");
  try {
    await accounts().update(user.id, {
      email,
      passwordHash: await hashPassword(password),
      passwordChangedAt: new Date(),
      emailVerifiedAt: null,
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new HttpError(409, "ACCOUNT_ALREADY_EXISTS");
    throw err;
  }
  const updated = await accounts().findOneByOrFail({ id: user.id });
  queueVerificationEmail(updated);
  await audit(req, { actorId: user.id, action: "account.email_added", targetType: "account", targetId: user.id });
  res.json({ user: sanitizeUser(updated) });
});

/** "Sign out of other devices". */
router.delete("/sessions", async (req, res) => {
  const user = sessionUser(res);
  const sessionVersion = await revokeSessions(user.id);
  setSession(res, { id: user.id, sessionVersion });
  await audit(req, { actorId: user.id, action: "auth.sessions_revoked", targetType: "account", targetId: user.id });
  res.status(204).end();
});

export default router;
