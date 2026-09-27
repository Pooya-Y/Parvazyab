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
import { AppDataSource, accounts } from "../database/dataSource";

interface Inbox {
  items: { title: string; body: string; link: string | null }[];
}

interface Queue {
  reportedListings: {
    listingId: string;
    flightNo: string;
    agencyName: string;
    priceToman: number;
    reports: number;
    reasons: { reason: string; count: number }[];
    notes: { reason: string; note: string; observedPrice: number | null }[];
  }[];
}

describe("reports on agencies' offers", { skip }, () => {
  let server: TestServer;
  let admin: TestClient;
  let ip = 0;

  // Each client its own address, so the per-IP report limit doesn't cross tests.
  async function signedIn(role: "user" | "agency" = "user", agencyName?: string) {
    const account = await createAccount({ role, agencyName });
    const client = new TestClient(server.url, `10.9.0.${++ip}`);
    await signIn(client, account.email);
    return { account, client };
  }

  before(async () => {
    await resetDatabase();
    server = await startServer();
    const adminAccount = await createAccount({ role: "admin" });
    admin = new TestClient(server.url, "10.9.1.1");
    await signIn(admin, adminAccount.email);
  });

  after(async () => {
    await server?.close();
    await closeDatabase();
  });

  beforeEach(async () => {
    await AppDataSource.query(`DELETE FROM listing_reports`);
    await AppDataSource.query(`DELETE FROM flight_listings`);
  });

  async function offer(flightNo = "W5-101") {
    const agency = await signedIn("agency", "آسمان بازار");
    const listing = await createListing(agency.account.id, { flightNo, priceToman: 2_450_000 });
    return { agency, listing };
  }

  const report = (client: TestClient, listingId: string, body: Record<string, unknown>) =>
    client.post(`/api/listings/${listingId}/reports`, body);

  const queue = async () => (await admin.get<Queue>("/api/admin/moderation")).body.reportedListings;
  const search = async () =>
    (
      await new TestClient(server.url).get<{ flights: { flightNo: string }[] }>(
        "/api/search?originCode=THR&destinationCode=MHD",
      )
    ).body.flights.map((f) => f.flightNo);

  test("travellers report an offer; reporting it again updates their open report", async () => {
    const { listing, agency } = await offer();
    const first = await signedIn();
    const second = await signedIn();

    assert.equal((await report(new TestClient(server.url), listing.id, { reason: "unavailable" })).status, 401);
    const priceReport = { reason: "price_mismatch", observedPrice: 2_900_000, note: "در سایت آژانس گران‌تر است" };
    assert.equal((await report(first.client, listing.id, priceReport)).status, 201);
    assert.equal((await report(first.client, listing.id, { reason: "broken_link" })).status, 200);
    assert.equal((await report(second.client, listing.id, priceReport)).status, 201);

    const [reported] = await queue();
    assert.equal(reported.listingId, listing.id);
    assert.equal(reported.reports, 2, "one open report per person");
    assert.deepEqual(reported.reasons.map((r) => [r.reason, r.count]).sort(), [
      ["broken_link", 1],
      ["price_mismatch", 1],
    ]);
    // The first reporter changed their report to a dead link (no note); the second one's words and price remain.
    assert.deepEqual(
      reported.notes.map((n) => [n.reason, n.note, n.observedPrice]),
      [["price_mismatch", "در سایت آژانس گران‌تر است", 2_900_000]],
    );
    assert.equal(reported.agencyName, "آسمان بازار");
    assert.equal(reported.priceToman, 2_450_000);

    // An agency can't report its own offer.
    const own = await report(agency.client, listing.id, { reason: "unavailable" });
    assert.equal(own.status, 400);
    assert.equal(own.body.error, "CANNOT_REPORT_OWN_LISTING");
  });

  test("reports are validated, and only for offers travellers can see", async () => {
    const { listing } = await offer();
    const { client } = await signedIn();
    assert.equal((await report(client, listing.id, { reason: "spam" })).status, 400);
    const bare = await report(client, listing.id, { reason: "other" });
    assert.equal(bare.status, 400);
    assert.deepEqual(bare.body.details, ["note: REPORT_NOTE_REQUIRED"]);
    assert.equal((await report(client, listing.id, { reason: "other", note: "x".repeat(501) })).status, 400);
    assert.equal((await report(client, "not-a-uuid", { reason: "unavailable" })).status, 400);

    // A price seen elsewhere only goes with a price mismatch.
    assert.equal((await report(client, listing.id, { reason: "unavailable", observedPrice: 3_000_000 })).status, 201);
    assert.equal((await queue())[0].notes.length, 0);

    await AppDataSource.query(`UPDATE flight_listings SET is_active = false WHERE id = $1`, [listing.id]);
    assert.equal((await report(client, listing.id, { reason: "unavailable" })).status, 404);
    assert.deepEqual(await queue(), [], "hidden offers leave the queue");
  });

  test("suspending the offer closes its reports and tells each reporter", async () => {
    const { listing } = await offer();
    const reporter = await signedIn();
    await report(reporter.client, listing.id, { reason: "price_mismatch", observedPrice: 2_900_000 });

    const res = await admin.put(`/api/admin/listings/${listing.id}/suspension`, {
      suspended: true,
      reason: "قیمت اعلام‌شده با سایت آژانس فرق دارد",
    });
    assert.equal(res.status, 200);
    assert.deepEqual(await search(), []);
    assert.deepEqual(await queue(), []);
    const [{ resolution }] = (await AppDataSource.query(`SELECT resolution FROM listing_reports`)) as {
      resolution: string;
    }[];
    assert.equal(resolution, "suspended");

    const inbox = await reporter.client.get<Inbox>("/api/notifications");
    const note = inbox.body.items.find((n) => n.title === "گزارش شما بررسی شد");
    assert.ok(note, "the reporter is told");
    assert.match(note.body, /آسمان بازار.*W5-101.*برداشته شد/);
    assert.match(note.link ?? "", /^\/search\?from=THR&to=MHD&date=\d{4}-\d{2}-\d{2}$/);

    // Back on sale, the offer can be reported afresh.
    await admin.put(`/api/admin/listings/${listing.id}/suspension`, { suspended: false });
    assert.equal((await report(reporter.client, listing.id, { reason: "unavailable" })).status, 201);
  });

  test("dismissing keeps the offer, closes the reports, and is audited", async () => {
    const { listing } = await offer();
    const reporter = await signedIn();
    await report(reporter.client, listing.id, { reason: "wrong_details", note: "ساعت پرواز در سایت ۸:۳۰ است" });

    assert.equal((await reporter.client.post(`/api/admin/listings/${listing.id}/dismiss-reports`)).status, 403);
    assert.equal((await admin.post(`/api/admin/listings/${listing.id}/dismiss-reports`)).status, 200);
    assert.deepEqual(await search(), ["W5-101"]);
    assert.deepEqual(await queue(), []);

    const inbox = await reporter.client.get<Inbox>("/api/notifications");
    assert.ok(inbox.body.items.some((n) => /مشکلی در آن پیدا نکردیم/.test(n.body)));
    const audit = await admin.get<{ action: string; details: { reports: number } }[]>(
      "/api/admin/audit?action=admin.listing_reports_dismissed",
    );
    assert.equal(audit.body[0]?.details.reports, 1);
  });

  test("suspended accounts can't report, and a daily cap stops floods", async () => {
    const { listing, agency } = await offer();
    const suspended = await signedIn();
    await accounts().update(suspended.account.id, { suspendedAt: new Date() });
    const blocked = await report(suspended.client, listing.id, { reason: "unavailable" });
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.error, "ACCOUNT_SUSPENDED");

    // Thirty reports today already, on thirty other offers.
    const busy = await signedIn();
    const others: string[] = [];
    for (let i = 0; i < 30; i++) others.push((await createListing(agency.account.id, { flightNo: `X-${i}` })).id);
    await AppDataSource.query(
      `INSERT INTO listing_reports (listing_id, reporter_id, reason) SELECT unnest($1::uuid[]), $2, 'unavailable'`,
      [others, busy.account.id],
    );
    const capped = await report(busy.client, listing.id, { reason: "unavailable" });
    assert.equal(capped.status, 429);
    assert.equal(capped.body.error, "REPORT_LIMIT");
  });
});
