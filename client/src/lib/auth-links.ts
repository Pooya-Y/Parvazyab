/**
 * Emailed links carry their token in the URL fragment (`/auth/reset#token=…`):
 * browsers never send the fragment to a server, so it stays out of access logs
 * and Referer headers.
 */
export function tokenFromHash(hash: string): string | null {
  const token = new URLSearchParams(hash.replace(/^#/, "")).get("token");
  return token && /^[A-Za-z0-9_-]{16,128}$/.test(token) ? token : null;
}
