import { skip } from "../test/use-test-database";
import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  TestClient,
  closeDatabase,
  createAccount,
  createListing,
  hoursFromNow,
  resetDatabase,
  signIn,
  startServer,
  type TestServer,
} from "../test/harness";
import { AppDataSource, flightListings } from "../database/dataSource";
import { config } from "../config/env";
import { tehranTodayKey } from "../domain/time";
import { drainBackgroundTasks } from "../lib/background";
import { purgeOldClicks, type ClickStats } from "../services/clicks";

const BROWSER = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36";

async function clicks() {
  await drainBackgroundTasks();
  return (await AppDataSource.query(
    `SELECT listing_id AS "listingId", agency_id AS "agencyId", source, visitor_hash AS "visitorHash",
            price_toman::int AS price
       FROM listing_clicks ORDER BY id`,
  )) as { listingId: string | null; agencyId: string; source: string; visitorHash: string; price: number }[];
}

describe("outbound clicks", { skip }, () => {
  let server: TestServer;
  let agency: Awaited<ReturnType<typeof createAccount>>;

  before(async () => {
    await resetDatabase();
    server = await startServer();
    agency = await createAccount({ role: "agency", email: "clicks-agency@example.com" });
  });

  after(async () => {
    await server?.close();
    await closeDatabase();
  });

  beforeEach(async () => {
    await AppDataSource.query(`DELETE FROM listing_clicks`);
  });

  /** A distinct client address, i.e. a distinct visitor. */
  const visitor = (ip = "203.0.113.7") => new TestClient(server.url, ip);
  const go = (c: TestClient, listingId: string, src = "search", ua = BROWSER) =>
    c.get(`/api/go/${listingId}?src=${src}`, { "User-Agent": ua });

  test("hands the traveller to the agency and counts the click", async () => {
    const listing = await createListing(agency.id, { bookingUrl: "https://agency.example/book?ref=77&sig=abc" });
    const res = await go(visitor(), listing.id, "detail");
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), "https://agency.example/book?ref=77&sig=abc", "the link is untouched");
    assert.equal(res.headers.get("referrer-policy"), "origin");
    assert.equal(res.headers.get("cache-control"), "no-store");
    assert.equal(res.headers.get("x-robots-tag"), "noindex, nofollow");

    const rows = await clicks();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].listingId, listing.id);
    assert.equal(rows[0].agencyId, agency.id);
    assert.equal(rows[0].source, "detail");
    assert.equal(rows[0].price, listing.priceToman);
    assert.match(rows[0].visitorHash, /^[0-9a-f]{64}$/, "a keyed hash, not an address");
  });

  test("ignores bots and repeat clicks, keeps distinct visitors apart", async () => {
    const listing = await createListing(agency.id);
    await go(visitor(), listing.id, "search", "Mozilla/5.0 (compatible; Googlebot/2.1)");
    await go(visitor(), listing.id, "search", "TelegramBot (like TwitterBot)");
    assert.equal((await clicks()).length, 0, "link previews and crawlers are not clicks");

    const person = visitor();
    await go(person, listing.id);
    await go(person, listing.id);
    await go(visitor("203.0.113.99"), listing.id);
    await go(person, listing.id, "nonsense");
    const rows = await clicks();
    assert.equal(rows.length, 2, "one per visitor within half an hour");
    assert.notEqual(rows[0].visitorHash, rows[1].visitorHash);
  });

  test("a hidden, departed or unknown listing sends the traveller back to the results", async () => {
    const hidden = await createListing(agency.id, { isActive: false, originCode: "THR", destinationCode: "KIH" });
    const departed = await createListing(agency.id, { departAt: hoursFromNow(-2), flightNo: "W5-900" });
    const app = new URL(config.APP_URL);

    const toHidden = await go(visitor(), hidden.id);
    assert.equal(toHidden.status, 302);
    const location = new URL(toHidden.headers.get("location") ?? "");
    assert.equal(location.origin, app.origin);
    assert.equal(location.pathname, "/search");
    assert.equal(location.searchParams.get("from"), "THR");
    assert.equal(location.searchParams.get("to"), "KIH");

    assert.equal(new URL((await go(visitor(), departed.id)).headers.get("location") ?? "").pathname, "/search");
    for (const id of ["00000000-0000-4000-8000-000000000000", "not-a-uuid"]) {
      const res = await go(visitor(), id);
      assert.equal(res.status, 302);
      assert.equal(res.headers.get("location"), new URL("/", config.APP_URL).toString());
    }
    assert.equal((await clicks()).length, 0);
  });

  test("agencies see their own clicks: totals, days, listings, routes and sources", async () => {
    const other = await createAccount({ role: "agency", email: "other-agency@example.com" });
    const kish = await createListing(agency.id, { originCode: "THR", destinationCode: "KIH", flightNo: "EP-1" });
    const mashhad = await createListing(agency.id, { flightNo: "W5-2" });
    const rival = await createListing(other.id, { flightNo: "IR-3" });

    for (const ip of ["198.51.100.1", "198.51.100.2", "198.51.100.3"]) await go(visitor(ip), kish.id);
    await go(visitor("198.51.100.1"), mashhad.id, "roundtrip");
    await go(visitor(), rival.id);
    await drainBackgroundTasks();
    // Last month's clicks: only the "previous period" figure counts them.
    await AppDataSource.query(
      `INSERT INTO listing_clicks (listing_id, agency_id, origin_code, destination_code, airline, flight_no,
                                   depart_at, price_toman, source, visitor_hash, created_at)
       SELECT id, account_id, origin_code, destination_code, airline, flight_no, depart_at, price_toman,
              'search', repeat('a', 64), now() - interval '40 days'
         FROM flight_listings WHERE id = $1`,
      [kish.id],
    );

    const client = new TestClient(server.url);
    await signIn(client, agency.email);
    const { body: stats, status } = await client.get<ClickStats>("/api/dashboard/clicks?days=30");
    assert.equal(status, 200);
    assert.equal(stats.clicks, 4);
    assert.equal(stats.visitors, 3, "198.51.100.1 clicked twice, on two listings");
    assert.equal(stats.previousClicks, 1);
    assert.equal(stats.daily.length, 30);
    assert.equal(stats.daily.at(-1)?.date, tehranTodayKey());
    assert.equal(stats.daily.at(-1)?.clicks, 4);
    assert.equal(
      stats.daily.slice(0, -1).every((d) => d.clicks === 0),
      true,
    );
    assert.deepEqual(
      stats.topListings.map((l) => [l.flightNo, l.clicks]),
      [
        ["EP-1", 3],
        ["W5-2", 1],
      ],
    );
    assert.deepEqual(stats.routes[0], { originCode: "THR", destinationCode: "KIH", clicks: 3 });
    assert.deepEqual(stats.sources, { search: 3, detail: 0, roundtrip: 1, other: 0 });

    // Deleting a listing keeps its history.
    await flightListings().delete(kish.id);
    const after = (await client.get<ClickStats>("/api/dashboard/clicks?days=7")).body;
    assert.equal(after.topListings[0].flightNo, "EP-1");
    assert.equal(after.topListings[0].listingId, null);
  });

  test("keeps 13 months of history", async () => {
    const listing = await createListing(agency.id, { flightNo: "W5-77" });
    await go(visitor("198.51.100.50"), listing.id);
    await drainBackgroundTasks();
    await AppDataSource.query(
      `INSERT INTO listing_clicks (listing_id, agency_id, origin_code, destination_code, airline, flight_no,
                                   depart_at, price_toman, source, visitor_hash, created_at)
       SELECT listing_id, agency_id, origin_code, destination_code, airline, flight_no, depart_at, price_toman,
              source, visitor_hash, now() - interval '401 days'
         FROM listing_clicks`,
    );
    assert.equal(await purgeOldClicks(), 1);
    assert.equal((await clicks()).length, 1);
  });

  test("only agencies, and only the offered periods", async () => {
    const traveller = await createAccount();
    const client = new TestClient(server.url);
    await signIn(client, traveller.email);
    assert.equal((await client.get("/api/dashboard/clicks")).status, 403);

    const agencyClient = new TestClient(server.url);
    await signIn(agencyClient, agency.email);
    const bad = await agencyClient.get<{ details: string[] }>("/api/dashboard/clicks?days=15");
    assert.equal(bad.status, 400);
    assert.deepEqual(bad.body.details, ["days: INVALID_PERIOD"]);
  });
});
