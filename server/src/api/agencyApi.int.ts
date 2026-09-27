import { skip } from "../test/use-test-database";
import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  TestClient,
  closeDatabase,
  createAccount,
  createListing,
  resetDatabase,
  signIn,
  startServer,
  type TestServer,
} from "../test/harness";
import { AppDataSource, accounts, flightListings } from "../database/dataSource";
import { addDaysToDateKey, tehranTodayKey } from "../domain/time";
import { drainBackgroundTasks } from "../lib/background";
import { openApiDocument } from "./openapi";

interface KeyBody {
  id: string;
  name: string;
  prefix: string;
  key?: string;
  lastUsedAt: number | null;
}

interface Report {
  error?: string;
  committed: boolean;
  counts: { create: number; update: number; unchanged: number; error: number };
  rows: { ref: number; action: string; errors: string[]; id?: string }[];
}

const day = (offset: number) => addDaysToDateKey(tehranTodayKey(), offset);

function listing(overrides: Record<string, unknown> = {}) {
  return {
    originCode: "THR",
    destinationCode: "MHD",
    airline: "ماهان ایر",
    flightNo: "W5-1071",
    departAt: `${day(5)}T08:30:00+03:30`,
    arriveAt: `${day(5)}T10:00:00+03:30`,
    cabin: "economy",
    priceToman: 2_450_000,
    bookingUrl: "https://agency.example/book/W5-1071",
    ...overrides,
  };
}

describe("agency API", { skip }, () => {
  let server: TestServer;
  let agency: Awaited<ReturnType<typeof createAccount>>;
  let dashboard: TestClient;

  before(async () => {
    await resetDatabase();
    server = await startServer();
    agency = await createAccount({ role: "agency", email: "api-agency@example.com" });
    dashboard = new TestClient(server.url);
    await signIn(dashboard, agency.email);
  });

  after(async () => {
    await server?.close();
    await closeDatabase();
  });

  beforeEach(async () => {
    await AppDataSource.query(`DELETE FROM flight_listings`);
    await AppDataSource.query(`DELETE FROM api_keys`);
  });

  async function newKey(name = "همگام‌سازی") {
    const res = await dashboard.post<KeyBody>("/api/dashboard/api-keys", { name });
    assert.equal(res.status, 201, res.text);
    return res.body.key!;
  }

  const api = (key?: string) => {
    const client = new TestClient(server.url);
    const auth: Record<string, string> = key ? { Authorization: `Bearer ${key}` } : {};
    return {
      get: <T>(path: string) => client.get<T>(`/api/v1${path}`, auth),
      put: <T>(path: string, body: unknown) => client.put<T>(`/api/v1${path}`, body, auth),
      patch: <T>(path: string, body: unknown) => client.patch<T>(`/api/v1${path}`, body, auth),
      delete: (path: string) => client.delete(`/api/v1${path}`, auth),
    };
  };

  test("keys are shown once, listed by prefix, capped at five, and revocable", async () => {
    const created = await dashboard.post<KeyBody>("/api/dashboard/api-keys", { name: "سامانهٔ فروش" });
    assert.equal(created.status, 201);
    assert.equal(created.headers.get("cache-control"), "no-store");
    assert.match(created.body.key ?? "", new RegExp(`^pvz_${created.body.prefix}_[A-Za-z0-9_-]{43}$`));

    const list = await dashboard.get<KeyBody[]>("/api/dashboard/api-keys");
    assert.equal(list.body.length, 1);
    assert.equal(list.body[0].prefix, created.body.prefix);
    assert.equal("key" in list.body[0], false, "the key itself is never listed");
    const [row] = (await AppDataSource.query(`SELECT key_hash FROM api_keys`)) as { key_hash: string }[];
    assert.notEqual(row.key_hash, created.body.key, "only a hash is stored");

    for (let i = 0; i < 4; i++) await newKey(`key ${i}`);
    const sixth = await dashboard.post("/api/dashboard/api-keys", { name: "one too many" });
    assert.equal(sixth.status, 409);
    assert.equal(sixth.body.error, "API_KEY_LIMIT_REACHED");

    assert.equal((await api(created.body.key).get("/listings")).status, 200);
    assert.equal((await dashboard.delete(`/api/dashboard/api-keys/${created.body.id}`)).status, 204);
    const revoked = await api(created.body.key).get("/listings");
    assert.equal(revoked.status, 401);
    assert.equal((await dashboard.delete(`/api/dashboard/api-keys/${created.body.id}`)).status, 404);
  });

  test("every way of presenting a bad key gets the same 401", async () => {
    const key = await newKey();
    const tampered = key.slice(0, -1) + (key.endsWith("A") ? "B" : "A");
    for (const attempt of [undefined, "nonsense", "pvz_short_x", tampered]) {
      const res = await api(attempt).get<{ error: string }>("/listings");
      assert.equal(res.status, 401, String(attempt));
      assert.equal(res.body.error, "INVALID_API_KEY");
      assert.equal(res.headers.get("www-authenticate"), 'Bearer realm="parvazyab"');
    }
  });

  test("bulk upsert: dry run, all-or-nothing, then updates in place", async () => {
    const client = api(await newKey());
    const good = listing();
    const bad = listing({ flightNo: "W5-2", originCode: "XXX" });

    const dry = await client.put<Report>("/listings?dryRun=true", { listings: [good, bad] });
    assert.equal(dry.status, 200);
    assert.equal(dry.body.committed, false);
    assert.deepEqual(dry.body.rows[1].errors, ["originCode: UNKNOWN_AIRPORT"], "API errors name API fields");

    const refused = await client.put<Report>("/listings", { listings: [good, bad] });
    assert.equal(refused.status, 422);
    assert.equal(refused.body.error, "IMPORT_HAS_ERRORS");
    assert.equal(await flightListings().count(), 0);

    const done = await client.put<Report>("/listings", { listings: [good] });
    assert.equal(done.status, 200);
    assert.deepEqual(done.body.counts, { create: 1, update: 0, unchanged: 0, error: 0 });
    const [saved] = await flightListings().find();
    assert.equal(saved.departAt.toISOString(), new Date(`${day(5)}T08:30:00+03:30`).toISOString(), "offsets respected");
    assert.equal(saved.accountId, agency.id);

    const repriced = await client.put<Report>("/listings", { listings: [{ ...good, priceToman: 2_300_000 }] });
    assert.deepEqual(repriced.body.counts, { create: 0, update: 1, unchanged: 0, error: 0 });
    assert.equal(repriced.body.rows[0].id, saved.id);
    assert.equal(await flightListings().count(), 1);

    const epoch = await client.put<Report>("/listings", {
      listings: [
        { ...good, priceToman: 2_300_000, departAt: saved.departAt.getTime(), arriveAt: saved.arriveAt.getTime() },
      ],
    });
    assert.deepEqual(epoch.body.counts, { create: 0, update: 0, unchanged: 1, error: 0 }, "epoch ms work too");

    const listed = await client.get<{ data: { id: string; departAt: string; priceToman: number }[] }>("/listings");
    assert.equal(listed.body.data[0].id, saved.id);
    assert.equal(listed.body.data[0].priceToman, 2_300_000);
    assert.match(listed.body.data[0].departAt, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
  });

  test("bulk bodies may be large here, and only here", async () => {
    const client = api(await newKey());
    const many = Array.from({ length: 600 }, (_, i) => listing({ flightNo: `W5-${1000 + i}` }));
    const res = await client.put<Report>("/listings?dryRun=true", { listings: many });
    assert.equal(res.status, 200, res.text.slice(0, 200));
    assert.equal(res.body.counts.create, 600);

    const bigElsewhere = await dashboard.post("/api/alerts", {
      originCode: "THR",
      destinationCode: "MHD",
      pad: "x".repeat(150_000),
    });
    assert.equal(bigElsewhere.status, 413);
  });

  test("patch and delete only the agency's own listings", async () => {
    const client = api(await newKey());
    const mine = await createListing(agency.id);
    const other = await createAccount({ role: "agency", email: "other-api@example.com" });
    const theirs = await createListing(other.id, { flightNo: "IR-9" });

    const patched = await client.patch<{ priceToman: number; isActive: boolean }>(`/listings/${mine.id}`, {
      priceToman: 1_990_000,
      isActive: false,
    });
    assert.equal(patched.status, 200);
    assert.equal(patched.body.priceToman, 1_990_000);
    assert.equal(patched.body.isActive, false);

    assert.equal((await client.patch(`/listings/${theirs.id}`, { priceToman: 1 })).status, 404);
    assert.equal((await client.patch(`/listings/${mine.id}`, {})).status, 400);
    assert.equal(
      (await client.patch(`/listings/${mine.id}`, { airline: "x" })).status,
      400,
      "unknown fields are refused",
    );
    assert.equal((await client.delete(`/listings/${theirs.id}`)).status, 404);
    assert.equal((await client.delete(`/listings/${mine.id}`)).status, 204);
  });

  test("a key stops working when its account stops being an agency", async () => {
    const key = await newKey();
    await accounts().update(agency.id, { role: "user" });
    try {
      assert.equal((await api(key).get("/listings")).status, 403);
    } finally {
      await accounts().update(agency.id, { role: "agency" });
    }
  });

  test("records when a key was last used", async () => {
    const key = await newKey();
    await api(key).get("/listings");
    await drainBackgroundTasks();
    const [row] = await dashboard.get<KeyBody[]>("/api/dashboard/api-keys").then((r) => r.body);
    assert.equal(typeof row.lastUsedAt, "number");
  });

  test("the OpenAPI document is public and every path in it is routed", async () => {
    const doc = await new TestClient(server.url).get<typeof openApiDocument>("/api/v1/openapi.json");
    assert.equal(doc.status, 200);
    assert.equal(doc.body.openapi, "3.1.0");
    const client = api(await newKey());
    const probe = await createListing(agency.id, { flightNo: "PROBE-1" });
    for (const [path, item] of Object.entries(doc.body.paths)) {
      const url = path.replace("{id}", probe.id);
      for (const method of ["get", "put", "patch", "delete"].filter((m) => m in item)) {
        const res =
          method === "get"
            ? await client.get(url)
            : method === "put"
              ? await client.put(`${url}?dryRun=true`, { listings: [listing()] })
              : method === "patch"
                ? await client.patch(url, { isActive: true })
                : await client.delete(url);
        assert.notEqual(res.status, 404, `${method.toUpperCase()} ${path} is documented but not routed`);
      }
    }
  });
});
