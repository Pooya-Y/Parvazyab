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
import { AppDataSource, accounts } from "../database/dataSource";
import { tehranTodayKey } from "../domain/time";
import { evaluatePriceAlerts } from "../services/priceAlerts";

interface Inbox {
  items: { title: string; body: string; link: string }[];
}

describe("moderation", { skip }, () => {
  let server: TestServer;
  let admin: TestClient;
  let adminAccount: Awaited<ReturnType<typeof createAccount>>;

  before(async () => {
    await resetDatabase();
    server = await startServer();
    adminAccount = await createAccount({ role: "admin", email: "moderator@example.com" });
    admin = new TestClient(server.url);
    await signIn(admin, adminAccount.email);
  });

  after(async () => {
    await server?.close();
    await closeDatabase();
  });

  beforeEach(async () => {
    await AppDataSource.query(`DELETE FROM flight_listings`);
  });

  async function agency() {
    const account = await createAccount({ role: "agency" });
    await AppDataSource.query(`INSERT INTO agency_profiles (account_id, slug) VALUES ($1, $2)`, [
      account.id,
      `agency-${account.id.slice(0, 8)}`,
    ]);
    const client = new TestClient(server.url);
    await signIn(client, account.email);
    return { account, client, slug: `agency-${account.id.slice(0, 8)}` };
  }

  async function traveller() {
    const account = await createAccount();
    await accounts().update(account.id, { emailVerifiedAt: new Date() });
    const client = new TestClient(server.url);
    await signIn(client, account.email);
    return { account, client };
  }

  const search = async (origin = "THR", dest = "MHD") =>
    (
      await new TestClient(server.url).get<{ flightNo: string }[]>(
        `/api/search?originCode=${origin}&destinationCode=${dest}`,
      )
    ).body.map((f) => f.flightNo);

  test("a suspended listing disappears everywhere travellers look, and the agency is told why", async () => {
    const { account, client } = await agency();
    const listing = await createListing(account.id, { flightNo: "W5-111" });
    await createListing(account.id, { flightNo: "W5-222", departAt: hoursFromNow(50) });
    assert.deepEqual((await search()).sort(), ["W5-111", "W5-222"]);

    const res = await admin.put(`/api/admin/listings/${listing.id}/suspension`, {
      suspended: true,
      reason: "قیمت گمراه‌کننده",
    });
    assert.equal(res.status, 200);
    assert.deepEqual(await search(), ["W5-222"]);

    const calendar = await new TestClient(server.url).get<{ days: { minPrice: number | null; flights: number }[] }>(
      `/api/search/calendar?originCode=THR&destinationCode=MHD&start=${tehranTodayKey()}&days=5`,
    );
    assert.equal(
      calendar.body.days.reduce((n, d) => n + d.flights, 0),
      1,
      "the calendar agrees with search",
    );
    const go = await new TestClient(server.url).get(`/api/go/${listing.id}`, {
      "User-Agent": "Mozilla/5.0 Chrome/131",
    });
    assert.match(go.headers.get("location") ?? "", /\/search\?/, "and it can't be bought through the redirect");

    const own =
      await client.get<{ id: string; suspendedAt: string | null; suspensionReason: string | null }[]>(
        "/api/dashboard/listings",
      );
    const mine = own.body.find((l) => l.id === listing.id);
    assert.ok(mine?.suspendedAt);
    assert.equal(mine?.suspensionReason, "قیمت گمراه‌کننده");
    const inbox = await client.get<Inbox>("/api/notifications");
    assert.match(inbox.body.items[0].title, /W5-111.*پنهان شد/);
    assert.match(inbox.body.items[0].body, /قیمت گمراه‌کننده/);

    await admin.put(`/api/admin/listings/${listing.id}/suspension`, { suspended: false });
    assert.deepEqual((await search()).sort(), ["W5-111", "W5-222"]);
  });

  test("price alerts don't fire on suspended listings", async () => {
    const { account } = await agency();
    const { client } = await traveller();
    await createListing(account.id, { priceToman: 3_000_000, flightNo: "IR-1" });
    await client.post("/api/alerts", { originCode: "THR", destinationCode: "MHD" });
    const cheap = await createListing(account.id, { priceToman: 1_000_000, flightNo: "IR-2" });
    await admin.put(`/api/admin/listings/${cheap.id}/suspension`, { suspended: true });
    assert.equal(await evaluatePriceAlerts(), 0);
  });

  test("a suspended agency's listings, publishing and API keys all stop; restoring brings them back", async () => {
    const { account, client } = await agency();
    await createListing(account.id, { flightNo: "QB-1" });
    const key = (await client.post<{ key: string }>("/api/dashboard/api-keys", { name: "sync" })).body.key;

    assert.equal(
      (await admin.put(`/api/admin/users/${account.id}/suspension`, { suspended: true, reason: "تخلف" })).status,
      200,
    );
    assert.deepEqual(await search(), []);

    const me = await client.get<{ user: { suspendedAt: string | null; suspensionReason: string } }>("/api/auth/me");
    assert.ok(me.body.user.suspendedAt, "still signed in, and can see the suspension");
    assert.equal(me.body.user.suspensionReason, "تخلف");
    const publish = await client.post("/api/dashboard/listings", {});
    assert.equal(publish.status, 403);
    assert.equal(publish.body.error, "ACCOUNT_SUSPENDED");
    assert.equal(
      (await client.post("/api/dashboard/listings/import", "origin\n", { "Content-Type": "text/csv" })).body.error,
      "ACCOUNT_SUSPENDED",
    );
    const viaApi = await new TestClient(server.url).get("/api/v1/listings", { Authorization: `Bearer ${key}` });
    assert.equal(viaApi.status, 403);

    await admin.put(`/api/admin/users/${account.id}/suspension`, { suspended: false });
    assert.deepEqual(await search(), ["QB-1"]);
    assert.equal(
      (await new TestClient(server.url).get("/api/v1/listings", { Authorization: `Bearer ${key}` })).status,
      200,
    );
  });

  test("a suspended traveller can't review or create alerts; admins and oneself can't be suspended", async () => {
    const { slug } = await agency();
    const { account, client } = await traveller();
    await admin.put(`/api/admin/users/${account.id}/suspension`, { suspended: true });
    assert.equal(
      (await client.put(`/api/agencies/${slug}/reviews/mine`, { rating: 5 })).body.error,
      "ACCOUNT_SUSPENDED",
    );
    assert.equal(
      (await client.post("/api/alerts", { originCode: "THR", destinationCode: "MHD" })).body.error,
      "ACCOUNT_SUSPENDED",
    );

    const otherAdmin = await createAccount({ role: "admin" });
    const res = await admin.put(`/api/admin/users/${otherAdmin.id}/suspension`, { suspended: true });
    assert.equal(res.status, 403);
    assert.equal(res.body.error, "CANNOT_SUSPEND_ADMIN");
    assert.equal(
      (await admin.put(`/api/admin/users/${adminAccount.id}/suspension`, { suspended: true })).body.error,
      "CANNOT_SUSPEND_SELF",
    );
  });

  test("verification: requested with a complete profile, decided by an admin, reported to the agency", async () => {
    const { account, client, slug } = await agency();
    const early = await client.post("/api/dashboard/profile/verification");
    assert.equal(early.status, 400);
    assert.equal(early.body.error, "PROFILE_INCOMPLETE");

    await client.put("/api/dashboard/profile", {
      slug,
      description: "آژانس مسافرتی با سابقهٔ ده ساله در فروش بلیط داخلی و خارجی.",
      licenseNo: "بند ب-۹۹",
    });
    assert.equal((await client.post("/api/dashboard/profile/verification")).status, 202);

    const queue = await admin.get<{ verificationRequests: { agencyId: string; licenseNo: string }[] }>(
      "/api/admin/moderation",
    );
    assert.deepEqual(
      queue.body.verificationRequests.map((v) => [v.agencyId, v.licenseNo]),
      [[account.id, "بند ب-۹۹"]],
    );

    await admin.put(`/api/admin/agencies/${account.id}/verification`, {
      verified: false,
      note: "تصویر مجوز خوانا نیست",
    });
    let inbox = await client.get<Inbox>("/api/notifications");
    assert.match(inbox.body.items[0].body, /تصویر مجوز خوانا نیست/);
    assert.equal(
      (await admin.get<{ verificationRequests: unknown[] }>("/api/admin/moderation")).body.verificationRequests.length,
      0,
    );

    await client.post("/api/dashboard/profile/verification");
    await admin.put(`/api/admin/agencies/${account.id}/verification`, { verified: true });
    const profile = await new TestClient(server.url).get<{ verified: boolean }>(`/api/agencies/${slug}`);
    assert.equal(profile.body.verified, true);
    inbox = await client.get<Inbox>("/api/notifications");
    assert.equal(inbox.body.items[0].title, "آژانس شما تأیید شد");
    assert.equal((await client.post("/api/dashboard/profile/verification")).body.error, "ALREADY_VERIFIED");
  });

  test("reported reviews reach the queue; admins hide them or dismiss the reports", async () => {
    const { slug, client: agencyClient } = await agency();
    const author = await traveller();
    const { body: review } = await author.client.put<{ id: string }>(`/api/agencies/${slug}/reviews/mine`, {
      rating: 1,
      body: "متن توهین‌آمیز",
    });
    assert.equal(
      (await author.client.post(`/api/agencies/${slug}/reviews/${review.id}/report`, { reason: "x" })).body.error,
      "CANNOT_REPORT_OWN_REVIEW",
    );
    const reporter = await traveller();
    assert.equal(
      (await reporter.client.post(`/api/agencies/${slug}/reviews/${review.id}/report`, { reason: "توهین" })).status,
      202,
    );
    await agencyClient.post(`/api/agencies/${slug}/reviews/${review.id}/report`, { reason: "دروغ" });

    let queue = await admin.get<{ reportedReviews: { reviewId: string; reports: number; reasons: string[] }[] }>(
      "/api/admin/moderation",
    );
    assert.equal(queue.body.reportedReviews[0].reviewId, review.id);
    assert.equal(queue.body.reportedReviews[0].reports, 2);
    assert.deepEqual(queue.body.reportedReviews[0].reasons.sort(), ["توهین", "دروغ"]);

    await admin.post(`/api/admin/reviews/${review.id}/dismiss-reports`);
    queue = await admin.get("/api/admin/moderation");
    assert.equal(queue.body.reportedReviews.length, 0);
    assert.equal(
      (await new TestClient(server.url).get<{ items: unknown[] }>(`/api/agencies/${slug}/reviews`)).body.items.length,
      1,
      "dismissing leaves the review up",
    );

    await reporter.client.post(`/api/agencies/${slug}/reviews/${review.id}/report`, { reason: "هنوز توهین است" });
    await admin.put(`/api/admin/reviews/${review.id}/status`, { status: "hidden" });
    assert.equal(
      (await new TestClient(server.url).get<{ items: unknown[] }>(`/api/agencies/${slug}/reviews`)).body.items.length,
      0,
    );
    assert.equal(
      (await admin.get<{ reportedReviews: unknown[] }>("/api/admin/moderation")).body.reportedReviews.length,
      0,
    );
  });

  test("listings are findable by flight, route or agency; only admins moderate", async () => {
    const { account } = await agency();
    await createListing(account.id, { flightNo: "EP-4455", originCode: "THR", destinationCode: "KIH" });
    await createListing(account.id, { flightNo: "W5-100" });

    const byFlight = await admin.get<{ flightNo: string }[]>("/api/admin/listings?q=4455");
    assert.deepEqual(
      byFlight.body.map((l) => l.flightNo),
      ["EP-4455"],
    );
    const byRoute = await admin.get<{ flightNo: string }[]>(`/api/admin/listings?q=${encodeURIComponent("thr-kih")}`);
    assert.deepEqual(
      byRoute.body.map((l) => l.flightNo),
      ["EP-4455"],
    );
    const noWildcards = await admin.get<unknown[]>(`/api/admin/listings?q=${encodeURIComponent("%")}`);
    assert.equal(noWildcards.body.length, 0, "% is a character, not a wildcard");

    const { client: agencyClient } = await agency();
    assert.equal((await agencyClient.get("/api/admin/moderation")).status, 403);
    assert.equal((await agencyClient.get("/api/admin/audit")).status, 403);
  });

  test("every decision lands in the audit log, filterable by action", async () => {
    const { account } = await agency();
    await admin.put(`/api/admin/users/${account.id}/suspension`, { suspended: true, reason: "بررسی" });
    await admin.put(`/api/admin/users/${account.id}/suspension`, { suspended: false });
    const all =
      await admin.get<{ action: string; actorName: string; details: Record<string, unknown> }[]>("/api/admin/audit");
    assert.equal(all.status, 200);
    const suspended = await admin.get<{ action: string; actorContact: string; details: { reason: string } }[]>(
      "/api/admin/audit?action=admin.account_suspended",
    );
    assert.ok(suspended.body.length >= 1);
    assert.ok(suspended.body.every((e) => e.action === "admin.account_suspended"));
    assert.equal(suspended.body[0].actorContact, adminAccount.email);
    assert.equal(suspended.body[0].details.reason, "بررسی");
    assert.equal((await admin.get("/api/admin/audit?action=not.a.thing")).status, 400);
  });
});
