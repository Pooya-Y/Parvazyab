import { createHmac } from "node:crypto";
import type { Request } from "express";
import { AppDataSource } from "../database/dataSource";
import { config } from "../config/env";

/** Security-relevant and administrative actions. Stable identifiers: the admin UI filters on them. */
export const AUDIT_ACTIONS = [
  "auth.password_reset_requested",
  "auth.password_reset",
  "auth.password_changed",
  "auth.email_verified",
  "auth.sessions_revoked",
  "account.profile_updated",
  "account.became_agency",
  "account.phone_linked",
  "account.phone_removed",
  "account.email_added",
  "admin.role_changed",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface AuditEvent {
  actorId: string | null;
  action: AuditAction;
  targetType?: "account" | "listing" | "review" | "api_key";
  targetId?: string;
  details?: Record<string, unknown>;
}

/**
 * Pseudonymous client address: the same IP always maps to the same value, so
 * abuse can be correlated, but the log never stores the address itself.
 */
export function hashIp(ip: string | undefined): string | null {
  if (!ip) return null;
  return createHmac("sha256", config.JWT_SECRET).update(`audit-ip:${ip}`).digest("hex");
}

export async function audit(req: Request | null, event: AuditEvent): Promise<void> {
  await AppDataSource.query(
    `INSERT INTO audit_log (actor_id, action, target_type, target_id, details, ip_hash)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      event.actorId,
      event.action,
      event.targetType ?? null,
      event.targetId ?? null,
      JSON.stringify(event.details ?? {}),
      hashIp(req?.ip),
    ],
  );
}
