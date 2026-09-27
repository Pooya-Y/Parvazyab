import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "../config/env";

/**
 * Signed links for leaving one alert's emails without signing in (the link in
 * the email, and the List-Unsubscribe one-click POST). The signature covers only
 * that alert's id, so it can do nothing else.
 */
export function unsubscribeSignature(alertId: string): string {
  return createHmac("sha256", config.JWT_SECRET).update(`alert-unsubscribe:${alertId}`).digest("base64url");
}

export function isValidUnsubscribeSignature(alertId: string, signature: string): boolean {
  const expected = Buffer.from(unsubscribeSignature(alertId));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
