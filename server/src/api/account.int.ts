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
  signIn,
  startServer,
  type TestServer,
} from "../test/harness";
import type { Account } from "../database/entities";

describe("saved flights, agency listings and admin", { skip }, () => {
  let server: TestServer;
  let agency: Account;
  let otherAgency: Account;
  let user: Account;
  let admin: Account;

  before(async () => {
    await resetDatabase();
    server = await startServer();
    agency = await createAccount({ role: "agency", agencyName: "آسمان بازار" });
    otherAgency = await createAccount({ role: "agency", agencyName: "پروازینو" });
    user = await createAccount();
    admin = await createAccount({ role: "admin" });
  });

  after(async () => {
    await server?.close();
    await closeDatabase();
  });

  async function as(account: Account) {
    const client = new TestClient(server.url);
    await signIn(client, account.email);
    return client;
  }

  test("saving a flight is idempotent and private to the user", async () => {
    await createListing(agency.id, { flightNo: "W5-500", departAt: hoursFromNow(20) });
    const client = await as(user);
    const [flight] = (await client.get<{ id: string; offers: { agencyName: string }[] }[]>(
      "/api/search?originCode=THR&destinationCode=MHD",
    )).body;
    const snapshot = { ...flight, agencyName: flight.offers[0].agencyName };
    const first = await client.post("/api/saved-flights", { snapshot });
    assert.equal(first.status, 201);
    const again = await client.post("/api/saved-flights", { snapshot });
    assert.equal(again.status, 200);
    const list = await client.get<{ flightKey: string; priceToman: number; departAt: number }[]>("/api/saved-flights");
    assert.equal(list.body.length, 1);
    assert.equal(typeof list.body[0].priceToman, "number");
    assert.equal(typeof list.body[0].departAt, "number");

    const stranger = await as(otherAgency);
    assert.equal((await stranger.get<unknown[]>("/api/saved-flights")).body.length, 0);

    const del = await client.delete(`/api/saved-flights/${encodeURIComponent(list.body[0].flightKey)}`);
    assert.equal(del.status, 204);
    assert.equal((await client.get<unknown[]>("/api/saved-flights")).body.length, 0);
  });

  test("agencies manage only their own listings", async () => {
    const owner = await as(agency);
    const departAt = hoursFromNow(72).getTime();
    const created = await owner.post<{ id: string }>("/api/dashboard/listings", {
      originCode: "IFN",
      destinationCode: "SYZ",
      airline: "zagros",
      flightNo: "iz-708",
      departAt,
      arriveAt: departAt + 95 * 60_000,
      stops: 0,
      cabin: "economy",
      priceToman: 2_050_000,
      bookingUrl: "https://agency.example/iz708",
      isActive: true,
    });
    assert.equal(created.status, 201);
    const search = await owner.get<{ airline: string; flightNo: string }[]>("/api/search?originCode=IFN&destinationCode=SYZ");
    assert.deepEqual(
      search.body.map((f) => [f.airline, f.flightNo]),
      [["زاگرس", "IZ-708"]],
    );

    const intruder = await as(otherAgency);
    assert.equal((await intruder.delete(`/api/dashboard/listings/${created.body.id}`)).status, 404);
    assert.equal(
      (await intruder.patch(`/api/dashboard/listings/${created.body.id}/status`, { isActive: false })).status,
      404,
    );

    const regular = await as(user);
    assert.equal((await regular.get("/api/dashboard/listings")).status, 403);

    assert.equal((await owner.patch(`/api/dashboard/listings/${created.body.id}/status`, { isActive: false })).status, 200);
    const hidden = await owner.get<unknown[]>("/api/search?originCode=IFN&destinationCode=SYZ");
    assert.equal(hidden.body.length, 0);

    const stats = await owner.get<{ total: number; active: number }>("/api/dashboard/stats");
    assert.equal(stats.body.total, 2);
    assert.equal(stats.body.active, 1);
  });

  test("listings carry a fare type that search can filter on", async () => {
    const owner = await as(agency);
    const departAt = hoursFromNow(60).getTime();
    const base = {
      originCode: "THR",
      destinationCode: "KIH",
      airline: "ماهان ایر",
      departAt,
      arriveAt: departAt + 130 * 60_000,
      stops: 0,
      cabin: "economy",
      bookingUrl: "https://agency.example/kih",
      isActive: true,
    };
    const charter = await owner.post("/api/dashboard/listings", {
      ...base,
      flightNo: "W5-553",
      priceToman: 2_500_000,
      fareType: "charter",
    });
    assert.equal(charter.status, 201);
    const scheduled = await owner.post("/api/dashboard/listings", { ...base, flightNo: "IR-551", priceToman: 3_100_000 });
    assert.equal(scheduled.status, 201);

    const mine = await owner.get<{ flightNo: string; fareType: string }[]>("/api/dashboard/listings");
    assert.equal(mine.body.find((l) => l.flightNo === "IR-551")?.fareType, "scheduled");

    const onlyCharter = await owner.get<{ flightNo: string; offers: { fareType: string }[] }[]>(
      "/api/search?originCode=THR&destinationCode=KIH&fareType=charter",
    );
    assert.deepEqual(
      onlyCharter.body.map((f) => [f.flightNo, f.offers[0].fareType]),
      [["W5-553", "charter"]],
    );
    const facets = await owner.get<{ fareTypes: string[] }>("/api/search/facets?originCode=THR&destinationCode=KIH");
    assert.deepEqual(facets.body.fareTypes, ["scheduled", "charter"]);
    assert.equal((await owner.get("/api/search?originCode=THR&destinationCode=KIH&fareType=vip")).status, 400);
  });

  test("listing writes reject non-http booking links", async () => {
    const owner = await as(agency);
    const departAt = hoursFromNow(80).getTime();
    const res = await owner.post("/api/dashboard/listings", {
      originCode: "THR",
      destinationCode: "KIH",
      airline: "کیش ایر",
      flightNo: "Y9-1",
      departAt,
      arriveAt: departAt + 3_600_000,
      stops: 0,
      cabin: "economy",
      priceToman: 1_000_000,
      bookingUrl: "javascript:alert(1)",
      isActive: true,
    });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body.details, ["bookingUrl: INVALID_BOOKING_URL"]);
  });

  test("admins change roles but never an admin's or their own", async () => {
    const client = await as(admin);
    assert.equal((await client.patch(`/api/admin/users/${user.id}/role`, { accountRole: "agency" })).status, 200);
    assert.equal((await client.patch(`/api/admin/users/${admin.id}/role`, { accountRole: "user" })).status, 400);
    const other = await createAccount({ role: "admin" });
    const res = await client.patch(`/api/admin/users/${other.id}/role`, { accountRole: "user" });
    assert.equal(res.status, 403);
    assert.equal(res.body.error, "CANNOT_CHANGE_ADMIN");
    assert.equal((await (await as(user)).get("/api/admin/stats")).status, 403);
  });
});
