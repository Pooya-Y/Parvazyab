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

interface Profile {
  slug: string;
  name: string;
  description: string;
  website: string | null;
  supportPhone: string | null;
  city: string | null;
  licenseNo: string | null;
  verified: boolean;
  rating: { average: number | null; count: number; histogram: number[] };
  routes: { originCode: string; destinationCode: string; minPrice: number; flights: number }[];
}

interface Review {
  id: string;
  rating: number;
  body: string;
  author: string;
  mine: boolean;
  reply: string | null;
  hidden?: boolean;
}

describe("agency profiles and reviews", { skip }, () => {
  let server: TestServer;

  before(async () => {
    await resetDatabase();
    server = await startServer();
  });

  after(async () => {
    await server?.close();
    await closeDatabase();
  });

  beforeEach(async () => {
    await AppDataSource.query(`DELETE FROM agency_reviews`);
  });

  /** An agency made the way real ones are: a traveller who becomes one. */
  async function agency(name = "آژانس آزمایشی") {
    const account = await createAccount();
    const client = new TestClient(server.url);
    await signIn(client, account.email);
    assert.equal((await client.post("/api/dashboard/become-agency", { agencyName: name })).status, 200);
    const profile = await client.get<Profile>("/api/dashboard/profile");
    return { account, client, slug: profile.body.slug };
  }

  async function traveller({ verified = true, name = "سارا کاظمی" } = {}) {
    const account = await createAccount({ name });
    if (verified) await accounts().update(account.id, { emailVerifiedAt: new Date() });
    const client = new TestClient(server.url);
    await signIn(client, account.email);
    return { account, client };
  }

  test("becoming an agency creates a profile the agency can then shape", async () => {
    const { client, slug } = await agency("پرواز سپهر");
    assert.match(slug, /^agency-[0-9a-f]{8}$/);

    const updated = await client.put<Profile>("/api/dashboard/profile", {
      slug: "Sepehr-Travel",
      description: "  فروش بلیط داخلی و خارجی  ",
      website: "https://sepehr.example",
      supportPhone: "۰۲۱-۹۱۰۰۱۲۳۴",
      city: "تبریز",
      licenseNo: "",
    });
    assert.equal(updated.status, 200, updated.text);
    assert.equal(updated.body.slug, "sepehr-travel");
    assert.equal(updated.body.description, "فروش بلیط داخلی و خارجی");
    assert.equal(updated.body.supportPhone, "021-91001234");
    assert.equal(updated.body.licenseNo, null);

    const pub = await new TestClient(server.url).get<Profile>("/api/agencies/sepehr-travel");
    assert.equal(pub.status, 200);
    assert.equal(pub.body.name, "پرواز سپهر");
    assert.equal(pub.body.verified, false);
    assert.deepEqual(pub.body.rating, { average: null, count: 0, histogram: [0, 0, 0, 0, 0] });
    assert.equal(
      (await new TestClient(server.url).get(`/api/agencies/${slug}`)).status,
      404,
      "the old address is gone",
    );
  });

  test("addresses must be well formed and free", async () => {
    const first = await agency();
    await first.client.put("/api/dashboard/profile", { slug: "taken-name" });
    const second = await agency();
    const cases: [unknown, number, string][] = [
      [{ slug: "taken-name" }, 409, "SLUG_TAKEN"],
      [{ slug: "admin" }, 409, "SLUG_TAKEN"],
      [{ slug: "-bad-" }, 400, "INVALID_REQUEST"],
      [{ slug: "ab" }, 400, "INVALID_REQUEST"],
      [{ slug: "fine-name", website: "javascript:alert(1)" }, 400, "INVALID_REQUEST"],
      [{ slug: "fine-name", supportPhone: "call me" }, 400, "INVALID_REQUEST"],
    ];
    for (const [body, status, error] of cases) {
      const res = await second.client.put("/api/dashboard/profile", body);
      assert.equal(res.status, status, JSON.stringify(body));
      assert.equal(res.body.error, error);
    }
  });

  test("only verified travellers review, once each, and can edit or delete", async () => {
    const { slug } = await agency();
    const anon = new TestClient(server.url);
    assert.equal((await anon.put(`/api/agencies/${slug}/reviews/mine`, { rating: 5 })).status, 401);

    const guest = new TestClient(server.url);
    await guest.post("/api/auth/guest");
    assert.equal((await guest.put(`/api/agencies/${slug}/reviews/mine`, { rating: 5 })).body.error, "GUEST_ACCOUNT");

    const unverified = await traveller({ verified: false });
    const refused = await unverified.client.put(`/api/agencies/${slug}/reviews/mine`, { rating: 5 });
    assert.equal(refused.status, 403);
    assert.equal(refused.body.error, "REVIEW_NEEDS_VERIFIED_ACCOUNT");

    const rival = await agency();
    assert.equal(
      (await rival.client.put(`/api/agencies/${slug}/reviews/mine`, { rating: 1 })).body.error,
      "AGENCIES_CANNOT_REVIEW",
    );

    const { client } = await traveller({ name: "سارا کاظمی" });
    assert.equal((await client.put(`/api/agencies/${slug}/reviews/mine`, { rating: 6 })).status, 400);
    assert.equal(
      (await client.put(`/api/agencies/${slug}/reviews/mine`, { rating: 4, body: "x".repeat(1001) })).status,
      400,
    );

    const first = await client.put<Review>(`/api/agencies/${slug}/reviews/mine`, { rating: 4, body: "  خوب بود  " });
    assert.equal(first.status, 200);
    assert.equal(first.body.body, "خوب بود");
    assert.equal(first.body.author, "سارا ک.", "names are shortened");
    const edited = await client.put<Review>(`/api/agencies/${slug}/reviews/mine`, { rating: 2, body: "بعداً بد شد" });
    assert.equal(edited.body.id, first.body.id, "one review per traveller: editing, not adding");

    const list = await client.get<{ items: Review[]; mine: Review }>(`/api/agencies/${slug}/reviews`);
    assert.equal(list.body.items.length, 1);
    assert.equal(list.body.items[0].mine, true);
    assert.equal(list.body.mine.rating, 2);
    assert.equal((await anon.get<{ items: Review[] }>(`/api/agencies/${slug}/reviews`)).body.items[0].mine, false);

    const profile = await anon.get<Profile>(`/api/agencies/${slug}`);
    assert.deepEqual(profile.body.rating, { average: 2, count: 1, histogram: [0, 1, 0, 0, 0] });

    assert.equal((await client.delete(`/api/agencies/${slug}/reviews/mine`)).status, 204);
    assert.equal((await client.delete(`/api/agencies/${slug}/reviews/mine`)).status, 404);
  });

  test("a hidden review leaves the public page and the rating, but not its author's view", async () => {
    const { slug } = await agency();
    const { client } = await traveller();
    const { body: review } = await client.put<Review>(`/api/agencies/${slug}/reviews/mine`, { rating: 1, body: "..." });
    await AppDataSource.query(`UPDATE agency_reviews SET status = 'hidden' WHERE id = $1`, [review.id]);

    const anon = new TestClient(server.url);
    assert.deepEqual((await anon.get<{ items: Review[] }>(`/api/agencies/${slug}/reviews`)).body.items, []);
    assert.equal((await anon.get<Profile>(`/api/agencies/${slug}`)).body.rating.count, 0);
    const mine = (await client.get<{ mine: Review }>(`/api/agencies/${slug}/reviews`)).body.mine;
    assert.equal(mine.hidden, true);

    await client.put(`/api/agencies/${slug}/reviews/mine`, { rating: 5, body: "edited" });
    assert.equal((await anon.get<Profile>(`/api/agencies/${slug}`)).body.rating.count, 0, "editing doesn't unhide");
  });

  test("agencies see all their reviews and reply publicly", async () => {
    const owner = await agency();
    const other = await agency();
    const { client } = await traveller();
    const { body: review } = await client.put<Review>(`/api/agencies/${owner.slug}/reviews/mine`, { rating: 3 });

    const inbox = await owner.client.get<Review[]>("/api/dashboard/reviews");
    assert.equal(inbox.body.length, 1);
    assert.equal(inbox.body[0].hidden, false);

    assert.equal(
      (await owner.client.put(`/api/dashboard/reviews/${review.id}/reply`, { reply: "ممنون از نظرتان" })).status,
      200,
    );
    const pub = await new TestClient(server.url).get<{ items: Review[] }>(`/api/agencies/${owner.slug}/reviews`);
    assert.equal(pub.body.items[0].reply, "ممنون از نظرتان");

    assert.equal((await other.client.put(`/api/dashboard/reviews/${review.id}/reply`, { reply: "!" })).status, 404);
    await owner.client.put(`/api/dashboard/reviews/${review.id}/reply`, { reply: "" });
    const cleared = await new TestClient(server.url).get<{ items: Review[] }>(`/api/agencies/${owner.slug}/reviews`);
    assert.equal(cleared.body.items[0].reply, null);
  });

  test("search offers carry the agency's address, verification and rating", async () => {
    const { account, slug } = await agency();
    await createListing(account.id, { flightNo: "W5-8801", originCode: "THR", destinationCode: "AZD" });
    const { client } = await traveller();
    await client.put(`/api/agencies/${slug}/reviews/mine`, { rating: 5 });
    await AppDataSource.query(`UPDATE agency_profiles SET verified_at = now() WHERE account_id = $1`, [account.id]);

    const res = await new TestClient(server.url).get<{ offers: Record<string, unknown>[] }[]>(
      "/api/search?originCode=THR&destinationCode=AZD",
    );
    const [offer] = res.body[0].offers;
    assert.equal(offer.agencySlug, slug);
    assert.deepEqual(offer.agencyRating, { average: 5, count: 1 });
    assert.equal(offer.agencyVerified, true);
  });

  test("the directory lists agencies with something to show, credibly best first", async () => {
    await AppDataSource.query(`DELETE FROM flight_listings`);
    const a = await agency("پرامتیاز");
    const b = await agency("تک‌امتیاز");
    const c = await agency("بی‌پرواز");
    await createListing(a.account.id, { flightNo: "A-1" });
    await createListing(b.account.id, { flightNo: "B-1" });
    // a: many good reviews; b: one perfect review. c: nothing listed, nothing reviewed.
    const reviewers = await Promise.all(Array.from({ length: 6 }, (_, i) => traveller({ name: `مسافر ${i}` })));
    for (const r of reviewers) await r.client.put(`/api/agencies/${a.slug}/reviews/mine`, { rating: 5 });
    await reviewers[0].client.put(`/api/agencies/${a.slug}/reviews/mine`, { rating: 4 });
    await reviewers[1].client.put(`/api/agencies/${b.slug}/reviews/mine`, { rating: 5 });

    const list = await new TestClient(server.url).get<{ slug: string; rating: { average: number; count: number } }[]>(
      "/api/agencies",
    );
    const slugs = list.body.map((x) => x.slug);
    assert.ok(slugs.indexOf(a.slug) < slugs.indexOf(b.slug), "6 reviews at 4.8 beat 1 review at 5");
    assert.equal(slugs.includes(c.slug), false);
  });

  test("an admin making someone an agency gives them a profile", async () => {
    const admin = await createAccount({ role: "admin" });
    const target = await createAccount();
    const client = new TestClient(server.url);
    await signIn(client, admin.email);
    await client.patch(`/api/admin/users/${target.id}/role`, { accountRole: "agency" });
    const [row] = (await AppDataSource.query(`SELECT slug FROM agency_profiles WHERE account_id = $1`, [
      target.id,
    ])) as {
      slug: string;
    }[];
    assert.match(row.slug, /^agency-/);
  });
});
