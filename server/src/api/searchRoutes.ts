import { Router } from "express";
import { z } from "zod";
import { popularRoutes } from "../database/dataSource";
import { ALL_AIRPORTS } from "../domain/airports";
import { findFlight, searchFacets, searchFlights } from "../services/flightService";
import { cached } from "../services/redis";
import { notFound } from "../http/errors";
import { priceCalendar } from "../services/priceCalendar";
import { routePriceHistory } from "../services/priceHistory";
import { exploreFrom } from "../services/explore";
import {
  airportCode,
  calendarQuerySchema,
  exploreQuerySchema,
  flightQuerySchema,
  routeQuerySchema,
  searchQuerySchema,
} from "./schemas";

const router = Router();

const loadPopularRoutes = () =>
  cached("routes:popular", 300, () => popularRoutes().find({ order: { routeOrder: "ASC" }, take: 8 }));

router.get("/airports", (_req, res) => {
  res.json(ALL_AIRPORTS);
});

router.get("/routes", async (_req, res) => {
  res.json(await loadPopularRoutes());
});

router.get("/routes/popular", async (_req, res) => {
  const routes = await loadPopularRoutes();
  res.json(routes.map((r) => ({ originCode: r.originCode, destinationCode: r.destinationCode })));
});

router.get("/search", async (req, res) => {
  res.json(await searchFlights(searchQuerySchema.parse(req.query)));
});

/** Cheapest price per Iran calendar day, honouring the same filters as /search. */
router.get("/search/calendar", async (req, res) => {
  res.json(await priceCalendar(calendarQuerySchema.parse(req.query)));
});

router.get("/search/facets", async (req, res) => {
  const q = routeQuerySchema.parse(req.query);
  res.json(await searchFacets(q.originCode, q.destinationCode, q.date));
});

const routeKeySchema = z
  .string()
  .transform((k) => k.split("-"))
  .pipe(z.tuple([airportCode, airportCode]));

/** Destinations from an origin, cheapest first. */
router.get("/explore", async (req, res) => {
  const q = exploreQuerySchema.parse(req.query);
  res.json(await exploreFrom(q.originCode, q.days, q.scope));
});

const historyDays = z.coerce.number().int().min(7).max(180).default(60);

/** Daily lowest economy fare for a route, oldest first, plus a verdict on today's price. */
router.get("/routes/:routeKey/price-history", async (req, res) => {
  const [originCode, destinationCode] = routeKeySchema.parse(req.params.routeKey);
  res.json(await routePriceHistory(originCode, destinationCode, historyDays.parse(req.query.days)));
});

router.get("/flights/:routeKey/:flightId", async (req, res) => {
  const [originCode, destinationCode] = routeKeySchema.parse(req.params.routeKey);
  const { date } = flightQuerySchema.parse(req.query);
  const flight = await findFlight(originCode, destinationCode, req.params.flightId, date);
  if (!flight) throw notFound();
  res.json({ flight });
});

export default router;
