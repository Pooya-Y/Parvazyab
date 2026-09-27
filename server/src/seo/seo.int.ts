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
import { AppDataSource } from "../database/dataSource";
import { PAGE_CSP, siteUrl } from "./layout";

describe("pages for search engines", { skip }, () => {
  let server: TestServer;
  let visitor: TestClient;

  async function agency(name: string, slug: string) {
    const account = await createAccount({ role: "agency", agencyName: name });
    await AppDataSource.query(`INSERT INTO agency_profiles (account_id, slug) VALUES ($1, $2)`, [account.id, slug]);
    return account;
  }

  before(async () => {
    await resetDatabase();
    server = await startServer();
    visitor = new TestClient(server.url);

    const sky = await agency("آسمان بازار", "sky-test");
    await createListing(sky.id, { priceToman: 2_450_000, departAt: hoursFromNow(30) });
    await createListing(sky.id, { priceToman: 2_150_000, flightNo: "W5-103", departAt: hoursFromNow(54) });
    await createListing(sky.id, {
      destinationCode: "KIH",
      destinationCity: "کیش",
      priceToman: 3_100_000,
      departAt: hoursFromNow(40),
    });

    // Cheaper, but not for travellers' eyes: a suspended listing and a suspended agency's listing.
    const hidden = await createListing(sky.id, { priceToman: 900_000, flightNo: "W5-900", departAt: hoursFromNow(60) });
    await AppDataSource.query(`UPDATE flight_listings SET suspended_at = now() WHERE id = $1`, [hidden.id]);
    const banned = await agency(`<script>alert("x")</script> آژانس`, "banned-test");
    await createListing(banned.id, { priceToman: 800_000, flightNo: "W5-800", departAt: hoursFromNow(70) });
    await AppDataSource.query(`UPDATE accounts SET suspended_at = now() WHERE id = $1`, [banned.id]);
  });

  after(async () => {
    await server?.close();
    await closeDatabase();
  });

  test("a route guide shows what travellers can buy, as a locked-down HTML page", async () => {
    const res = await visitor.get("/flights/thr-mhd");
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /^text\/html/);
    assert.equal(res.headers.get("content-security-policy"), PAGE_CSP);
    assert.match(res.headers.get("cache-control") ?? "", /public, max-age=300/);

    assert.ok(res.text.includes("۲٬۱۵۰٬۰۰۰ تومان"), "the cheapest visible fare");
    assert.ok(!res.text.includes("۹۰۰٬۰۰۰"), "not the suspended listing");
    assert.ok(!res.text.includes("۸۰۰٬۰۰۰"), "not the suspended agency's fare");
    assert.ok(!res.text.includes("banned-test") && !res.text.includes("alert"), "nor the suspended agency");
    assert.ok(res.text.includes(`<a href="/agencies/sky-test">آسمان بازار</a>`));
    assert.ok(res.text.includes(`<link rel="canonical" href="${siteUrl("/flights/thr-mhd")}"`));
    // The other route from Tehran is linked as a neighbour.
    assert.ok(res.text.includes(`href="/flights/thr-kih"`));
  });

  test("every route has one address", async () => {
    for (const path of ["/flights/THR-MHD", "/flights/Thr-Mhd", "/flights/thr-mhd/"]) {
      const res = await visitor.get(path);
      assert.equal(res.status, 301, path);
      assert.equal(res.headers.get("location"), "/flights/thr-mhd", path);
    }
  });

  test("unknown routes are 404 pages; real routes without flights aren't indexed", async () => {
    for (const path of ["/flights/thr-xyz", "/flights/thr-thr", "/flights/tehran-mashhad", "/flights/thr-mhd-ika"]) {
      const res = await visitor.get(path);
      assert.equal(res.status, 404, path);
      assert.match(res.text, /noindex/, path);
    }
    const empty = await visitor.get("/flights/thr-syz");
    assert.equal(empty.status, 200);
    assert.match(empty.text, /<meta name="robots" content="noindex, follow"/);
  });

  test("the directory lists each route that has flights", async () => {
    const res = await visitor.get("/flights");
    assert.equal(res.status, 200);
    assert.ok(res.text.includes(`href="/flights/thr-mhd"`));
    assert.ok(res.text.includes(`href="/flights/thr-kih"`));
    assert.ok(!res.text.includes(`href="/flights/thr-syz"`));
  });

  test("the sitemap and robots.txt point crawlers at the public pages only", async () => {
    const sitemap = await visitor.get("/sitemap.xml");
    assert.equal(sitemap.status, 200);
    assert.match(sitemap.headers.get("content-type") ?? "", /^application\/xml/);
    assert.ok(sitemap.text.startsWith(`<?xml version="1.0" encoding="UTF-8"?>`));
    for (const path of ["/flights", "/flights/thr-mhd", "/flights/thr-kih", "/agencies/sky-test"]) {
      assert.ok(sitemap.text.includes(`<loc>${siteUrl(path)}</loc>`), path);
    }
    assert.ok(!sitemap.text.includes("thr-syz"));
    assert.ok(!sitemap.text.includes("banned-test"), "suspended agencies aren't advertised");

    const robots = await visitor.get("/robots.txt");
    assert.equal(robots.status, 200);
    assert.match(robots.text, /^Disallow: \/api\/$/m);
    assert.match(robots.text, /^Disallow: \/dashboard$/m);
    assert.ok(robots.text.includes(`Sitemap: ${siteUrl("/sitemap.xml")}`));
  });
});
