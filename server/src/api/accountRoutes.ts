import express, { Router } from "express";
import { z } from "zod";
import { accounts } from "../database/dataSource";
import { requireRole, requireUser, sanitizeUser, sessionUser } from "../auth/auth";
import { audit } from "../services/audit";
import { clickStats } from "../services/clicks";
import {
  auditEntries,
  dismissReports,
  findListingsForAdmin,
  forbidSuspended,
  moderationQueue,
  requestVerification,
  setAccountSuspension,
  setAgencyVerification,
  setListingSuspension,
  setReviewStatus,
} from "../services/moderation";
import { ownProfile, replyToReview, reviewsForAgency, updateAgencyProfile } from "../services/agencies";
import { createApiKey, listApiKeys, revokeApiKey } from "../services/apiKeys";
import { csvToRows, listingsCsv, planImport, templateCsv } from "../services/listingImport";
import { tehranTodayKey } from "../domain/time";
import { HttpError } from "../http/errors";
import { runImport } from "./importResponse";
import {
  adminStats,
  agencyStats,
  becomeAgency,
  deleteListing,
  listListings,
  listSavedFlights,
  saveFlight,
  serializeSavedFlight,
  setAccountRole,
  setListingActive,
  unsaveFlight,
  upsertListing,
} from "../services/accountService";
import {
  adminListingsQuerySchema,
  agencyProfileSchema,
  auditQuerySchema,
  becomeAgencySchema,
  clickStatsQuerySchema,
  listingSchema,
  listingStatusSchema,
  replySchema,
  reviewStatusSchema,
  savedFlightSnapshotSchema,
  setRoleSchema,
  suspensionSchema,
  uuidParam,
  verificationDecisionSchema,
} from "./schemas";

const flightKeyParam = z.string().min(1).max(255);

// ---------------------------------------------------------------------------
// Saved flights (any signed-in user)
// ---------------------------------------------------------------------------

export const savedFlightRoutes = Router();
savedFlightRoutes.use(requireUser);

savedFlightRoutes.get("/", async (_req, res) => {
  res.json(await listSavedFlights(sessionUser(res).id));
});

savedFlightRoutes.post("/", async (req, res) => {
  const { snapshot } = savedFlightSnapshotSchema.parse(req.body);
  const { row, created } = await saveFlight(sessionUser(res).id, snapshot);
  res.status(created ? 201 : 200).json(serializeSavedFlight(row));
});

savedFlightRoutes.delete("/:flightKey", async (req, res) => {
  await unsaveFlight(sessionUser(res).id, flightKeyParam.parse(req.params.flightKey));
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// Dashboard (signed-in users; listing management for agencies)
// ---------------------------------------------------------------------------

export const dashboardRoutes = Router();
dashboardRoutes.use(requireUser);
const agencyOnly = requireRole("agency");

dashboardRoutes.get("/saved-flights", async (_req, res) => {
  res.json(await listSavedFlights(sessionUser(res).id));
});

dashboardRoutes.get("/stats", agencyOnly, async (_req, res) => {
  res.json(await agencyStats(sessionUser(res).id));
});

/** Outbound "buy" clicks on the agency's listings over the last 7, 30 or 90 days. */
dashboardRoutes.get("/clicks", agencyOnly, async (req, res) => {
  const { days } = clickStatsQuerySchema.parse(req.query);
  res.json(await clickStats(sessionUser(res).id, days));
});

/** A CSV download: UTF-8 with BOM (Excel), never cached. */
function sendCsv(res: express.Response, filename: string, csv: string) {
  res.set({
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "no-store",
  });
  res.send(csv);
}

dashboardRoutes.get("/listings/export.csv", agencyOnly, async (_req, res) => {
  sendCsv(res, `parvazyab-listings-${tehranTodayKey()}.csv`, await listingsCsv(sessionUser(res).id));
});

dashboardRoutes.get("/listings/template.csv", agencyOnly, (_req, res) => {
  sendCsv(res, "parvazyab-listings-template.csv", templateCsv());
});

const importQuery = z.object({
  commit: z.enum(["true", "false"]).default("false"),
  skipInvalid: z.enum(["true", "false"]).default("false"),
});

/**
 * CSV import: `commit=false` (the default) only reports what each row would do;
 * `commit=true` writes, all or nothing unless `skipInvalid=true`.
 */
dashboardRoutes.post(
  "/listings/import",
  agencyOnly,
  forbidSuspended,
  express.text({ type: ["text/csv", "text/plain", "application/csv"], limit: "2mb" }),
  async (req, res) => {
    if (typeof req.body !== "string") throw new HttpError(415, "UNSUPPORTED_MEDIA_TYPE");
    const { commit, skipInvalid } = importQuery.parse(req.query);
    const user = sessionUser(res);
    const plan = await planImport(user.id, csvToRows(req.body), { columnNames: true });
    const written = await runImport(res, user.id, plan, {
      dryRun: commit !== "true",
      skipInvalid: skipInvalid === "true",
    });
    if (written) {
      await audit(req, {
        actorId: user.id,
        action: "listing.imported",
        targetType: "account",
        targetId: user.id,
        details: { created: plan.counts.create, updated: plan.counts.update, skipped: plan.counts.error },
      });
    }
  },
);

dashboardRoutes.get("/profile", agencyOnly, async (_req, res) => {
  res.json(await ownProfile(sessionUser(res).id));
});

dashboardRoutes.put("/profile", agencyOnly, forbidSuspended, async (req, res) => {
  res.json(await updateAgencyProfile(sessionUser(res).id, agencyProfileSchema.parse(req.body)));
});

/** Every review of the agency, hidden ones flagged. */
dashboardRoutes.get("/reviews", agencyOnly, async (_req, res) => {
  res.json(await reviewsForAgency(sessionUser(res).id));
});

/** The agency's public answer to one of its reviews; an empty reply removes it. */
dashboardRoutes.put("/reviews/:id/reply", agencyOnly, forbidSuspended, async (req, res) => {
  const { reply } = replySchema.parse(req.body);
  await replyToReview(sessionUser(res).id, uuidParam.parse(req.params.id), reply);
  res.json({ ok: true });
});

/** Asks the administrators for the verified badge. */
dashboardRoutes.post("/profile/verification", agencyOnly, forbidSuspended, async (req, res) => {
  await requestVerification(sessionUser(res).id, req);
  res.status(202).json({ ok: true });
});

dashboardRoutes.get("/api-keys", agencyOnly, async (_req, res) => {
  res.json(await listApiKeys(sessionUser(res).id));
});

dashboardRoutes.post("/api-keys", agencyOnly, forbidSuspended, async (req, res) => {
  const { name } = z.object({ name: z.string().trim().min(1).max(60) }).parse(req.body);
  const user = sessionUser(res);
  const key = await createApiKey(user.id, name);
  await audit(req, {
    actorId: user.id,
    action: "api_key.created",
    targetType: "api_key",
    targetId: key.id,
    details: { name, prefix: key.prefix },
  });
  // The only time the key itself is ever sent.
  res.set("Cache-Control", "no-store");
  res.status(201).json(key);
});

dashboardRoutes.delete("/api-keys/:id", agencyOnly, async (req, res) => {
  const user = sessionUser(res);
  const id = uuidParam.parse(req.params.id);
  await revokeApiKey(user.id, id);
  await audit(req, { actorId: user.id, action: "api_key.revoked", targetType: "api_key", targetId: id });
  res.status(204).end();
});

dashboardRoutes.get("/listings", agencyOnly, async (_req, res) => {
  res.json(await listListings(sessionUser(res).id));
});

dashboardRoutes.post("/listings", agencyOnly, forbidSuspended, async (req, res) => {
  const { id, created } = await upsertListing(sessionUser(res).id, listingSchema.parse(req.body));
  res.status(created ? 201 : 200).json({ id });
});

dashboardRoutes.patch("/listings/:id/status", agencyOnly, forbidSuspended, async (req, res) => {
  const { isActive } = listingStatusSchema.parse(req.body);
  await setListingActive(sessionUser(res).id, uuidParam.parse(req.params.id), isActive);
  res.json({ ok: true });
});

dashboardRoutes.delete("/listings/:id", agencyOnly, async (req, res) => {
  await deleteListing(sessionUser(res).id, uuidParam.parse(req.params.id));
  res.status(204).end();
});

dashboardRoutes.post("/become-agency", async (req, res) => {
  const { agencyName } = becomeAgencySchema.parse(req.body);
  const user = sessionUser(res);
  if (await becomeAgency(user, agencyName)) {
    await audit(req, {
      actorId: user.id,
      action: "account.became_agency",
      targetType: "account",
      targetId: user.id,
      details: { agencyName },
    });
  }
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export const adminRoutes = Router();
adminRoutes.use(requireUser, requireRole("admin"));

adminRoutes.get("/stats", async (_req, res) => {
  res.json(await adminStats());
});

adminRoutes.get("/users", async (_req, res) => {
  const users = await accounts().find({ order: { createdAt: "DESC" } });
  res.json(users.map((u) => sanitizeUser(u)));
});

adminRoutes.patch("/users/:id/role", async (req, res) => {
  const { accountRole } = setRoleSchema.parse(req.body);
  const actor = sessionUser(res);
  const targetId = uuidParam.parse(req.params.id);
  const previous = await setAccountRole(actor, targetId, accountRole);
  if (previous !== accountRole) {
    await audit(req, {
      actorId: actor.id,
      action: "admin.role_changed",
      targetType: "account",
      targetId,
      details: { from: previous, to: accountRole },
    });
  }
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Moderation
// ---------------------------------------------------------------------------

/** Verification requests and reported reviews, plus counts of what is currently hidden. */
adminRoutes.get("/moderation", async (_req, res) => {
  res.json(await moderationQueue());
});

adminRoutes.put("/users/:id/suspension", async (req, res) => {
  await setAccountSuspension(sessionUser(res), uuidParam.parse(req.params.id), suspensionSchema.parse(req.body), req);
  res.json({ ok: true });
});

adminRoutes.get("/listings", async (req, res) => {
  res.json(await findListingsForAdmin(adminListingsQuerySchema.parse(req.query)));
});

adminRoutes.put("/listings/:id/suspension", async (req, res) => {
  await setListingSuspension(sessionUser(res), uuidParam.parse(req.params.id), suspensionSchema.parse(req.body), req);
  res.json({ ok: true });
});

adminRoutes.put("/agencies/:id/verification", async (req, res) => {
  const decision = verificationDecisionSchema.parse(req.body);
  await setAgencyVerification(sessionUser(res), uuidParam.parse(req.params.id), decision, req);
  res.json({ ok: true });
});

adminRoutes.put("/reviews/:id/status", async (req, res) => {
  const { status } = reviewStatusSchema.parse(req.body);
  await setReviewStatus(sessionUser(res), uuidParam.parse(req.params.id), status, req);
  res.json({ ok: true });
});

/** The reports were unfounded: close them without hiding the review. */
adminRoutes.post("/reviews/:id/dismiss-reports", async (req, res) => {
  await dismissReports(sessionUser(res), uuidParam.parse(req.params.id), req);
  res.json({ ok: true });
});

adminRoutes.get("/audit", async (req, res) => {
  res.json(await auditEntries(auditQuerySchema.parse(req.query)));
});
