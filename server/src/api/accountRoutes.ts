import { Router } from "express";
import { z } from "zod";
import { accounts } from "../database/dataSource";
import { requireRole, requireUser, sanitizeUser, sessionUser } from "../auth/auth";
import { audit } from "../services/audit";
import { clickStats } from "../services/clicks";
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
  becomeAgencySchema,
  clickStatsQuerySchema,
  listingSchema,
  listingStatusSchema,
  savedFlightSnapshotSchema,
  setRoleSchema,
  uuidParam,
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

dashboardRoutes.get("/listings", agencyOnly, async (_req, res) => {
  res.json(await listListings(sessionUser(res).id));
});

dashboardRoutes.post("/listings", agencyOnly, async (req, res) => {
  const { id, created } = await upsertListing(sessionUser(res).id, listingSchema.parse(req.body));
  res.status(created ? 201 : 200).json({ id });
});

dashboardRoutes.patch("/listings/:id/status", agencyOnly, async (req, res) => {
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
