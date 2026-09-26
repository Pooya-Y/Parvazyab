import { Router } from "express";
import { z } from "zod";
import { popularRoutes } from "../database/dataSource";
import { ALL_AIRPORTS } from "../domain/airports";
import { findFlight, searchFacets, searchFlights } from "../services/flightService";
import { cached } from "../services/redis";
import { notFound } from "../http/errors";
import { priceCalendar } from "../services/priceCalendar";
import { airportCode, calendarQuerySchema, routeQuerySchema, searchQuerySchema } from "./schemas";

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

router.get("/flights/:routeKey/:flightId", async (req, res) => {
  const [originCode, destinationCode] = routeKeySchema.parse(req.params.routeKey);
  const flight = await findFlight(originCode, destinationCode, req.params.flightId);
  if (!flight) throw notFound();
  res.json({ flight });
});

export default router;
