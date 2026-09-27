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
import { AppDataSource, accounts, priceAlerts } from "../database/dataSource";
import { addDaysToDateKey, tehranTodayKey, tehranWallClock } from "../domain/time";
import { drainBackgroundTasks } from "../lib/background";
import { mailOutbox } from "../notify/mailer";
import { evaluatePriceAlerts } from "../services/priceAlerts";
import { unsubscribeSignature } from "../services/alertLinks";

interface AlertBody {
  id: string;
  baselinePrice: number | null;
  lastPrice: number | null;
  targetPrice: number | null;
  lastNotifiedPrice: number | null;
  notifyEmail: boolean;
  isActive: boolean;
}

interface Inbox {
  items: { id: string; title: string; body: string; link: string; read: boolean; data: Record<string, unknown> }[];
  unreadCount: number;
}

describe("price alerts", { skip }, () => {
  let server: TestServer;
  let agencyId: string;

  before(async () => {
    await resetDatabase();
    server = await startServer();
    agencyId = (await createAccount({ role: "agency" })).id;
  });

  after(async () => {
    await server?.close();
    await closeDatabase();
  });

  beforeEach(async () => {
    mailOutbox.length = 0;
    await AppDataSource.query(`DELETE FROM flight_listings`);
  });

  /** A signed-in traveller; verified email unless told otherwise. */
  async function traveller(verified = true) {
    const account = await createAccount();
    if (verified) await accounts().update(account.id, { emailVerifiedAt: new Date() });
    const client = new TestClient(server.url);
    await signIn(client, account.email);
    return { account, client };
  }

  const fare = (priceToman: number, overrides: Parameters<typeof createListing>[1] = {}) =>
    createListing(agencyId, { priceToman, ...overrides });

  test("an alert starts from today's lowest fare and needs a real drop to fire", async () => {
    const { account, client } = await traveller();
    await fare(2_450_000);
    const created = await client.post<AlertBody>("/api/alerts", { originCode: "THR", destinationCode: "MHD" });
    assert.equal(created.status, 201);
    assert.equal(created.body.baselinePrice, 2_450_000);
    assert.equal(created.body.lastPrice, 2_450_000);

    assert.equal(await evaluatePriceAlerts(), 0, "nothing changed");
    await fare(2_400_000, { flightNo: "W5-102" }); // 2% cheaper: not enough
    assert.equal(await evaluatePriceAlerts(), 0);

    await fare(2_300_000, { flightNo: "W5-103", departAt: hoursFromNow(72) }); // 6% cheaper
    assert.equal(await evaluatePriceAlerts(), 1);
    await drainBackgroundTasks();

    const inbox = await client.get<Inbox>("/api/notifications");
    assert.equal(inbox.body.unreadCount, 1);
    const [n] = inbox.body.items;
    assert.match(n.title, /^تهران به مشهد: ارزان‌تر شد$/);
    assert.ok(n.body.includes("۲٬۳۰۰٬۰۰۰ تومان") && n.body.includes("۲٬۴۵۰٬۰۰۰ تومان"), n.body);
    const dateKey = tehranTodayKey(hoursFromNow(72).getTime());
    assert.equal(n.link, `/search?from=THR&to=MHD&date=${dateKey}`);

    const mail = mailOutbox.find((m) => m.to === account.email);
    assert.ok(mail, "a verified address gets the email too");
    assert.match(mail.headers?.["List-Unsubscribe"] ?? "", /^<http.+\/api\/alerts\/[0-9a-f-]+\/unsubscribe\?sig=.+>$/);
    assert.equal(mail.headers?.["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");

    assert.equal(await evaluatePriceAlerts(), 0, "the same fare is not news twice");
    await fare(2_280_000, { flightNo: "W5-104" }); // under 2% below the last notice
    assert.equal(await evaluatePriceAlerts(), 0);
    await fare(2_200_000, { flightNo: "W5-105" });
    assert.equal(await evaluatePriceAlerts(), 1);
  });

  test("a target fires once the fare reaches it", async () => {
    const { client } = await traveller();
    await fare(2_100_000, { originCode: "THR", destinationCode: "KIH", flightNo: "EP-1" });
    await client.post("/api/alerts", { originCode: "THR", destinationCode: "KIH", targetPrice: 2_000_000 });
    assert.equal(await evaluatePriceAlerts(), 0);
    await fare(1_990_000, { originCode: "THR", destinationCode: "KIH", flightNo: "EP-2" });
    assert.equal(await evaluatePriceAlerts(), 1);
    const [n] = (await client.get<Inbox>("/api/notifications")).body.items;
    assert.match(n.title, /به قیمت دلخواه شما رسید/);
    assert.ok(n.body.includes("۲٬۰۰۰٬۰۰۰ تومان"), "names the target");
  });

  test("watches only its Iran calendar days and cabin", async () => {
    const { client } = await traveller();
    const day = addDaysToDateKey(tehranTodayKey(), 3);
    const inWindow = (hour: number, minute = 0) => tehranWallClock(3, hour, minute);
    // 00:30 Tehran on the day is still the previous day in UTC: it belongs to the window.
    await fare(2_000_000, { originCode: "IFN", destinationCode: "SYZ", flightNo: "IR-1", departAt: inWindow(0, 30) });
    const alert = await client.post<AlertBody>("/api/alerts", {
      originCode: "IFN",
      destinationCode: "SYZ",
      dateFrom: day,
      dateTo: day,
      cabin: "economy",
    });
    assert.equal(alert.body.baselinePrice, 2_000_000);

    // Cheaper, but the next day, or in business: not what the alert watches.
    await fare(1_000_000, {
      originCode: "IFN",
      destinationCode: "SYZ",
      flightNo: "IR-2",
      departAt: tehranWallClock(4, 0, 10),
    });
    await fare(900_000, {
      originCode: "IFN",
      destinationCode: "SYZ",
      flightNo: "IR-3",
      departAt: inWindow(12),
      cabin: "business",
    });
    // Hidden by the agency: never counts.
    await fare(800_000, {
      originCode: "IFN",
      destinationCode: "SYZ",
      flightNo: "IR-4",
      departAt: inWindow(9),
      isActive: false,
    });
    assert.equal(await evaluatePriceAlerts(), 0);

    await fare(1_800_000, { originCode: "IFN", destinationCode: "SYZ", flightNo: "IR-5", departAt: inWindow(23, 50) });
    assert.equal(await evaluatePriceAlerts(), 1);
  });

  test("email goes only to verified addresses that asked for it", async () => {
    const unverified = await traveller(false);
    const optedOut = await traveller();
    await fare(3_000_000, { originCode: "TBZ", destinationCode: "THR", flightNo: "IR-9" });
    await unverified.client.post("/api/alerts", { originCode: "TBZ", destinationCode: "THR" });
    await optedOut.client.post("/api/alerts", { originCode: "TBZ", destinationCode: "THR", notifyEmail: false });
    await fare(2_500_000, { originCode: "TBZ", destinationCode: "THR", flightNo: "IR-10" });

    assert.equal(await evaluatePriceAlerts(), 2);
    await drainBackgroundTasks();
    assert.equal(mailOutbox.length, 0);
    assert.equal((await unverified.client.get<Inbox>("/api/notifications")).body.unreadCount, 1, "still in the app");
  });

  test("alerts whose dates have passed switch themselves off", async () => {
    const { account } = await traveller();
    const yesterday = addDaysToDateKey(tehranTodayKey(), -1);
    const repo = priceAlerts();
    const stale = await repo.save(
      repo.create({
        accountId: account.id,
        originCode: "THR",
        destinationCode: "MHD",
        dateFrom: yesterday,
        dateTo: yesterday,
      }),
    );
    await evaluatePriceAlerts();
    assert.equal((await repo.findOneByOrFail({ id: stale.id })).isActive, false);
  });

  test("validates what an alert may watch", async () => {
    const { client } = await traveller();
    const today = tehranTodayKey();
    const cases: [Record<string, unknown>, string][] = [
      [{ originCode: "THR", destinationCode: "THR" }, "destinationCode: SAME_ORIGIN_DESTINATION"],
      [{ originCode: "THR", destinationCode: "MHD", dateFrom: today }, "dateTo: INCOMPLETE_DATE_RANGE"],
      [
        { originCode: "THR", destinationCode: "MHD", dateFrom: today, dateTo: addDaysToDateKey(today, 31) },
        "dateTo: DATE_RANGE_TOO_LONG",
      ],
      [
        {
          originCode: "THR",
          destinationCode: "MHD",
          dateFrom: addDaysToDateKey(today, -3),
          dateTo: addDaysToDateKey(today, -2),
        },
        "dateTo: DATE_IN_PAST",
      ],
      [{ originCode: "THR", destinationCode: "MHD", targetPrice: -5 }, "targetPrice: Number must be greater than 0"],
    ];
    for (const [body, detail] of cases) {
      const res = await client.post<{ details: string[] }>("/api/alerts", body);
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.ok(res.body.details.includes(detail), `${JSON.stringify(res.body.details)} lacks ${detail}`);
    }
    assert.equal((await new TestClient(server.url).post("/api/alerts", {})).status, 401);
  });

  test("refuses duplicates and more than 20 active alerts", async () => {
    const { account, client } = await traveller();
    assert.equal((await client.post("/api/alerts", { originCode: "THR", destinationCode: "SYZ" })).status, 201);
    const again = await client.post("/api/alerts", { originCode: "THR", destinationCode: "SYZ" });
    assert.equal(again.status, 409);
    assert.equal(again.body.error, "ALERT_EXISTS");

    const repo = priceAlerts();
    await repo.save(
      Array.from({ length: 19 }, (_, i) =>
        repo.create({
          accountId: account.id,
          originCode: "THR",
          destinationCode: "MHD",
          dateFrom: addDaysToDateKey(tehranTodayKey(), i),
          dateTo: addDaysToDateKey(tehranTodayKey(), i),
        }),
      ),
    );
    const full = await client.post("/api/alerts", { originCode: "THR", destinationCode: "BND" });
    assert.equal(full.status, 409);
    assert.equal(full.body.error, "ALERT_LIMIT_REACHED");
  });

  test("pausing, retargeting and deleting; other people's alerts are invisible", async () => {
    const owner = await traveller();
    const stranger = await traveller();
    await fare(2_000_000, { originCode: "THR", destinationCode: "AZD", flightNo: "QB-1" });
    const { body: alert } = await owner.client.post<AlertBody>("/api/alerts", {
      originCode: "THR",
      destinationCode: "AZD",
      targetPrice: 2_100_000,
    });
    assert.equal(await evaluatePriceAlerts(), 1);

    const paused = await owner.client.patch<AlertBody>(`/api/alerts/${alert.id}`, { isActive: false });
    assert.equal(paused.body.isActive, false);
    await fare(1_500_000, { originCode: "THR", destinationCode: "AZD", flightNo: "QB-2" });
    assert.equal(await evaluatePriceAlerts(), 0, "paused alerts stay quiet");

    const retargeted = await owner.client.patch<AlertBody>(`/api/alerts/${alert.id}`, {
      isActive: true,
      targetPrice: 1_600_000,
    });
    assert.equal(retargeted.body.targetPrice, 1_600_000);
    assert.equal(retargeted.body.lastNotifiedPrice, null, "a new target starts over");
    assert.equal(await evaluatePriceAlerts(), 1);

    assert.equal((await stranger.client.patch(`/api/alerts/${alert.id}`, { isActive: false })).status, 404);
    assert.equal((await stranger.client.delete(`/api/alerts/${alert.id}`)).status, 404);
    assert.deepEqual((await stranger.client.get<unknown[]>("/api/alerts")).body, []);

    assert.equal((await owner.client.delete(`/api/alerts/${alert.id}`)).status, 204);
    assert.equal((await owner.client.delete(`/api/alerts/${alert.id}`)).status, 404);
  });

  test("the inbox pages, counts and marks read, per account", async () => {
    const { client } = await traveller();
    const other = await traveller();
    for (let i = 0; i < 3; i++) {
      await fare(3_000_000 - i * 200_000, { originCode: "THR", destinationCode: "BND", flightNo: `W5-${300 + i}` });
      if (i === 0) await client.post("/api/alerts", { originCode: "THR", destinationCode: "BND" });
      else await evaluatePriceAlerts();
    }
    const inbox = (await client.get<Inbox>("/api/notifications?limit=1")).body;
    assert.equal(inbox.items.length, 1);
    assert.equal(inbox.unreadCount, 2);
    assert.deepEqual((await client.get<{ count: number }>("/api/notifications/unread-count")).body, { count: 2 });

    const newest = inbox.items[0];
    const older = await client.get<Inbox>(`/api/notifications?before=${Date.now() + 1000}&limit=10`);
    assert.equal(older.body.items[0].id, newest.id, "newest first");

    // Someone else's ids are ignored, not marked.
    const foreign = await other.client.post<{ unreadCount: number }>("/api/notifications/read", { ids: [newest.id] });
    assert.equal(foreign.body.unreadCount, 0);
    assert.equal((await client.get<{ count: number }>("/api/notifications/unread-count")).body.count, 2);

    assert.equal(
      (await client.post<{ unreadCount: number }>("/api/notifications/read", { ids: [newest.id] })).body.unreadCount,
      1,
    );
    assert.equal((await client.post<{ unreadCount: number }>("/api/notifications/read")).body.unreadCount, 0);
  });

  test("one-click unsubscribe works without a session, only with the alert's signature", async () => {
    const { client } = await traveller();
    const { body: alert } = await client.post<AlertBody>("/api/alerts", { originCode: "MHD", destinationCode: "THR" });
    const anon = new TestClient(server.url);
    const forged = await anon.post(`/api/alerts/${alert.id}/unsubscribe?sig=${"A".repeat(43)}`);
    assert.equal(forged.status, 403);

    const sig = unsubscribeSignature(alert.id);
    const ok = await anon.post(`/api/alerts/${alert.id}/unsubscribe?sig=${sig}`, "List-Unsubscribe=One-Click", {
      "Content-Type": "application/x-www-form-urlencoded",
    });
    assert.equal(ok.status, 200);
    assert.equal((await priceAlerts().findOneByOrFail({ id: alert.id })).notifyEmail, false);

    const browser = await anon.get(`/api/alerts/${alert.id}/unsubscribe?sig=${sig}`);
    assert.equal(browser.status, 303, "a browser is sent to the confirmation page");
    assert.match(browser.headers.get("location") ?? "", /\/alerts\/unsubscribe\?alert=[0-9a-f-]+&sig=/);
  });
});
