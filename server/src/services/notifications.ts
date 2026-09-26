import { AppDataSource, notifications } from "../database/dataSource";
import type { Account, AppNotification } from "../database/entities";
import { isGuestAccount } from "../auth/auth";
import { runInBackground } from "../lib/background";
import { sendMail } from "../notify/mailer";
import { appLink, notificationMail } from "../notify/templates";
import { config } from "../config/env";
import { unsubscribeSignature } from "./alertLinks";

/** price_drop: an alert fired; moderation: an administrator acted on the account, a listing or a request. */
export type NotificationKind = "price_drop" | "moderation";

export interface NewNotification {
  kind: NotificationKind;
  title: string;
  body: string;
  /** An in-app path; the notification links there. */
  link: string | null;
  data?: Record<string, unknown>;
}

type Recipient = Pick<Account, "id" | "name" | "email" | "emailVerifiedAt">;

/** Only verified addresses get mail: an unverified one may belong to someone else. */
export const canEmail = (account: Recipient) =>
  account.email !== null && account.emailVerifiedAt !== null && !isGuestAccount(account);

/**
 * Links for leaving an alert's emails: a page for people (it asks before acting,
 * so mail scanners following links change nothing) and a one-click POST target
 * for mail clients (RFC 8058).
 */
function alertUnsubscribe(alertId: string) {
  const sig = unsubscribeSignature(alertId);
  return {
    page: appLink(`/alerts/unsubscribe?${new URLSearchParams({ alert: alertId, sig }).toString()}`),
    oneClick: new URL(`/api/alerts/${alertId}/unsubscribe?sig=${sig}`, config.APP_URL).toString(),
  };
}

/**
 * Delivers one notification: always to the in-app inbox, by email too when asked
 * for and the address is verified. Returns the stored notification.
 */
export async function notify(
  account: Recipient,
  message: NewNotification,
  { email = false, unsubscribeAlertId }: { email?: boolean; unsubscribeAlertId?: string } = {},
): Promise<AppNotification> {
  const repo = notifications();
  const saved = await repo.save(
    repo.create({
      accountId: account.id,
      kind: message.kind,
      title: message.title,
      body: message.body,
      link: message.link,
      data: message.data ?? {},
    }),
  );
  if (email && canEmail(account)) {
    const to = account.email as string;
    const unsubscribe = unsubscribeAlertId ? alertUnsubscribe(unsubscribeAlertId) : undefined;
    runInBackground("notification email", () =>
      sendMail({
        to,
        ...notificationMail(account.name, message, unsubscribe?.page),
        headers: unsubscribe
          ? { "List-Unsubscribe": `<${unsubscribe.oneClick}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
          : undefined,
      }),
    );
  }
  return saved;
}

export function serializeNotification(n: AppNotification) {
  return {
    id: n.id,
    kind: n.kind,
    title: n.title,
    body: n.body,
    link: n.link,
    data: n.data,
    read: n.readAt !== null,
    createdAt: n.createdAt.getTime(),
  };
}

/** Served by the partial index on unread rows, so the header can poll it cheaply. */
export async function unreadCount(accountId: string): Promise<number> {
  const [{ count }] = (await AppDataSource.query(
    `SELECT count(*)::int AS count FROM notifications WHERE account_id = $1 AND read_at IS NULL`,
    [accountId],
  )) as { count: number }[];
  return count;
}

/** Newest first; `before` (epoch ms) pages further back. */
export async function listNotifications(accountId: string, limit: number, before?: number) {
  const qb = notifications()
    .createQueryBuilder("n")
    .where("n.accountId = :accountId", { accountId })
    .orderBy("n.createdAt", "DESC")
    .addOrderBy("n.id", "DESC")
    .take(limit);
  if (before !== undefined) qb.andWhere("n.createdAt < :before", { before: new Date(before) });
  const [items, unread] = await Promise.all([qb.getMany(), unreadCount(accountId)]);
  return { items: items.map(serializeNotification), unreadCount: unread };
}

/** Marks the given notifications (or all of them) read; returns what is still unread. */
export async function markRead(accountId: string, ids?: string[]): Promise<number> {
  const params: unknown[] = [accountId];
  const only = ids ? `AND id = ANY($${params.push(ids)})` : "";
  await AppDataSource.query(
    `UPDATE notifications SET read_at = now() WHERE account_id = $1 AND read_at IS NULL ${only}`,
    params,
  );
  return unreadCount(accountId);
}
