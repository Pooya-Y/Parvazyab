import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { tehranWallClock } from "../domain/time";
import type { FlightCard } from "../services/flightsCore";
import { buildGuide, type RouteGuide } from "../services/routeGuides";
import { PAGE_CSP, siteUrl } from "./layout";
import { joinFa, notFoundPage, routeGuidePage, routeIndexPage } from "./pages";

const NOW = Date.UTC(2026, 8, 27, 6, 0);
const at = (dayOffset: number, hour: number) => tehranWallClock(dayOffset, hour, 0, NOW).getTime();

function card(depart: number, price: number, agencyName = "آسمان بازار"): FlightCard {
  return {
    id: `ماهان ایر__W5-101__${depart / 60_000}`,
    airline: "ماهان ایر",
    flightNo: "W5-101",
    originCode: "THR",
    originCity: "تهران (مهرآباد)",
    destinationCode: "MHD",
    destinationCity: "مشهد",
    departAt: depart,
    arriveAt: depart + 90 * 60_000,
    durationMin: 90,
    stops: 0,
    cabin: "economy",
    bestPriceToman: price,
    priceRange: { min: price, max: price },
    agencyCount: 1,
    offers: [
      {
        listingId: "l1",
        agencyId: "a1",
        agencyName,
        cabin: "economy",
        fareType: "scheduled",
        priceToman: price,
        bookingUrl: "https://agency.example/book",
        agencySlug: "sky",
        agencyVerified: true,
        agencyRating: { average: 4.6, count: 8 },
      },
    ],
  };
}

const guideOf = (cards: FlightCard[]): RouteGuide =>
  buildGuide({ originCode: "THR", destinationCode: "MHD", cards, directory: [], trend: null, now: NOW });

const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("base64");

/** Every JSON-LD block of a page, parsed. */
const structuredData = (page: string) =>
  [...page.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(
    (m) => JSON.parse(m[1]) as Record<string, unknown>,
  );

describe("route pages", () => {
  test("a route guide states the price, date and route in its title, heading and data", () => {
    const page = routeGuidePage(guideOf([card(at(1, 8), 1_900_000), card(at(2, 8), 1_770_000)]));
    assert.match(page, /<title>بلیط هواپیما تهران \(مهرآباد\) به مشهد؛ از ۱٬۷۷۰٬۰۰۰ تومان \| پروازیاب<\/title>/);
    assert.match(page, /<h1>بلیط هواپیما تهران \(مهرآباد\) به مشهد<\/h1>/);
    assert.ok(page.includes(`<link rel="canonical" href="${siteUrl("/flights/thr-mhd")}"`));
    assert.ok(!page.includes("noindex"));
    // The cheapest day links to that day's search.
    assert.match(page, /class="day best"\s+href="\/search\?from=THR&amp;to=MHD&amp;date=2026-09-29"/);
    const types = structuredData(page).map((d) => d["@type"]);
    assert.deepEqual(types, ["BreadcrumbList", "FAQPage"]);
  });

  test("agency names are text, never markup", () => {
    const page = routeGuidePage(guideOf([card(at(1, 8), 1_900_000, `<script>alert("x")</script>`)]));
    assert.ok(!page.includes(`<script>alert`));
    assert.ok(page.includes("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;"));
  });

  test("the calendar ends with the last week anything flies, and says so", () => {
    const page = routeGuidePage(guideOf([card(at(1, 8), 1_900_000)]));
    assert.match(page, /آژانس‌ها برای بعد از .+ هنوز پروازی ثبت نکرده‌اند/);
    const calendar = /<table class="calendar">[\s\S]*?<\/table>/.exec(page)![0];
    assert.equal(calendar.match(/<tr>/g)?.length, 2, "weekday header + one week");
  });

  test("routes with nothing to show, and unknown pages, stay out of the index", () => {
    const empty = routeGuidePage(guideOf([]));
    assert.match(empty, /<meta name="robots" content="noindex, follow"/);
    assert.ok(!empty.includes(`rel="canonical"`));
    assert.match(notFoundPage("/flights/xyz"), /noindex/);
    assert.match(routeIndexPage([]), /noindex/);
  });

  test("the directory groups routes by where they leave from", () => {
    const page = routeIndexPage([
      { originCode: "THR", destinationCode: "MHD", minPrice: 1_770_000, flights: 40 },
      { originCode: "THR", destinationCode: "KIH", minPrice: 2_390_000, flights: 12 },
      { originCode: "MHD", destinationCode: "THR", minPrice: 2_130_000, flights: 30 },
    ]);
    const headings = [...page.matchAll(/<h2 id="from-(\w+)">/g)].map((m) => m[1]);
    assert.deepEqual(headings, ["thr", "mhd"]);
    assert.ok(page.includes(`href="/flights/thr-kih"`));
  });

  test("the policy allows exactly the inline style and theme script the pages carry", () => {
    const page = routeGuidePage(guideOf([card(at(1, 8), 1_900_000)]));
    const style = /<style>([\s\S]*?)<\/style>/.exec(page)![1];
    const script = /<script>([\s\S]*?)<\/script>/.exec(page)![1];
    assert.ok(PAGE_CSP.includes(`style-src 'sha256-${sha256(style)}'`));
    assert.ok(PAGE_CSP.includes(`script-src 'sha256-${sha256(script)}'`));
    assert.ok(!/style="/.test(page), "inline style attributes would be blocked");
  });

  test("lists read naturally in Persian", () => {
    assert.equal(joinFa(["الف"]), "الف");
    assert.equal(joinFa(["الف", "ب"]), "الف و ب");
    assert.equal(joinFa(["الف", "ب", "پ"]), "الف، ب و پ");
  });
});
