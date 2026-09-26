import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { flightListings } from "../database/dataSource";
import type { FlightListing } from "../database/entities";
import { sessionUser } from "../auth/auth";
import { notFound } from "../http/errors";
import { requireApiKey } from "../services/apiKeys";
import { jsonToRows, planImport } from "../services/listingImport";
import { runImport } from "./importResponse";
import { invalidate } from "../services/redis";
import { SEARCH_CACHE_PREFIX } from "../services/flightService";
import { openApiDocument } from "./openapi";
import { httpUrl, uuidParam } from "./schemas";

/** `/api/v1`: the agency API, authenticated by API key (see openapi.ts). */
const router = Router();

router.get("/openapi.json", (_req, res) => {
  res.json(openApiDocument);
});

/** Per key, not per address: one agency's integration shouldn't be starved by another behind the same NAT. */
const perKeyLimiter = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (_req, res) => `key:${String(res.locals.apiKeyPrefix)}`,
  message: { error: "RATE_LIMITED" },
});

router.use(requireApiKey, perKeyLimiter);

/** Timestamps as ISO 8601 here: friendlier than epoch ms for integrations. */
export function v1Listing(l: FlightListing) {
  return {
    id: l.id,
    originCode: l.originCode,
    destinationCode: l.destinationCode,
    airline: l.airline,
    flightNo: l.flightNo,
    departAt: l.departAt.toISOString(),
    arriveAt: l.arriveAt.toISOString(),
    durationMin: l.durationMin,
    stops: l.stops,
    cabin: l.cabin,
    fareType: l.fareType,
    priceToman: l.priceToman,
    bookingUrl: l.bookingUrl,
    isActive: l.isActive,
  };
}

const flag = z
  .enum(["true", "false", "1", "0"])
  .optional()
  .transform((v) => v === "true" || v === "1");
const bulkQuery = z.object({ dryRun: flag, skipInvalid: flag });
const bulkBody = z.object({ listings: z.array(z.unknown()).min(1) });
const patchBody = z
  .object({
    priceToman: z.number().int().positive().max(10_000_000_000).optional(),
    bookingUrl: httpUrl.optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: "EMPTY_UPDATE" });

router.get("/listings", async (_req, res) => {
  const rows = await flightListings().find({ where: { accountId: sessionUser(res).id }, order: { departAt: "ASC" } });
  res.json({ data: rows.map(v1Listing) });
});

router.put("/listings", async (req, res) => {
  const options = bulkQuery.parse(req.query);
  const { listings } = bulkBody.parse(req.body);
  const accountId = sessionUser(res).id;
  const plan = await planImport(accountId, jsonToRows(listings));
  await runImport(res, accountId, plan, options);
});

router.patch("/listings/:id", async (req, res) => {
  const id = uuidParam.parse(req.params.id);
  const patch = patchBody.parse(req.body);
  const repo = flightListings();
  const result = await repo.update({ id, accountId: sessionUser(res).id }, patch);
  if (!result.affected) throw notFound();
  await invalidate(SEARCH_CACHE_PREFIX);
  res.json(v1Listing(await repo.findOneByOrFail({ id })));
});

router.delete("/listings/:id", async (req, res) => {
  const result = await flightListings().delete({ id: uuidParam.parse(req.params.id), accountId: sessionUser(res).id });
  if (!result.affected) throw notFound();
  await invalidate(SEARCH_CACHE_PREFIX);
  res.status(204).end();
});

export default router;
