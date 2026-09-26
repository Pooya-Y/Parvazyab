import { skip } from "../test/use-test-database";
import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PASSWORD,
  TestClient,
  closeDatabase,
  createAccount,
  resetDatabase,
  signIn,
  startServer,
  type TestServer,
} from "../test/harness";
import { AppDataSource, accounts, savedFlights } from "../database/dataSource";
import { drainBackgroundTasks } from "../lib/background";
import { mailOutbox } from "../notify/mailer";
import { smsOutbox } from "../notify/sms";

interface Challenge {
  challengeId: string;
  phone: string;
  expiresAt: number;
  resendAfter: number;
}

interface SignInBody {
  user: Record<string, unknown> & { id: string };
  created: boolean;
}

/** Each test gets its own client address, so per-IP limits from one test don't leak into the next. */
let ipCounter = 0;
const nextIp = () => `198.51.100.${++ipCounter}`;

let phoneCounter = 0;
/** A fresh valid number per call (0912 000 00NN). */
const nextPhone = () => `0912000${String(++phoneCounter).padStart(4, "0")}`;
const e164 = (national: string) => `+98${national.slice(1)}`;

async function lastCode(to: string): Promise<string> {
  await drainBackgroundTasks();
  const sms = smsOutbox.filter((s) => s.to === to).at(-1);
  assert.ok(sms, `no SMS to ${to}`);
  return sms.code;
}

/** Lets a test send another code to the same number without waiting out the cooldown. */
const forgetRecentCodes = (phone: string) =>
  AppDataSource.query(`UPDATE otp_challenges SET created_at = now() - interval '2 days' WHERE phone = $1`, [phone]);

describe("SMS sign-in", { skip }, () => {
  let server: TestServer;

  before(async () => {
    await resetDatabase();
    server = await startServer();
  });

  after(async () => {
    await server?.close();
    await closeDatabase();
  });

  beforeEach(() => {
    smsOutbox.length = 0;
    mailOutbox.length = 0;
  });

  const client = () => new TestClient(server.url, nextIp());

  async function requestCode(c: TestClient, phone: string) {
    const res = await c.post<Challenge>("/api/auth/otp/request", { phone });
    assert.equal(res.status, 201, res.text);
    return { challenge: res.body, code: await lastCode(e164(phone)) };
  }

  async function signInByCode(c: TestClient, phone: string) {
    const { challenge, code } = await requestCode(c, phone);
    return c.post<SignInBody>("/api/auth/otp/verify", { challengeId: challenge.challengeId, code });
  }

  test("a new number becomes an account; the same number signs back in to it", async () => {
    const phone = nextPhone();
    const c = client();
    const { challenge, code } = await requestCode(c, phone);
    assert.equal(challenge.phone, e164(phone));
    assert.equal(challenge.resendAfter, 60);
    const ttl = challenge.expiresAt - Date.now();
    assert.ok(ttl > 100_000 && ttl <= 120_000, `expires in ${ttl} ms`);
    assert.match(code, /^\d{6}$/);
    const sms = smsOutbox.at(-1)!;
    assert.ok(sms.text.includes(code));
    assert.ok(sms.text.endsWith(`@localhost #${code}`), "ends with the WebOTP origin-bound line");

    const first = await c.post<SignInBody>("/api/auth/otp/verify", { challengeId: challenge.challengeId, code });
    assert.equal(first.status, 201);
    assert.equal(first.body.created, true);
    assert.equal(first.body.user.phone, e164(phone));
    assert.equal(first.body.user.email, null);
    assert.equal(first.body.user.hasPassword, false);
    assert.equal(first.body.user.name, "مسافر");
    assert.equal(typeof first.body.user.phoneVerifiedAt, "string");
    assert.equal((await c.get<{ user: { id: string } }>("/api/auth/me")).body.user.id, first.body.user.id);

    await forgetRecentCodes(e164(phone));
    const other = client();
    const again = await signInByCode(other, phone);
    assert.equal(again.status, 200);
    assert.equal(again.body.created, false);
    assert.equal(again.body.user.id, first.body.user.id);
  });

  test("accepts numbers the way people type them", async () => {
    const res = await client().post<Challenge>("/api/auth/otp/request", { phone: "+98 912 000 9999" });
    assert.equal(res.status, 201);
    assert.equal(res.body.phone, "+989120009999");
    const bad = await client().post<{ error: string; details: string[] }>("/api/auth/otp/request", {
      phone: "021 1234 5678",
    });
    assert.equal(bad.status, 400);
    assert.deepEqual(bad.body.details, ["phone: INVALID_PHONE"]);
  });

  test("a code works once, and never after five wrong guesses", async () => {
    const phone = nextPhone();
    const c = client();
    const { challenge, code } = await requestCode(c, phone);
    const wrong = code === "000000" ? "111111" : "000000";

    for (let i = 1; i <= 4; i++) {
      const res = await c.post("/api/auth/otp/verify", { challengeId: challenge.challengeId, code: wrong });
      assert.equal(res.body.error, "OTP_INVALID", `guess ${i}`);
    }
    const fifth = await c.post("/api/auth/otp/verify", { challengeId: challenge.challengeId, code: wrong });
    assert.equal(fifth.body.error, "OTP_EXPIRED", "the fifth wrong guess ends the challenge");
    const right = await c.post("/api/auth/otp/verify", { challengeId: challenge.challengeId, code });
    assert.equal(right.status, 400);
    assert.equal(right.body.error, "OTP_EXPIRED");
    assert.equal(c.hasSession(), false);
  });

  test("codes expire, can't be reused, and a new code replaces the old one", async () => {
    const phone = nextPhone();
    const c = client();
    const first = await requestCode(c, phone);
    await forgetRecentCodes(e164(phone));
    const second = await requestCode(c, phone);

    const replaced = await c.post("/api/auth/otp/verify", {
      challengeId: first.challenge.challengeId,
      code: first.code,
    });
    assert.equal(replaced.body.error, "OTP_EXPIRED");

    const ok = await c.post("/api/auth/otp/verify", { challengeId: second.challenge.challengeId, code: second.code });
    assert.equal(ok.status, 201);
    const reused = await c.post("/api/auth/otp/verify", {
      challengeId: second.challenge.challengeId,
      code: second.code,
    });
    assert.equal(reused.body.error, "OTP_EXPIRED");

    await forgetRecentCodes(e164(phone));
    const third = await requestCode(c, phone);
    await AppDataSource.query(`UPDATE otp_challenges SET expires_at = now() - interval '1 second' WHERE id = $1`, [
      third.challenge.challengeId,
    ]);
    const expired = await c.post("/api/auth/otp/verify", {
      challengeId: third.challenge.challengeId,
      code: third.code,
    });
    assert.equal(expired.body.error, "OTP_EXPIRED");
  });

  test("a correct code used twice at once signs in exactly once", async () => {
    const phone = nextPhone();
    const { challenge, code } = await requestCode(client(), phone);
    const results = await Promise.all(
      [client(), client(), client()].map((c) =>
        c.post("/api/auth/otp/verify", { challengeId: challenge.challengeId, code }),
      ),
    );
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 400, 400]);
    assert.equal(await accounts().count({ where: { phone: e164(phone) } }), 1);
  });

  test("rations codes per number: one a minute, five an hour", async () => {
    const phone = nextPhone();
    await requestCode(client(), phone);
    const soon = await client().post("/api/auth/otp/request", { phone });
    assert.equal(soon.status, 429);
    assert.equal(soon.body.error, "OTP_TOO_SOON");
    const wait = Number(soon.headers.get("retry-after"));
    assert.ok(wait > 0 && wait <= 60, `Retry-After ${wait}`);

    // Four more within the hour, each past the one-minute gap.
    await AppDataSource.query(
      `INSERT INTO otp_challenges (id, phone, purpose, code_hash, expires_at, created_at)
       SELECT gen_random_uuid(), $1, 'login', repeat('0', 64), now(), now() - make_interval(mins => m)
         FROM generate_series(2, 5) AS m`,
      [e164(phone)],
    );
    await AppDataSource.query(
      `UPDATE otp_challenges SET created_at = now() - interval '10 minutes'
        WHERE phone = $1 AND created_at > now() - interval '1 minute'`,
      [e164(phone)],
    );
    const capped = await client().post("/api/auth/otp/request", { phone });
    assert.equal(capped.status, 429);
    assert.ok(Number(capped.headers.get("retry-after")) > 60, "waits for the hour window, not the minute");
  });

  test("limits how many numbers one client can text", async () => {
    const c = client();
    for (let i = 0; i < 6; i++) {
      assert.equal((await c.post("/api/auth/otp/request", { phone: nextPhone() })).status, 201);
    }
    const blocked = await c.post("/api/auth/otp/request", { phone: nextPhone() });
    assert.equal(blocked.status, 429);
    assert.equal(blocked.body.error, "RATE_LIMITED");
  });

  test("a guest who signs in by SMS keeps their saved flights", async () => {
    const c = client();
    const guest = (await c.post<{ user: { id: string } }>("/api/auth/guest")).body.user;
    await AppDataSource.query(
      `INSERT INTO saved_flights (account_id, flight_key, airline, flight_no, origin_code, origin_city,
         destination_code, destination_city, depart_at, arrive_at, duration_min, stops, cabin, price_toman, agency_name)
       VALUES ($1, 'kept', 'ماهان', 'W5-1', 'THR', 'تهران', 'MHD', 'مشهد', now() + interval '1 day',
         now() + interval '26 hours', 90, 0, 'economy', 1000000, 'آژانس')`,
      [guest.id],
    );
    const res = await signInByCode(c, nextPhone());
    assert.equal(res.status, 201);
    assert.equal(res.body.user.id, guest.id, "the guest became the phone account");
    assert.equal(res.body.user.email, null, "the placeholder guest address is gone");
    assert.equal(await savedFlights().count({ where: { accountId: guest.id } }), 1);
  });

  describe("managing the number from account settings", () => {
    test("links a verified number to an email account", async () => {
      const account = await createAccount({ email: "linker@example.com" });
      const c = client();
      await signIn(c, account.email);
      const phone = nextPhone();

      const start = await c.post<Challenge>("/api/account/phone/verification", { phone });
      assert.equal(start.status, 201);
      const code = await lastCode(e164(phone));
      const wrong = await c.put("/api/account/phone", {
        challengeId: start.body.challengeId,
        code: code === "999999" ? "999998" : "999999",
      });
      assert.equal(wrong.body.error, "OTP_INVALID");

      const linked = await c.put<{ user: Record<string, unknown> }>("/api/account/phone", {
        challengeId: start.body.challengeId,
        code,
      });
      assert.equal(linked.status, 200);
      assert.equal(linked.body.user.phone, e164(phone));

      // Either way in now reaches the same account. (The one-a-minute rule spans link and sign-in codes.)
      await forgetRecentCodes(e164(phone));
      const bySms = await signInByCode(client(), phone);
      assert.equal(bySms.body.user.id, account.id);

      const [row] = (await AppDataSource.query(
        `SELECT details FROM audit_log WHERE target_id = $1 AND action = 'account.phone_linked'`,
        [account.id],
      )) as { details: { phone: string } }[];
      assert.equal(row.details.phone, phone);
    });

    test("refuses numbers that belong to someone else, and other people's challenges", async () => {
      const taken = nextPhone();
      await signInByCode(client(), taken);

      const owner = await createAccount({ email: "owner@example.com" });
      const c = client();
      await signIn(c, owner.email);
      const inUse = await c.post("/api/account/phone/verification", { phone: taken });
      assert.equal(inUse.status, 409);
      assert.equal(inUse.body.error, "PHONE_IN_USE");

      const phone = nextPhone();
      const start = await c.post<Challenge>("/api/account/phone/verification", { phone });
      const code = await lastCode(e164(phone));
      const intruder = await createAccount({ email: "intruder@example.com" });
      const other = client();
      await signIn(other, intruder.email);
      const stolen = await other.put("/api/account/phone", { challengeId: start.body.challengeId, code });
      assert.equal(stolen.body.error, "OTP_EXPIRED", "a link challenge only works for the account that started it");
      const asLogin = await other.post("/api/auth/otp/verify", { challengeId: start.body.challengeId, code });
      assert.equal(asLogin.body.error, "OTP_EXPIRED", "nor as a sign-in code");
    });

    test("removing the number needs another way to sign in", async () => {
      const phoneOnly = client();
      await signInByCode(phoneOnly, nextPhone());
      const refused = await phoneOnly.delete("/api/account/phone");
      assert.equal(refused.status, 400);
      assert.equal(refused.body.error, "LAST_SIGN_IN_METHOD");

      const account = await createAccount({ email: "unlink@example.com" });
      const c = client();
      await signIn(c, account.email);
      const phone = nextPhone();
      const start = await c.post<Challenge>("/api/account/phone/verification", { phone });
      await c.put("/api/account/phone", { challengeId: start.body.challengeId, code: await lastCode(e164(phone)) });
      const removed = await c.delete<{ user: Record<string, unknown> }>("/api/account/phone");
      assert.equal(removed.status, 200);
      assert.equal(removed.body.user.phone, null);
      assert.equal((await accounts().findOneByOrFail({ id: account.id })).phone, null);
    });

    test("an SMS account can add an email and password", async () => {
      const c = client();
      const phone = nextPhone();
      const created = await signInByCode(c, phone);

      const noPassword = await c.put("/api/account/password", { currentPassword: "x", newPassword: "N3w-passw0rd" });
      assert.equal(noPassword.body.error, "NO_PASSWORD");

      const taken = await createAccount({ email: "taken@example.com" });
      const duplicate = await c.post("/api/account/email", { email: taken.email, password: "N3w-passw0rd" });
      assert.equal(duplicate.status, 409);
      assert.equal(duplicate.body.error, "ACCOUNT_ALREADY_EXISTS");

      const added = await c.post<{ user: Record<string, unknown> }>("/api/account/email", {
        email: "Sms.User@Example.com",
        password: "N3w-passw0rd",
      });
      assert.equal(added.status, 200);
      assert.equal(added.body.user.email, "sms.user@example.com");
      assert.equal(added.body.user.hasPassword, true);
      assert.equal(added.body.user.emailVerifiedAt, null);
      await drainBackgroundTasks();
      assert.equal(mailOutbox.at(-1)?.to, "sms.user@example.com", "a verification email goes out");

      const byEmail = await signIn(client(), "sms.user@example.com", "N3w-passw0rd");
      assert.equal((byEmail.body as { user: { id: string } }).user.id, created.body.user.id);

      const again = await c.post("/api/account/email", { email: "other@example.com", password: DEFAULT_PASSWORD });
      assert.equal(again.status, 409);
      assert.equal(again.body.error, "EMAIL_ALREADY_SET");
    });
  });
});
