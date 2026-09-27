import { Router, type ErrorRequestHandler, type Response } from "express";
import rateLimit from "express-rate-limit";
import { findAirport } from "../domain/airports";
import { html } from "../lib/html";
import { listAgencies } from "../services/agencies";
import { routeDirectory, routeGuide } from "../services/routeGuides";
import { PAGE_CSP, renderPage } from "./layout";
import { guidePath, notFoundPage, routeGuidePage, routeIndexPage } from "./pages";
import { robotsTxt, sitemapXml } from "./sitemap";

/**
 * Server-rendered pages for search engines: /flights, /flights/:route,
 * /sitemap.xml and /robots.txt. nginx sends exactly these paths here; every
 * other page is the app.
 */
const router = Router();

// Generous enough for a crawler working through every route, not for scraping at full speed.
router.use(
  ["/flights", "/sitemap.xml"],
  rateLimit({ windowMs: 60 * 1000, limit: 240, standardHeaders: "draft-7", legacyHeaders: false }),
);

function sendPage(res: Response, status: number, page: string) {
  res
    .status(status)
    .set({
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": PAGE_CSP,
      "Content-Language": "fa",
      // Prices move; five minutes old is fine for a page whose links lead to live search.
      "Cache-Control": "public, max-age=300",
    })
    .send(page);
}

router.get("/flights", async (_req, res) => {
  sendPage(res, 200, routeIndexPage(await routeDirectory()));
});

const ROUTE_SLUG = /^([a-z]{3})-([a-z]{3})$/i;

router.get("/flights/:route", async (req, res) => {
  const match = ROUTE_SLUG.exec(req.params.route);
  const origin = match?.[1].toUpperCase() ?? "";
  const destination = match?.[2].toUpperCase() ?? "";
  if (!findAirport(origin) || !findAirport(destination) || origin === destination) {
    sendPage(res, 404, notFoundPage(req.path));
    return;
  }
  // One URL per route: /flights/THR-MHD and /flights/thr-mhd/ both move to /flights/thr-mhd.
  const canonical = guidePath(origin, destination);
  if (req.path !== canonical) {
    res.redirect(301, canonical);
    return;
  }
  sendPage(res, 200, routeGuidePage(await routeGuide(origin, destination)));
});

router.get("/sitemap.xml", async (_req, res) => {
  const [routes, agencies] = await Promise.all([routeDirectory(), listAgencies()]);
  res
    .type("application/xml")
    .set("Cache-Control", "public, max-age=3600")
    .send(
      sitemapXml(
        routes,
        agencies.map((a) => a.slug),
      ),
    );
});

router.get("/robots.txt", (_req, res) => {
  res.type("text/plain").set("Cache-Control", "public, max-age=86400").send(robotsTxt());
});

/** A failure here is almost always the database; 503 tells crawlers to come back rather than drop the page. */
const pageErrors: ErrorRequestHandler = (err, req, res, _next) => {
  console.error(err);
  res.set("Retry-After", "300");
  sendPage(
    res,
    503,
    renderPage({
      title: "موقتاً در دسترس نیست | پروازیاب",
      description: "پروازیاب موقتاً در دسترس نیست.",
      path: req.path,
      noindex: true,
      body: html`<div class="empty">
        <h1>این صفحه موقتاً در دسترس نیست</h1>
        <p>چند دقیقهٔ دیگر دوباره امتحان کنید.</p>
        <div class="actions"><a class="button" href="/">جستجوی پرواز</a></div>
      </div>`,
    }),
  );
};
router.use(pageErrors);

export default router;
