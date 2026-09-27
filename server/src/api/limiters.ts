import rateLimit, { type Options } from "express-rate-limit";

/**
 * Per-IP limits for the endpoints worth attacking. Behind nginx, `trust proxy`
 * makes req.ip the real client address. The general /api limit lives in app.ts.
 */
const limiter = (windowMinutes: number, limit: number, extra: Partial<Options> = {}) =>
  rateLimit({
    windowMs: windowMinutes * 60_000,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "RATE_LIMITED" },
    ...extra,
  });

/** Password and code guessing: only failures count. Not for `/auth/me`, which every page load calls. */
export const credentialLimiter = limiter(15, 20, { skipSuccessfulRequests: true });

/** Guessing the current password through a hijacked session must be slow. */
export const passwordChangeLimiter = limiter(15, 10, { skipSuccessfulRequests: true });

/** Every forgot-password request succeeds, so all of them count. */
export const resetRequestLimiter = limiter(15, 8);

/** Guest accounts are cheap to create. */
export const guestLimiter = limiter(60, 10);

/** Reporting offers: plenty for a traveller, not enough to flood the moderation queue. */
export const reportLimiter = limiter(60, 30);

/**
 * Each code is an SMS we pay for. Per-number limits (auth/otp.ts) stop
 * harassment of one number; this stops one client spraying many numbers.
 */
export const otpRequestLimiter = limiter(15, 6);
