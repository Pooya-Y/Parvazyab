import { skip } from "../test/use-test-database";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { TestClient, closeDatabase, createAccount, resetDatabase, startServer, type TestServer } from "../test/harness";
import { seedDemoData } from "../database/seed";
import { tehranTodayKey } from "../domain/time";

interface Calendar {
  start: string;
  days: { date: string; minPrice: number | null; flights: number }[];
}

describe("price calendar", { skip }, () => {
  let server: TestServer;
  let client: TestClient;
  const today = tehranTodayKey();

  before(async () => {
    await resetDatabase();
    await seedDemoData();
    await createAccount();
    server = await startServer();
    client = new TestClient(server.url);
  });

  after(async () => {
    await server?.close();
    await closeDatabase();
  });

  async function cheapestOn(date: string, extra = "") {
    const res = await client.get<{ flights: { bestPriceToman: number }[] }>(
      `/api/search?originCode=THR&destinationCode=MHD&date=${date}&sort=cheapest${extra}`,
    );
    return res.body.flights[0]?.bestPriceToman ?? null;
  }

  test("each day's minimum matches the cheapest search result that day", async () => {
    const res = await client.get<Calendar>(
      `/api/search/calendar?originCode=THR&destinationCode=MHD&start=${today}&days=10`,
    );
    assert.equal(res.status, 200);
    assert.equal(res.body.days.length, 10);
    assert.ok(res.body.days.filter((d) => d.minPrice !== null).length >= 8);
    for (const day of res.body.days) assert.equal(day.minPrice, await cheapestOn(day.date), day.date);
  });

  test("filters apply exactly as they do in search", async () => {
    const filters = "&fareType=charter&departFromHour=12&departToHour=23";
    const res = await client.get<Calendar>(
      `/api/search/calendar?originCode=THR&destinationCode=MHD&start=${today}&days=7${filters}`,
    );
    for (const day of res.body.days) assert.equal(day.minPrice, await cheapestOn(day.date, filters), day.date);
  });

  test("validates the window", async () => {
    const tooLong = await client.get(`/api/search/calendar?originCode=THR&destinationCode=MHD&start=${today}&days=90`);
    assert.equal(tooLong.status, 400);
    const badDate = await client.get("/api/search/calendar?originCode=THR&destinationCode=MHD&start=2030-02-30");
    assert.equal(badDate.status, 400);
  });
});
