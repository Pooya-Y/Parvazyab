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

interface Explore {
  scope: string;
  destinations: { code: string; minPrice: number; cheapestDate: string; flights: number; isInternational: boolean }[];
}

const tehranDate = (d: Date) => new Date(d.getTime() + TEHRAN_OFFSET_MS).toISOString().slice(0, 10);

describe("explore API", { skip }, () => {
  let server: TestServer;
  let client: TestClient;
  const cheapKih = hoursFromNow(50);

  before(async () => {
    await resetDatabase();
    const a = await createAccount({ role: "agency" });
    const b = await createAccount({ role: "agency" });
    // MHD: one real flight sold twice + another flight.
    const w5 = hoursFromNow(30);
    await createListing(a.id, { destinationCode: "MHD", flightNo: "W5-1", departAt: w5, priceToman: 2_400_000 });
    await createListing(b.id, { destinationCode: "MHD", flightNo: "W5-1", departAt: w5, priceToman: 2_300_000 });
    await createListing(a.id, { destinationCode: "MHD", flightNo: "IR-1", departAt: hoursFromNow(40), priceToman: 2_900_000 });
    // KIH is cheapest; its business fare and a flight beyond the window must not count.
    await createListing(a.id, { destinationCode: "KIH", destinationCity: "کیش", flightNo: "Y9-1", departAt: cheapKih, priceToman: 1_900_000 });
    await createListing(a.id, { destinationCode: "KIH", flightNo: "Y9-2", departAt: hoursFromNow(60), cabin: "business", priceToman: 900_000 });
    await createListing(a.id, { destinationCode: "KIH", flightNo: "Y9-3", departAt: hoursFromNow(24 * 20), priceToman: 1_000_000 });
    // An international destination from the same origin.
    await createListing(b.id, { destinationCode: "DXB", destinationCity: "دبی", flightNo: "FZ-1", departAt: hoursFromNow(70), priceToman: 8_000_000 });
    server = await startServer();
    client = new TestClient(server.url);
  });

  after(async () => {
    await server?.close();
    await closeDatabase();
  });

  test("ranks destinations by their lowest economy fare in the window", async () => {
    const res = await client.get<Explore>("/api/explore?originCode=THR&days=14");
    assert.equal(res.status, 200);
    assert.deepEqual(
      res.body.destinations.map((d) => [d.code, d.minPrice, d.flights]),
      [
        ["KIH", 1_900_000, 1],
        ["MHD", 2_300_000, 2],
        ["DXB", 8_000_000, 1],
      ],
    );
    assert.equal(res.body.destinations[0].cheapestDate, tehranDate(cheapKih));
  });

  test("a longer window includes later flights", async () => {
    const res = await client.get<Explore>("/api/explore?originCode=THR&days=30");
    assert.equal(res.body.destinations.find((d) => d.code === "KIH")?.minPrice, 1_000_000);
  });

  test("scope splits domestic and international", async () => {
    const domestic = await client.get<Explore>("/api/explore?originCode=THR&days=14&scope=domestic");
    assert.deepEqual(
      domestic.body.destinations.map((d) => d.code),
      ["KIH", "MHD"],
    );
    const international = await client.get<Explore>("/api/explore?originCode=THR&days=14&scope=international");
    assert.deepEqual(
      international.body.destinations.map((d) => [d.code, d.isInternational]),
      [["DXB", true]],
    );
  });

  test("validates input", async () => {
    assert.equal((await client.get("/api/explore?originCode=XXX")).status, 400);
    assert.equal((await client.get("/api/explore?originCode=THR&days=365")).status, 400);
  });
});
