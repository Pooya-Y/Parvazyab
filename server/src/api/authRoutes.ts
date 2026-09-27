import { Router } from "express";
import { accounts, isUniqueViolation } from "../database/dataSource";
import {
  clearSession,
  createGuest,
  currentUser,
  hashPassword,
  isGuestAccount,
  sanitizeUser,
  setSession,
  verifyPassword,
} from "../auth/auth";
import { HttpError } from "../http/errors";
import { runInBackground } from "../lib/background";
import { queueVerificationEmail, requestPasswordReset, resetPassword, verifyEmail } from "../services/accountSecurity";
import { mergeGuestInto, upgradeGuest } from "../services/guests";
import { signInWithCode } from "../services/phoneAuth";
import { OTP_RESEND_SECONDS, createOtpChallenge, otpCooldown } from "../auth/otp";
import { otpText, sendOtpSms } from "../notify/sms";
import { credentialLimiter, guestLimiter, otpRequestLimiter, resetRequestLimiter } from "./limiters";
import {
  forgotPasswordSchema,
  loginSchema,
  otpRequestSchema,
  otpVerifySchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from "./schemas";

const router = Router();

router.get("/me", async (req, res) => {
  res.json({ user: sanitizeUser(await currentUser(req)) });
});

router.post("/register", credentialLimiter, async (req, res) => {
  const body = registerSchema.parse(req.body);
  const repo = accounts();
  if (await repo.exists({ where: { email: body.email } })) throw new HttpError(409, "ACCOUNT_ALREADY_EXISTS");
  const fields = { name: body.name, email: body.email, passwordHash: await hashPassword(body.password) };
  const current = await currentUser(req);
  let user;
  try {
    // Signing up from a guest session keeps the guest's saved flights.
    user =
      current && isGuestAccount(current)
        ? await upgradeGuest(current, fields)
        : await repo.save(repo.create({ ...fields, role: "user" }));
  } catch (err) {
    if (isUniqueViolation(err)) throw new HttpError(409, "ACCOUNT_ALREADY_EXISTS");
    throw err;
  }
  queueVerificationEmail(user);
  setSession(res, user);
  res.status(201).json({ user: sanitizeUser(user) });
});

router.post("/login", credentialLimiter, async (req, res) => {
  const body = loginSchema.parse(req.body);
  const user = await accounts().findOne({ where: { email: body.email } });
  if (!(await verifyPassword(body.password, user?.passwordHash)) || !user) {
    throw new HttpError(401, "INVALID_AUTHENTICATION");
  }
  const current = await currentUser(req);
  if (current && isGuestAccount(current)) await mergeGuestInto(current, user);
  setSession(res, user);
  res.json({ user: sanitizeUser(user) });
});

router.post("/guest", guestLimiter, async (_req, res) => {
  const user = await createGuest();
  setSession(res, user);
  res.status(201).json({ user: sanitizeUser(user) });
});

router.post("/logout", (_req, res) => {
  clearSession(res);
  res.status(204).end();
});

/** Always 202 and always immediate: the answer must not say whether the email has an account. */
router.post("/password/forgot", resetRequestLimiter, (req, res) => {
  const { email } = forgotPasswordSchema.parse(req.body);
  runInBackground("password reset request", () => requestPasswordReset(email, req));
  res.status(202).json({ ok: true });
});

/** Emailed-link reset: sets the password, ends every other session and signs this browser in. */
router.post("/password/reset", credentialLimiter, async (req, res) => {
  const { token, password } = resetPasswordSchema.parse(req.body);
  const user = await resetPassword(token, password, req);
  setSession(res, user);
  res.json({ user: sanitizeUser(user) });
});

/**
 * Starts SMS sign-in. The same answer for every number, registered or not: the
 * code signs in to an existing account or creates one.
 */
router.post("/otp/request", otpRequestLimiter, async (req, res) => {
  const { phone } = otpRequestSchema.parse(req.body);
  const wait = await otpCooldown(phone);
  if (wait > 0) throw new HttpError(429, "OTP_TOO_SOON", { "Retry-After": String(wait) });
  const challenge = await createOtpChallenge(phone, "login");
  runInBackground("sign-in SMS", () => sendOtpSms({ to: phone, code: challenge.code, text: otpText(challenge.code) }));
  res.status(201).json({
    challengeId: challenge.id,
    phone,
    expiresAt: challenge.expiresAt.getTime(),
    resendAfter: OTP_RESEND_SECONDS,
  });
});

router.post("/otp/verify", credentialLimiter, async (req, res) => {
  const { challengeId, code } = otpVerifySchema.parse(req.body);
  const { user, created } = await signInWithCode(challengeId, code, await currentUser(req));
  setSession(res, user);
  res.status(created ? 201 : 200).json({ user: sanitizeUser(user), created });
});

/** Doesn't sign anyone in: the link may be opened on a device that should stay signed out. */
router.post("/email/verify", credentialLimiter, async (req, res) => {
  const { token } = verifyEmailSchema.parse(req.body);
  await verifyEmail(token, req);
  res.json({ ok: true });
});

export default router;
