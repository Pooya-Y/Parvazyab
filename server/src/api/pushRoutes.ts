import { Router } from "express";
import { z } from "zod";
import { requireUser, sessionUser } from "../auth/auth";
import { vapidPublicKey } from "../notify/push";
import { deleteSubscription, saveSubscription } from "../services/push";

/** `/api/push`: browsers subscribing to push notifications. */
const router = Router();

const base64url = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .regex(/^[A-Za-z0-9_-]+=*$/);
const subscriptionSchema = z.object({
  endpoint: z.string().url().max(2048),
  keys: z.object({ p256dh: base64url(200), auth: base64url(100) }),
});
const endpointSchema = z.object({ endpoint: z.string().max(2048) });

/** The key browsers subscribe with; null means push is switched off on this server. */
router.get("/public-key", (_req, res) => {
  res.json({ publicKey: vapidPublicKey() });
});

router.post("/subscriptions", requireUser, async (req, res) => {
  await saveSubscription(sessionUser(res).id, subscriptionSchema.parse(req.body), req.get("user-agent"));
  res.status(201).json({ ok: true });
});

router.delete("/subscriptions", requireUser, async (req, res) => {
  await deleteSubscription(sessionUser(res).id, endpointSchema.parse(req.body ?? {}).endpoint);
  res.status(204).end();
});

export default router;
