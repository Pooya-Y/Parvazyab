import type { ObjectLiteral, SelectQueryBuilder } from "typeorm";

/**
 * The one definition of a listing travellers may see. Every public read (search,
 * calendars, trends, destinations, alerts, the "buy" redirect) goes through one
 * of these two forms, which must stay equivalent: raw SQL over alias `f`, or a
 * TypeORM query builder.
 *
 * Visible: active, not yet departed, not suspended by an administrator, and not
 * sold by an agency whose account is suspended.
 */
const OWNER_NOT_SUSPENDED = (alias: string) =>
  `NOT EXISTS (SELECT 1 FROM accounts owner WHERE owner.id = "${alias}"."account_id" AND owner.suspended_at IS NOT NULL)`;

export const VISIBLE_LISTING_SQL = `f.is_active AND f.depart_at > now() AND f.suspended_at IS NULL AND ${OWNER_NOT_SUSPENDED("f")}`;

export function whereVisible<T extends ObjectLiteral>(qb: SelectQueryBuilder<T>, alias = "f"): SelectQueryBuilder<T> {
  return qb
    .andWhere(`${alias}.isActive = true`)
    .andWhere(`${alias}.departAt > now()`)
    .andWhere(`${alias}.suspendedAt IS NULL`)
    .andWhere(OWNER_NOT_SUSPENDED(alias));
}
