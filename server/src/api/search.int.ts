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
  });

  after(async () => {
    await server?.close();
    await closeDatabase();
  });

  test("groups one real flight sold by several agencies into one card", async () => {
    const res = await client.get<Card[]>("/api/search?originCode=THR&destinationCode=MHD");
    assert.equal(res.status, 200);
    const w5 = res.body.find((c) => c.flightNo === "W5-101");
    assert.ok(w5, "W5-101 present");
    assert.equal(w5.agencyCount, 2);
    assert.equal(w5.bestPriceToman, 2_450_000);
    assert.deepEqual(
      w5.offers.map((o) => o.agencyName),
      ["پروازینو", "آسمان بازار"],
    );
  });

  test("hides inactive and departed listings", async () => {
    const res = await client.get<Card[]>("/api/search?originCode=THR&destinationCode=MHD");
    const numbers = res.body.map((c) => c.flightNo).sort();
    assert.deepEqual(numbers, ["IR-112", "MID-1", "W5-101"]);
  });

  test("date filter uses the Tehran calendar day", async () => {
    const day = dateKeyOf(tehranTime(3, 0, 30));
    const onDay = await client.get<Card[]>(`/api/search?originCode=THR&destinationCode=MHD&date=${day}`);
    assert.deepEqual(
      onDay.body.map((c) => c.flightNo),
      ["MID-1"],
    );
    const dayBefore = dateKeyOf(tehranTime(2, 12));
    const before = await client.get<Card[]>(`/api/search?originCode=THR&destinationCode=MHD&date=${dayBefore}`);
    assert.ok(!before.body.some((c) => c.flightNo === "MID-1"));
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
    const res = await client.get<(Card & { cabin: string })[]>(
      "/api/search?originCode=THR&destinationCode=MHD&cabin=business",
    );
    assert.deepEqual(
      res.body.map((c) => [c.flightNo, c.cabin, c.bestPriceToman, c.offers.length]),
      [["IR-112", "business", 6_500_000, 1]],
    );
    const facets = await client.get<{ cabins: string[] }>("/api/search/facets?originCode=THR&destinationCode=MHD");
    assert.deepEqual(facets.body.cabins, ["economy", "business"]);
  });

  test("single-flight endpoint resolves ids and 404s unknown ones", async () => {
    const list = await client.get<Card[]>("/api/search?originCode=THR&destinationCode=MHD");
    const id = list.body[0].id;
    const found = await client.get<{ flight: Card }>(`/api/flights/THR-MHD/${encodeURIComponent(id)}`);
    assert.equal(found.status, 200);
    assert.equal(found.body.flight.id, id);
    const missing = await client.get("/api/flights/THR-MHD/nope");
    assert.equal(missing.status, 404);
  });

  test("rejects unknown airports", async () => {
    const res = await client.get("/api/search?originCode=THR&destinationCode=ZZZ");
    assert.equal(res.status, 400);
  });
});
