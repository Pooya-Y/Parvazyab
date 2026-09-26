import type { ObjectLiteral, SelectQueryBuilder } from "typeorm";

/**
 * The one definition of a listing travellers may see. Every public read (search,
 * calendars, trends, destinations) goes through one of these two forms, which must
 * stay equivalent: raw SQL over alias `f`, or a TypeORM query builder.
 */
export const VISIBLE_LISTING_SQL = "f.is_active AND f.depart_at > now()";

export function whereVisible<T extends ObjectLiteral>(qb: SelectQueryBuilder<T>, alias = "f"): SelectQueryBuilder<T> {
  return qb.andWhere(`${alias}.isActive = true`).andWhere(`${alias}.departAt > now()`);
}
