import { Router } from "express";
import { requireUser, sessionUser } from "../auth/auth";
import { config } from "../config/env";
import { createAlert, deleteAlert, listAlerts, unsubscribeByLink, updateAlert } from "../services/priceAlerts";
import { listNotifications, markRead, unreadCount } from "../services/notifications";
import { forbidSuspended } from "../services/moderation";
import {
  alertPatchSchema,
  alertSchema,
  markReadSchema,
  notificationsQuerySchema,
  unsubscribeQuerySchema,
  uuidParam,
} from "./schemas";

/** `/api/alerts`: the signed-in user's price alerts. */
export const alertRoutes = Router();

/**
 * One-click unsubscribe (RFC 8058): mail clients POST the List-Unsubscribe URL.
 * No session: the signature is the permission, for this one alert's emails only.
 */
alertRoutes.post("/:id/unsubscribe", async (req, res) => {
  const { sig } = unsubscribeQuerySchema.parse(req.query);
  await unsubscribeByLink(uuidParam.parse(req.params.id), sig);
  res.json({ ok: true });
});

/** Someone opening that URL in a browser gets the page that asks first. */
alertRoutes.get("/:id/unsubscribe", (req, res) => {
  const { sig } = unsubscribeQuerySchema.parse(req.query);
  const params = new URLSearchParams({ alert: uuidParam.parse(req.params.id), sig });
  res.redirect(303, new URL(`/alerts/unsubscribe?${params.toString()}`, config.APP_URL).toString());
});

alertRoutes.use(requireUser);

alertRoutes.get("/", async (_req, res) => {
  res.json(await listAlerts(sessionUser(res).id));
});

alertRoutes.post("/", forbidSuspended, async (req, res) => {
  res.status(201).json(await createAlert(sessionUser(res), alertSchema.parse(req.body)));
});

alertRoutes.patch("/:id", async (req, res) => {
  res.json(await updateAlert(sessionUser(res).id, uuidParam.parse(req.params.id), alertPatchSchema.parse(req.body)));
});

alertRoutes.delete("/:id", async (req, res) => {
  await deleteAlert(sessionUser(res).id, uuidParam.parse(req.params.id));
  res.status(204).end();
});

/** `/api/notifications`: the in-app inbox. */
export const notificationRoutes = Router();
notificationRoutes.use(requireUser);

notificationRoutes.get("/", async (req, res) => {
  const { limit, before } = notificationsQuerySchema.parse(req.query);
  res.json(await listNotifications(sessionUser(res).id, limit, before));
});

/** Polled by the header bell; cheap by design. */
notificationRoutes.get("/unread-count", async (_req, res) => {
  res.json({ count: await unreadCount(sessionUser(res).id) });
});

/** Marks the given notifications, or all of them, read. */
notificationRoutes.post("/read", async (req, res) => {
  const { ids } = markReadSchema.parse(req.body ?? {});
  res.json({ unreadCount: await markRead(sessionUser(res).id, ids) });
});
