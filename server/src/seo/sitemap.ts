import { tehranTodayKey } from "../domain/time";
import { escapeHtml } from "../lib/html";
import type { RouteSummary } from "../services/routeGuides";
import { siteUrl } from "./layout";
import { guidePath } from "./pages";

/**
 * Everything worth indexing: the app's public pages, a guide per route with
 * flights, and the agencies' profiles. Route guides change every day (the
 * window moves and prices with it), so their lastmod is today.
 */
export function sitemapXml(routes: RouteSummary[], agencySlugs: string[], now = Date.now()): string {
  const today = tehranTodayKey(now);
  const entries: { path: string; lastmod?: string }[] = [
    { path: "/" },
    { path: "/explore" },
    { path: "/agencies" },
    { path: "/flights", lastmod: today },
    ...routes.map((r) => ({ path: guidePath(r.originCode, r.destinationCode), lastmod: today })),
    ...agencySlugs.map((slug) => ({ path: `/agencies/${slug}` })),
  ];
  const urls = entries.map(
    (e) =>
      `  <url><loc>${escapeHtml(siteUrl(e.path))}</loc>${e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ""}</url>`,
  );
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}

/**
 * Crawlers get the public pages. Private screens, the API (including the
 * counting "buy" redirect) and search results are off limits: results are
 * endless URL combinations whose indexable form is the route guide.
 */
export function robotsTxt(): string {
  return [
    "User-agent: *",
    "Disallow: /api/",
    "Disallow: /dashboard",
    "Disallow: /auth",
    "Disallow: /alerts/",
    "Disallow: /search",
    "Disallow: /flight/",
    "",
    `Sitemap: ${siteUrl("/sitemap.xml")}`,
    "",
  ].join("\n");
}
