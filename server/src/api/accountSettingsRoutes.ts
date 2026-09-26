import { Router } from "express";
import rateLimit from "express-rate-limit";
import { accounts } from "../database/dataSource";
import { requireUser, revokeSessions, sanitizeUser, sessionUser, setSession } from "../auth/auth";
import { changePassword, resendVerificationEmail } from "../services/accountSecurity";
import { audit } from "../services/audit";
import { changePasswordSchema, profileSchema } from "./schemas";

/** `/api/account`: the signed-in user's own profile, password, email and sessions. */
const router = Router();
router.use(requireUser);

/** Guessing the current password through a hijacked session must be slow. */
const passwordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: "RATE_LIMITED" },
});

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
router.put("/password", passwordLimiter, async (req, res) => {
  const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
  const user = await changePassword(sessionUser(res), currentPassword, newPassword, req);
  setSession(res, user);
  res.json({ user: sanitizeUser(user) });
});

router.post("/email/verification", async (_req, res) => {
  await resendVerificationEmail(sessionUser(res));
  res.status(202).json({ ok: true });
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
