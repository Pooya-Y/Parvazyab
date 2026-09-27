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
import { AppDataSource } from "../database/dataSource";
import { drainBackgroundTasks } from "../lib/background";
import { pushFailures, pushOutbox } from "../notify/push";
import { evaluatePriceAlerts } from "../services/priceAlerts";
import { notify } from "../services/notifications";

const KEYS = {
  p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM",
  auth: "tBHItJI5svbpez7KI4CCXg",
};
let n = 0;
const endpoint = () => `https://fcm.googleapis.com/fcm/send/device-${++n}`;

async function subscriptions(accountId?: string) {
  return (await AppDataSource.query(
    `SELECT endpoint, account_id AS "accountId", failures FROM push_subscriptions ${accountId ? "WHERE account_id = $1" : ""} ORDER BY created_at`,
    accountId ? [accountId] : [],
  )) as { endpoint: string; accountId: string; failures: number }[];
}

describe("web push", { skip }, () => {
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
    pushOutbox.length = 0;
    pushFailures.clear();
    await AppDataSource.query(`DELETE FROM push_subscriptions`);
  });

  async function user() {
    const account = await createAccount();
    const client = new TestClient(server.url);
    await signIn(client, account.email);
    return { account, client };
  }

  test("publishes the key browsers subscribe with", async () => {
    const res = await new TestClient(server.url).get<{ publicKey: string }>("/api/push/public-key");
    assert.equal(res.body.publicKey, "BTestPublicKeyForIntegrationTestsOnly");
  });

  test("only accepts endpoints of real push services", async () => {
    const { client } = await user();
    assert.equal(
      (await new TestClient(server.url).post("/api/push/subscriptions", { endpoint: endpoint(), keys: KEYS })).status,
      401,
    );
    for (const evil of [
      "http://fcm.googleapis.com/fcm/send/x",
      "https://169.254.169.254/latest/meta-data",
      "https://evil.example/push",
      "https://fcm.googleapis.com.evil.example/x",
      "https://fcm.googleapis.com:8443/x",
      "https://user@fcm.googleapis.com/x",
      "https://localhost/push",
    ]) {
      const res = await client.post("/api/push/subscriptions", { endpoint: evil, keys: KEYS });
      assert.equal(res.status, 400, evil);
      assert.equal(res.body.error, "PUSH_ENDPOINT_NOT_ALLOWED", evil);
    }
    const badKeys = await client.post("/api/push/subscriptions", {
      endpoint: endpoint(),
      keys: { p256dh: "not base64!", auth: "x" },
    });
    assert.equal(badKeys.status, 400);

    for (const ok of [
      endpoint(),
      "https://updates.push.services.mozilla.com/wpush/v2/abc",
      "https://web.push.apple.com/QGuQyavXutnMH",
      "https://wns2-par02p.notify.windows.com/w/?token=abc",
    ]) {
      assert.equal((await client.post("/api/push/subscriptions", { endpoint: ok, keys: KEYS })).status, 201, ok);
    }
  });

  test("a browser follows whoever signs in on it, and an account keeps at most ten", async () => {
    const first = await user();
    const second = await user();
    const shared = endpoint();
    await first.client.post("/api/push/subscriptions", { endpoint: shared, keys: KEYS });
    await second.client.post("/api/push/subscriptions", { endpoint: shared, keys: KEYS });
    assert.deepEqual(
      (await subscriptions()).map((s) => s.accountId),
      [second.account.id],
    );

    for (let i = 0; i < 11; i++)
      await first.client.post("/api/push/subscriptions", { endpoint: endpoint(), keys: KEYS });
    assert.equal((await subscriptions(first.account.id)).length, 10);

    // Unsubscribing only touches one's own.
    const res = await first.client.request("DELETE", "/api/push/subscriptions", { endpoint: shared });
    assert.equal(res.status, 204);
    assert.equal((await subscriptions(second.account.id)).length, 1);
  });

  test("price drops are pushed, tagged per alert so newer ones replace older", async () => {
    const agency = await createAccount({ role: "agency" });
    const { account, client } = await user();
    const device = endpoint();
    await client.post("/api/push/subscriptions", { endpoint: device, keys: KEYS });
    await createListing(agency.id, { priceToman: 3_000_000 });
    const { body: alert } = await client.post<{ id: string }>("/api/alerts", {
      originCode: "THR",
      destinationCode: "MHD",
    });
    await createListing(agency.id, { priceToman: 2_500_000, flightNo: "W5-2" });

    assert.equal(await evaluatePriceAlerts(), 1);
    await drainBackgroundTasks();
    assert.equal(pushOutbox.length, 1);
    assert.equal(pushOutbox[0].endpoint, device);
    assert.match(pushOutbox[0].message.title, /ارزان‌تر شد/);
    assert.equal(pushOutbox[0].message.tag, `alert-${alert.id}`);
    assert.match(pushOutbox[0].message.link ?? "", /^\/search\?from=THR&to=MHD&date=/);
    const [row] = (await AppDataSource.query(`SELECT last_success_at FROM push_subscriptions WHERE account_id = $1`, [
      account.id,
    ])) as { last_success_at: Date | null }[];
    assert.ok(row.last_success_at);
  });

  test("subscriptions that are gone, or keep failing, are dropped", async () => {
    const { account, client } = await user();
    const gone = endpoint();
    const flaky = endpoint();
    await client.post("/api/push/subscriptions", { endpoint: gone, keys: KEYS });
    await client.post("/api/push/subscriptions", { endpoint: flaky, keys: KEYS });
    pushFailures.set(gone, 410);
    pushFailures.set(flaky, 503);

    const recipient = { id: account.id, name: account.name, email: account.email, emailVerifiedAt: null };
    for (let i = 1; i <= 5; i++) {
      await notify(recipient, { kind: "moderation", title: `پیام ${i}`, body: "", link: "/dashboard" });
      await drainBackgroundTasks();
      const left = await subscriptions(account.id);
      assert.equal(
        left.some((s) => s.endpoint === gone),
        false,
        "a 410 removes it at once",
      );
      assert.equal(
        left.some((s) => s.endpoint === flaky),
        i < 5,
        `after ${i} failures`,
      );
    }
  });
});
