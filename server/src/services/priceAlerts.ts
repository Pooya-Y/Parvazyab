import { AppDataSource, priceAlerts } from "../database/dataSource";
import type { Account, PriceAlert } from "../database/entities";
import { cityName, formatTehranDay, formatTomanFa } from "../domain/format";
import { TEHRAN_OFFSET_MINUTES, tehranTodayKey } from "../domain/time";
import { HttpError, notFound } from "../http/errors";
import type { AlertInput, AlertPatch } from "../api/schemas";
import { isValidUnsubscribeSignature } from "./alertLinks";
import { notify } from "./notifications";
import { VISIBLE_LISTING_SQL } from "./visibility";

/** Without dates, an alert watches every flight in this many days ahead. */
export const FLEXIBLE_WINDOW_DAYS = 30;
export const MAX_ACTIVE_ALERTS = 20;
/** Without a target, "cheaper" means at least this much (basis points) below the fare when the alert was made. */
export const FIRST_DROP_BP = 300;
/** After a notification, only a further drop this large (basis points) is news. */
export const FURTHER_DROP_BP = 200;

/** `price` is at least `bp` basis points below `reference`, in exact integer arithmetic. */
const dropped = (price: number, reference: number, bp: number) => price * 10_000 <= reference * (10_000 - bp);

export interface AlertPrices {
  targetPrice: number | null;
  baselinePrice: number | null;
  lastNotifiedPrice: number | null;
}

export type AlertDecision =
  | { notify: true; reason: "target" | "drop" }
  | { notify: false; /** A first fare to measure drops against. */ baseline?: number };

/**
 * Whether the current lowest fare is worth telling the user about. Pure, so the
 * rules are tested directly:
 * - with a target: once the fare reaches it;
 * - without: once it is 3% below the fare when the alert was made;
 * - after a notification: only when it falls another 2%, so a price
 *   bouncing around the threshold doesn't notify every time it dips.
 */
export function decideAlert(prices: AlertPrices, lowest: number | null): AlertDecision {
  if (lowest === null) return { notify: false };
  const { targetPrice, baselinePrice, lastNotifiedPrice } = prices;
  const reason = targetPrice !== null ? "target" : "drop";
  if (targetPrice !== null && lowest > targetPrice) return { notify: false };
  if (lastNotifiedPrice !== null) {
    return dropped(lowest, lastNotifiedPrice, FURTHER_DROP_BP) ? { notify: true, reason } : { notify: false };
  }
  if (targetPrice !== null) return { notify: true, reason };
  // Nothing was flying when the alert was made: this first fare becomes the baseline.
  if (baselinePrice === null) return { notify: false, baseline: lowest };
  return dropped(lowest, baselinePrice, FIRST_DROP_BP) ? { notify: true, reason } : { notify: false };
}

// ---------------------------------------------------------------------------
// The lowest fare an alert is watching
// ---------------------------------------------------------------------------

/** SQL (alias `a` = price_alerts): the Tehran-midnight instants bounding the alert's window. */
const windowStart = `CASE WHEN a.date_from IS NULL THEN now()
  ELSE (a.date_from::timestamp - interval '${TEHRAN_OFFSET_MINUTES} minutes') AT TIME ZONE 'UTC' END`;
const windowEnd = `CASE WHEN a.date_to IS NULL THEN now() + interval '${FLEXIBLE_WINDOW_DAYS} days'
  ELSE ((a.date_to + 1)::timestamp - interval '${TEHRAN_OFFSET_MINUTES} minutes') AT TIME ZONE 'UTC' END`;

/** Per alert, the cheapest visible listing in its window (a LATERAL join rides the route+departure index). */
const LOWEST_FARE_JOIN = `LEFT JOIN LATERAL (
    SELECT f.price_toman AS price, f.depart_at AS "departAt"
      FROM flight_listings f
     WHERE f.origin_code = a.origin_code
       AND f.destination_code = a.destination_code
       AND f.depart_at >= ${windowStart}
       AND f.depart_at < ${windowEnd}
       AND (a.cabin IS NULL OR f.cabin = a.cabin)
       AND ${VISIBLE_LISTING_SQL}
     ORDER BY f.price_toman, f.depart_at
     LIMIT 1
  ) low ON true`;

interface LowestRow {
  price: string | null;
  departAt: Date | null;
}

async function lowestFareFor(alertId: string): Promise<{ price: number | null; departAt: Date | null }> {
  const [row] = (await AppDataSource.query(
    `SELECT low.price, low."departAt" FROM price_alerts a ${LOWEST_FARE_JOIN} WHERE a.id = $1`,
    [alertId],
  )) as LowestRow[];
  return { price: row?.price === null || !row ? null : Number(row.price), departAt: row?.departAt ?? null };
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export function serializeAlert(a: PriceAlert) {
  return {
    id: a.id,
    originCode: a.originCode,
    destinationCode: a.destinationCode,
    dateFrom: a.dateFrom,
    dateTo: a.dateTo,
    cabin: a.cabin,
    targetPrice: a.targetPriceToman,
    baselinePrice: a.baselinePriceToman,
    lastPrice: a.lastPriceToman,
    lastCheckedAt: a.lastCheckedAt?.getTime() ?? null,
    lastNotifiedPrice: a.lastNotifiedPriceToman,
    lastNotifiedAt: a.lastNotifiedAt?.getTime() ?? null,
    notifyEmail: a.notifyEmail,
    isActive: a.isActive,
    createdAt: a.createdAt.getTime(),
  };
}

export async function listAlerts(accountId: string) {
  const rows = await priceAlerts().find({ where: { accountId }, order: { isActive: "DESC", createdAt: "DESC" } });
  return rows.map(serializeAlert);
}

async function ownAlert(accountId: string, id: string): Promise<PriceAlert> {
  const alert = await priceAlerts().findOne({ where: { id, accountId } });
  if (!alert) throw notFound();
  return alert;
}

/** Records the fare right now as the alert's baseline, so the list can show it immediately. */
async function refreshBaseline(alert: PriceAlert): Promise<PriceAlert> {
  const { price } = await lowestFareFor(alert.id);
  await priceAlerts().update(alert.id, {
    baselinePriceToman: price,
    lastPriceToman: price,
    lastCheckedAt: new Date(),
  });
  return priceAlerts().findOneByOrFail({ id: alert.id });
}

export async function createAlert(account: Account, input: AlertInput) {
  const repo = priceAlerts();
  const active = await repo.count({ where: { accountId: account.id, isActive: true } });
  if (active >= MAX_ACTIVE_ALERTS) throw new HttpError(409, "ALERT_LIMIT_REACHED");
  const [duplicate] = (await AppDataSource.query(
    `SELECT 1 FROM price_alerts
      WHERE account_id = $1 AND is_active AND origin_code = $2 AND destination_code = $3
        AND date_from IS NOT DISTINCT FROM $4::date AND date_to IS NOT DISTINCT FROM $5::date
        AND cabin IS NOT DISTINCT FROM $6`,
    [
      account.id,
      input.originCode,
      input.destinationCode,
      input.dateFrom ?? null,
      input.dateTo ?? null,
      input.cabin ?? null,
    ],
  )) as unknown[];
  if (duplicate) throw new HttpError(409, "ALERT_EXISTS");

  const alert = await repo.save(
    repo.create({
      accountId: account.id,
      originCode: input.originCode,
      destinationCode: input.destinationCode,
      dateFrom: input.dateFrom ?? null,
      dateTo: input.dateTo ?? null,
      cabin: input.cabin ?? null,
      targetPriceToman: input.targetPrice ?? null,
      notifyEmail: input.notifyEmail,
    }),
  );
  return serializeAlert(await refreshBaseline(alert));
}

export async function updateAlert(accountId: string, id: string, patch: AlertPatch) {
  const alert = await ownAlert(accountId, id);
  const changes: Partial<PriceAlert> = {};
  if (patch.notifyEmail !== undefined) changes.notifyEmail = patch.notifyEmail;
  if (patch.targetPrice !== undefined && patch.targetPrice !== alert.targetPriceToman) {
    changes.targetPriceToman = patch.targetPrice;
    // A new target starts over: its first match is news even if an older one was reported.
    changes.lastNotifiedPriceToman = null;
    changes.lastNotifiedAt = null;
  }
  if (patch.isActive !== undefined && patch.isActive !== alert.isActive) {
    if (patch.isActive) {
      if (alert.dateTo !== null && alert.dateTo < tehranTodayKey()) throw new HttpError(409, "ALERT_EXPIRED");
      const active = await priceAlerts().count({ where: { accountId, isActive: true } });
      if (active >= MAX_ACTIVE_ALERTS) throw new HttpError(409, "ALERT_LIMIT_REACHED");
    }
    changes.isActive = patch.isActive;
  }
  if (Object.keys(changes).length) await priceAlerts().update(alert.id, changes);
  return serializeAlert(await priceAlerts().findOneByOrFail({ id: alert.id }));
}

export async function deleteAlert(accountId: string, id: string) {
  const alert = await ownAlert(accountId, id);
  await priceAlerts().delete(alert.id);
}

// ---------------------------------------------------------------------------
// One-click unsubscribe from an alert's emails (RFC 8058)
// ---------------------------------------------------------------------------

/** Works without signing in: the signature is the permission, and only for that one alert. */
export async function unsubscribeByLink(alertId: string, signature: string): Promise<void> {
  if (!isValidUnsubscribeSignature(alertId, signature)) throw new HttpError(403, "FORBIDDEN");
  await priceAlerts().update(alertId, { notifyEmail: false });
}

// ---------------------------------------------------------------------------
// The worker job
// ---------------------------------------------------------------------------

interface EvaluationRow {
  id: string;
  accountId: string;
  originCode: string;
  destinationCode: string;
  cabin: string | null;
  targetPrice: string | null;
  baselinePrice: string | null;
  lastNotifiedPrice: string | null;
  notifyEmail: boolean;
  name: string;
  email: string | null;
  emailVerifiedAt: Date | null;
  price: string | null;
  departAt: Date | null;
}

const num = (v: string | null) => (v === null ? null : Number(v));

const BATCH = 500;

function describeDrop(row: EvaluationRow, price: number, departAt: Date, reason: "target" | "drop") {
  const route = `${cityName(row.originCode)} به ${cityName(row.destinationCode)}`;
  const day = formatTehranDay(departAt);
  const previous = num(row.lastNotifiedPrice) ?? num(row.baselinePrice);
  const target = num(row.targetPrice);
  const title = reason === "target" ? `${route}: به قیمت دلخواه شما رسید` : `${route}: ارزان‌تر شد`;
  const body =
    reason === "target" && target !== null
      ? `کمترین قیمت، پرواز ${day}، ${formatTomanFa(price)} است؛ کمتر از سقف ${formatTomanFa(target)} که تعیین کرده بودید.`
      : `کمترین قیمت، پرواز ${day}، به ${formatTomanFa(price)} رسید${previous !== null ? `؛ پیش‌تر ${formatTomanFa(previous)} بود` : ""}.`;
  const dateKey = tehranTodayKey(departAt.getTime());
  const params = new URLSearchParams({ from: row.originCode, to: row.destinationCode, date: dateKey });
  if (row.cabin) params.set("cabin", row.cabin);
  return { title, body, link: `/search?${params.toString()}`, dateKey, previous };
}

/**
 * Checks every active alert against the current fares, in id-ordered batches.
 * Returns the number of notifications sent. Alerts whose dates have passed are
 * switched off first.
 */
export async function evaluatePriceAlerts(): Promise<number> {
  await AppDataSource.query(`UPDATE price_alerts SET is_active = false WHERE is_active AND date_to < $1::date`, [
    tehranTodayKey(),
  ]);

  let sent = 0;
  let after = "00000000-0000-0000-0000-000000000000";
  for (;;) {
    const rows = (await AppDataSource.query(
      `SELECT a.id, a.account_id AS "accountId", a.origin_code AS "originCode",
              a.destination_code AS "destinationCode", a.cabin,
              a.target_price_toman AS "targetPrice", a.baseline_price_toman AS "baselinePrice",
              a.last_notified_price_toman AS "lastNotifiedPrice", a.notify_email AS "notifyEmail",
              acc.name, acc.email, acc.email_verified_at AS "emailVerifiedAt",
              low.price, low."departAt"
         FROM price_alerts a
         JOIN accounts acc ON acc.id = a.account_id
         ${LOWEST_FARE_JOIN}
        WHERE a.is_active AND a.id > $1
        ORDER BY a.id
        LIMIT ${BATCH}`,
      [after],
    )) as EvaluationRow[];
    if (!rows.length) break;
    after = rows[rows.length - 1].id;

    // Alerts that stay quiet are updated together at the end of the batch.
    const quiet: { id: string; price: number | null; baseline: number | null }[] = [];
    for (const row of rows) {
      const price = num(row.price);
      const decision = decideAlert(
        {
          targetPrice: num(row.targetPrice),
          baselinePrice: num(row.baselinePrice),
          lastNotifiedPrice: num(row.lastNotifiedPrice),
        },
        price,
      );
      if (decision.notify && price !== null && row.departAt) {
        const message = describeDrop(row, price, row.departAt, decision.reason);
        await notify(
          { id: row.accountId, name: row.name, email: row.email, emailVerifiedAt: row.emailVerifiedAt },
          {
            kind: "price_drop",
            title: message.title,
            body: message.body,
            link: message.link,
            data: { alertId: row.id, price, previousPrice: message.previous, date: message.dateKey },
          },
          { email: row.notifyEmail, unsubscribeAlertId: row.id },
        );
        await AppDataSource.query(
          `UPDATE price_alerts SET last_price_toman = $2, last_checked_at = now(),
                  last_notified_price_toman = $2, last_notified_at = now()
            WHERE id = $1`,
          [row.id, price],
        );
        sent++;
      } else {
        quiet.push({ id: row.id, price, baseline: decision.notify ? null : (decision.baseline ?? null) });
      }
    }
    if (quiet.length) {
      await AppDataSource.query(
        `UPDATE price_alerts a
            SET last_price_toman = v.price, last_checked_at = now(),
                baseline_price_toman = COALESCE(a.baseline_price_toman, v.baseline)
           FROM unnest($1::uuid[], $2::bigint[], $3::bigint[]) AS v(id, price, baseline)
          WHERE a.id = v.id`,
        [quiet.map((q) => q.id), quiet.map((q) => q.price), quiet.map((q) => q.baseline)],
      );
    }
    if (rows.length < BATCH) break;
  }
  return sent;
}
