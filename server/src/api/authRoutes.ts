import { Router } from "express";
import rateLimit from "express-rate-limit";
import { accounts, isUniqueViolation } from "../database/dataSource";
import {
  clearSession,
  createGuest,
  currentUser,
  hashPassword,
  sanitizeUser,
  setSession,
  verifyPassword,
} from "../auth/auth";
import { HttpError } from "../http/errors";
import { runInBackground } from "../lib/background";
import { queueVerificationEmail, requestPasswordReset, resetPassword, verifyEmail } from "../services/accountSecurity";
import { forgotPasswordSchema, loginSchema, registerSchema, resetPasswordSchema, verifyEmailSchema } from "./schemas";

const router = Router();

/** Brute-force protection for credential endpoints only — not for `/auth/me`. */
const credentialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: "RATE_LIMITED" },
});

/** Every forgot-password request succeeds, so count all of them, not just failures. */
const resetRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "RATE_LIMITED" },
});

/** Guest accounts are cheap to create, so cap them per IP. */
const guestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "RATE_LIMITED" },
});

router.get("/me", async (req, res) => {
  res.json({ user: sanitizeUser(await currentUser(req)) });
});

router.post("/register", credentialLimiter, async (req, res) => {
  const body = registerSchema.parse(req.body);
  const repo = accounts();
  if (await repo.exists({ where: { email: body.email } })) throw new HttpError(409, "ACCOUNT_ALREADY_EXISTS");
  let user;
  try {
    user = await repo.save(
      repo.create({
        name: body.name,
        email: body.email,
        passwordHash: await hashPassword(body.password),
        role: "user",
      }),
    );
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

/** Doesn't sign anyone in: the link may be opened on a device that should stay signed out. */
router.post("/email/verify", credentialLimiter, async (req, res) => {
  const { token } = verifyEmailSchema.parse(req.body);
  await verifyEmail(token, req);
  res.json({ ok: true });
});

export default router;
