import { Router } from "express";
import { requireUser, sessionUser } from "../auth/auth";
import { reportListing } from "../services/listingReports";
import { forbidSuspended } from "../services/moderation";
import { reportLimiter } from "./limiters";
import { listingReportSchema, uuidParam } from "./schemas";

/** Travellers' reports on offers (`/api/listings`). */
const router = Router();

/** Report an offer: 201 for a new report, 200 when it updates the reporter's open one. */
router.post("/:id/reports", requireUser, forbidSuspended, reportLimiter, async (req, res) => {
  const outcome = await reportListing(
    sessionUser(res),
    uuidParam.parse(req.params.id),
    listingReportSchema.parse(req.body ?? {}),
  );
  res.status(outcome === "created" ? 201 : 200).json({ ok: true });
});

export default router;
