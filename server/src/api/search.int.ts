import { skip } from "../test/use-test-database";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  TestClient,
  closeDatabase,
  createAccount,
  createListing,
  hoursFromNow,
  resetDatabase,
  startServer,
  type TestServer,
} from "../test/harness";
import { TEHRAN_OFFSET_MS } from "../domain/time";

interface Card {
  id: string;
  flightNo: string;
  agencyCount: number;
  bestPriceToman: number;
  offers: { agencyName: string; priceToman: number }[];
  departAt: number;
  arriveAt: number;
}

interface Page<T = Card> {
  flights: T[];
  total: number;
  offset: number;
  limit: number;
  minPrice: number | null;
}

/** Epoch ms of a Tehran wall-clock time `days` days from today (Tehran). */
function tehranTime(days: number, hour: number, minute = 0) {
  const shifted = new Date(Date.now() + TEHRAN_OFFSET_MS);
  return (
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate() + days, hour, minute) -
    TEHRAN_OFFSET_MS
  );
}
const dateKeyOf = (epoch: number) => new Date(epoch + TEHRAN_OFFSET_MS).toISOString().slice(0, 10);

describe("search API", { skip }, () => {
  let server: TestServer;
  let client: TestClient;

  before(async () => {
    await resetDatabase();
    server = await startServer();
    client = new TestClient(server.url);
    const a = await createAccount({ role: "agency", agencyName: "آسمان بازار" });
    const b = await createAccount({ role: "agency", agencyName: "پروازینو" });
    const departAt = hoursFromNow(30);
    // Same real flight sold by two agencies (one spelling the airline differently).
    await createListing(a.id, { flightNo: "W5-101", departAt, priceToman: 2_690_000 });
    await createListing(b.id, { flightNo: "W5-101", airline: "ماهان", departAt, priceToman: 2_450_000 });
    const ir112 = hoursFromNow(40);
    await createListing(a.id, { flightNo: "IR-112", airline: "ایران ایر", departAt: ir112, priceToman: 2_980_000 });
    await createListing(a.id, {
      flightNo: "IR-112",
      airline: "ایران ایر",
      departAt: ir112,
      cabin: "business",
      priceToman: 6_500_000,
    });
    // Never visible: inactive, departed.
    await createListing(a.id, { flightNo: "OFF-1", isActive: false });
    await createListing(a.id, { flightNo: "GONE-1", departAt: hoursFromNow(-2) });
    // Tehran-day boundary: 00:30 Tehran is still the previous day in UTC.
    await createListing(b.id, { flightNo: "MID-1", departAt: new Date(tehranTime(3, 0, 30)), priceToman: 1_990_000 });
    // Twelve flights to Kish for paging: one an hour, prices falling from 3.1M.
    for (let i = 0; i < 12; i++) {
      await createListing(a.id, {
        destinationCode: "KIH",
        destinationCity: "کیش",
        flightNo: `KI-${100 + i}`,
        departAt: hoursFromNow(50 + i),
        priceToman: 3_100_000 - i * 100_000,
      });
    }
  });

  after(async () => {
    await server?.close();
    await closeDatabase();
  });

  test("groups one real flight sold by several agencies into one card", async () => {
    const res = await client.get<Page>("/api/search?originCode=THR&destinationCode=MHD");
    assert.equal(res.status, 200);
    const w5 = res.body.flights.find((c) => c.flightNo === "W5-101");
    assert.ok(w5, "W5-101 present");
    assert.equal(w5.agencyCount, 2);
    assert.equal(w5.bestPriceToman, 2_450_000);
    assert.deepEqual(
      w5.offers.map((o) => o.agencyName),
      ["پروازینو", "آسمان بازار"],
    );
  });

  test("hides inactive and departed listings", async () => {
    const res = await client.get<Page>("/api/search?originCode=THR&destinationCode=MHD");
    const numbers = res.body.flights.map((c) => c.flightNo).sort();
    assert.deepEqual(numbers, ["IR-112", "MID-1", "W5-101"]);
  });

  test("date filter uses the Tehran calendar day", async () => {
    const day = dateKeyOf(tehranTime(3, 0, 30));
    const onDay = await client.get<Page>(`/api/search?originCode=THR&destinationCode=MHD&date=${day}`);
    assert.deepEqual(
      onDay.body.flights.map((c) => c.flightNo),
      ["MID-1"],
    );
    const dayBefore = dateKeyOf(tehranTime(2, 12));
    const before = await client.get<Page>(`/api/search?originCode=THR&destinationCode=MHD&date=${dayBefore}`);
    assert.ok(!before.body.flights.some((c) => c.flightNo === "MID-1"));
  });

  test("facets describe the whole route", async () => {
    const res = await client.get<{ total: number; airlines: string[]; minPrice: number }>(
      "/api/search/facets?originCode=THR&destinationCode=MHD",
    );
    assert.equal(res.status, 200);
    assert.equal(res.body.total, 3);
    assert.equal(res.body.minPrice, 1_990_000);
    assert.deepEqual(res.body.airlines, ["ایران ایر", "ماهان ایر"]);
  });

  test("cabin filter narrows offers inside a flight", async () => {
    const res = await client.get<Page<Card & { cabin: string }>>(
      "/api/search?originCode=THR&destinationCode=MHD&cabin=business",
    );
    assert.deepEqual(
      res.body.flights.map((c) => [c.flightNo, c.cabin, c.bestPriceToman, c.offers.length]),
      [["IR-112", "business", 6_500_000, 1]],
    );
    const facets = await client.get<{ cabins: string[] }>("/api/search/facets?originCode=THR&destinationCode=MHD");
    assert.deepEqual(facets.body.cabins, ["economy", "business"]);
  });

  test("single-flight endpoint resolves ids and 404s unknown ones", async () => {
    const list = await client.get<Page>("/api/search?originCode=THR&destinationCode=MHD&sort=departure");
    const flight = list.body.flights[0];
    const id = encodeURIComponent(flight.id);
    const found = await client.get<{ flight: Card }>(`/api/flights/THR-MHD/${id}`);
    assert.equal(found.status, 200);
    assert.equal(found.body.flight.id, flight.id);
    // Within its own day, and not on another.
    const day = dateKeyOf(flight.departAt);
    assert.equal((await client.get(`/api/flights/THR-MHD/${id}?date=${day}`)).status, 200);
    assert.equal(
      (await client.get(`/api/flights/THR-MHD/${id}?date=${dateKeyOf(flight.departAt + 86_400_000)}`)).status,
      404,
    );
    assert.equal((await client.get(`/api/flights/THR-MHD/${id}?date=tomorrow`)).status, 400);
    const missing = await client.get("/api/flights/THR-MHD/nope");
    assert.equal(missing.status, 404);
  });

  test("serves results a page at a time, ordered across the whole result set", async () => {
    const url = "/api/search?originCode=THR&destinationCode=KIH&sort=cheapest";
    const first = await client.get<Page>(`${url}&limit=5`);
    assert.equal(first.status, 200);
    assert.deepEqual([first.body.total, first.body.offset, first.body.limit, first.body.flights.length], [12, 0, 5, 5]);
    // The lowest price covers every page, not just this one.
    assert.equal(first.body.minPrice, 2_000_000);
    const pages = [first.body];
    for (const offset of [5, 10]) pages.push((await client.get<Page>(`${url}&limit=5&offset=${offset}`)).body);
    assert.deepEqual(
      pages.map((p) => p.flights.length),
      [5, 5, 2],
    );
    const all = pages.flatMap((p) => p.flights.map((f) => f.flightNo));
    assert.deepEqual(
      all,
      Array.from({ length: 12 }, (_, i) => `KI-${111 - i}`),
      "cheapest first, no gaps or repeats",
    );
    assert.equal((await client.get<Page>(`${url}&offset=12`)).body.flights.length, 0);
    // Ten by default.
    assert.equal((await client.get<Page>(url)).body.flights.length, 10);
    for (const bad of ["limit=0", "limit=101", "offset=-1", "limit=ten"]) {
      assert.equal((await client.get(`${url}&${bad}`)).status, 400, bad);
    }
  });

  test("round trips: flights that can't pair with the other leg come last", async () => {
    const url = "/api/search?originCode=THR&destinationCode=KIH&sort=departure&limit=100";
    const all = (await client.get<Page>(url)).body.flights;
    // A return must leave after the outbound lands: the first four leave too early.
    const departFrom = all[4].departAt;
    const returns = (await client.get<Page>(`${url}&departFrom=${departFrom}`)).body.flights;
    assert.deepEqual(
      returns.map((f) => f.flightNo),
      [...all.slice(4), ...all.slice(0, 4)].map((f) => f.flightNo),
    );
    // An outbound must land before the return leaves. Cheapest first, the three that land
    // too late (also the cheapest) move behind the rest, each group still cheapest first.
    const arriveBy = all[8].arriveAt;
    const cheapest = "/api/search?originCode=THR&destinationCode=KIH&sort=cheapest&limit=100";
    const outbounds = (await client.get<Page>(`${cheapest}&arriveBy=${arriveBy}`)).body.flights;
    assert.deepEqual(
      outbounds.map((f) => f.flightNo),
      [108, 107, 106, 105, 104, 103, 102, 101, 100, 111, 110, 109].map((n) => `KI-${n}`),
    );
    assert.equal((await client.get(`${url}&departFrom=soon`)).status, 400);
  });

  test("rejects unknown airports", async () => {
    const res = await client.get("/api/search?originCode=THR&destinationCode=ZZZ");
    assert.equal(res.status, 400);
  });
});
