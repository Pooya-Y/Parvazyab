import { skip } from "../test/use-test-database";
import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
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
import { AppDataSource, accounts } from "../database/dataSource";
import { config } from "../config/env";
import { mailOutbox } from "../notify/mailer";
import { drainBackgroundTasks } from "../lib/background";
import { issueToken } from "../auth/tokens";

interface UserBody {
  user: Record<string, unknown> | null;
}

const mailsTo = (to: string) => mailOutbox.filter((m) => m.to === to);

/** The token from the last mail to `to` (links carry it in the URL fragment). */
function tokenFromMail(to: string, path: string): string {
  const mail = mailsTo(to).at(-1);
  assert.ok(mail, `no mail to ${to}`);
  const match = new RegExp(`${path}#token=([A-Za-z0-9_-]{43})`).exec(mail.text);
  assert.ok(match, `no ${path} link in: ${mail.text}`);
  assert.ok(mail.html.includes(`${path}#token=${match[1]}`), "the HTML part carries the same link");
  return match[1];
}

async function auditActions(accountId: string) {
  const rows = (await AppDataSource.query(
    `SELECT action, actor_id AS "actorId", details, ip_hash AS "ipHash" FROM audit_log
      WHERE target_id = $1 ORDER BY id`,
    [accountId],
  )) as { action: string; actorId: string | null; details: Record<string, unknown>; ipHash: string | null }[];
  return rows;
}

describe("account security", { skip }, () => {
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
    mailOutbox.length = 0;
  });

  describe("email verification", () => {
    test("registration mails a single-use verification link", async () => {
      const client = new TestClient(server.url);
      const reg = await client.post<UserBody>("/api/auth/register", {
        name: "نگار",
        email: "Negar@Example.com",
        password: DEFAULT_PASSWORD,
      });
      assert.equal(reg.status, 201);
      assert.equal(reg.body.user?.emailVerifiedAt, null);
      assert.equal("sessionVersion" in (reg.body.user ?? {}), false, "internal fields stay private");
      assert.equal("passwordHash" in (reg.body.user ?? {}), false);

      await drainBackgroundTasks();
      const token = tokenFromMail("negar@example.com", "/auth/verify-email");

      // Verification works from any browser, and doesn't sign that browser in.
      const elsewhere = new TestClient(server.url);
      const verified = await elsewhere.post("/api/auth/email/verify", { token });
      assert.equal(verified.status, 200);
      assert.equal(elsewhere.hasSession(), false);

      const me = await client.get<UserBody>("/api/auth/me");
      assert.equal(typeof me.body.user?.emailVerifiedAt, "string");

      const again = await elsewhere.post("/api/auth/email/verify", { token });
      assert.equal(again.status, 400);
      assert.equal(again.body.error, "INVALID_OR_EXPIRED_TOKEN");

      const account = await accounts().findOneByOrFail({ email: "negar@example.com" });
      assert.deepEqual(
        (await auditActions(account.id)).map((r) => r.action),
        ["auth.email_verified"],
      );
    });

    test("rejects malformed and unknown tokens alike", async () => {
      const client = new TestClient(server.url);
      for (const token of ["short", "x".repeat(43), "a".repeat(43)]) {
        const res = await client.post("/api/auth/email/verify", { token });
        assert.equal(res.status, 400);
        assert.equal(res.body.error, "INVALID_OR_EXPIRED_TOKEN");
      }
    });

    test("resending is throttled, and pointless once verified", async () => {
      const account = await createAccount({ email: "resend@example.com" });
      const client = new TestClient(server.url);
      await signIn(client, account.email);

      const first = await client.post("/api/account/email/verification");
      assert.equal(first.status, 202);
      await drainBackgroundTasks();
      assert.equal(mailsTo(account.email).length, 1);

      const tooSoon = await client.post("/api/account/email/verification");
      assert.equal(tooSoon.status, 429);
      assert.equal(tooSoon.body.error, "RESEND_TOO_SOON");
      const retryAfter = Number(tooSoon.headers.get("retry-after"));
      assert.ok(retryAfter > 0 && retryAfter <= 60, `Retry-After ${retryAfter}`);

      await client.post("/api/auth/email/verify", { token: tokenFromMail(account.email, "/auth/verify-email") });
      const done = await client.post("/api/account/email/verification");
      assert.equal(done.status, 409);
      assert.equal(done.body.error, "EMAIL_ALREADY_VERIFIED");
    });

    test("guests have no mailbox to verify", async () => {
      const guest = new TestClient(server.url);
      assert.equal((await guest.post("/api/auth/guest")).status, 201);
      const res = await guest.post("/api/account/email/verification");
      assert.equal(res.status, 403);
      assert.equal(res.body.error, "GUEST_ACCOUNT");
    });
  });

  describe("password reset", () => {
    test("answers every request the same way and mails only real accounts", async () => {
      const account = await createAccount({ email: "forgot@example.com" });
      const client = new TestClient(server.url);

      const unknown = await client.post("/api/auth/password/forgot", { email: "nobody@example.com" });
      const known = await client.post("/api/auth/password/forgot", { email: "FORGOT@example.com" });
      assert.equal(unknown.status, 202);
      assert.equal(known.status, 202);
      assert.deepEqual(unknown.body, known.body);
      await drainBackgroundTasks();
      assert.equal(mailOutbox.length, 1);
      assert.equal(mailOutbox[0].to, account.email);
      assert.match(mailOutbox[0].subject, /رمز عبور/);

      // A second request within the cooldown is accepted but sends nothing.
      await client.post("/api/auth/password/forgot", { email: account.email });
      await drainBackgroundTasks();
      assert.equal(mailOutbox.length, 1);

      const actions = await auditActions(account.id);
      assert.deepEqual(
        actions.map((r) => r.action),
        ["auth.password_reset_requested"],
      );
      assert.match(actions[0].ipHash ?? "", /^[0-9a-f]{64}$/, "the client IP is stored only as a keyed hash");
    });

    test("never mails guest accounts", async () => {
      const guest = new TestClient(server.url);
      const created = await guest.post<UserBody>("/api/auth/guest");
      await new TestClient(server.url).post("/api/auth/password/forgot", { email: created.body.user?.email });
      await drainBackgroundTasks();
      assert.equal(mailOutbox.length, 0);
    });

    test("sets the password, ends other sessions and signs this browser in", async () => {
      const account = await createAccount({ email: "reset@example.com" });
      const laptop = new TestClient(server.url);
      await signIn(laptop, account.email);

      const token = await issueToken(account.id, "password_reset");
      const phone = new TestClient(server.url);
      const reset = await phone.post<UserBody>("/api/auth/password/reset", { token, password: "N3w-passw0rd" });
      assert.equal(reset.status, 200);
      assert.equal(reset.body.user?.email, account.email);
      assert.equal(phone.hasSession(), true);
      assert.equal(typeof reset.body.user?.emailVerifiedAt, "string", "the link proved the mailbox works");
      assert.equal(typeof reset.body.user?.passwordChangedAt, "string");

      assert.equal((await phone.get<UserBody>("/api/auth/me")).body.user?.email, account.email);
      assert.equal((await laptop.get<UserBody>("/api/auth/me")).body.user, null, "old sessions are revoked");

      const oldPassword = await new TestClient(server.url).post("/api/auth/login", {
        email: account.email,
        password: DEFAULT_PASSWORD,
      });
      assert.equal(oldPassword.status, 401);
      await signIn(new TestClient(server.url), account.email, "N3w-passw0rd");

      const reuse = await phone.post("/api/auth/password/reset", { token, password: "An0ther-pass" });
      assert.equal(reuse.status, 400);
      assert.equal(reuse.body.error, "INVALID_OR_EXPIRED_TOKEN");

      await drainBackgroundTasks();
      const notice = mailsTo(account.email).at(-1);
      assert.ok(notice);
      assert.match(notice.subject, /تغییر کرد/, "the owner is told the password changed");
      assert.deepEqual(
        (await auditActions(account.id)).map((r) => r.action),
        ["auth.password_reset"],
      );
    });

    test("validates the new password before touching the token", async () => {
      const account = await createAccount({ email: "weak@example.com" });
      const token = await issueToken(account.id, "password_reset");
      const client = new TestClient(server.url);
      const weak = await client.post("/api/auth/password/reset", { token, password: "short" });
      assert.equal(weak.status, 400);
      assert.equal(weak.body.error, "INVALID_REQUEST");
      const ok = await client.post("/api/auth/password/reset", { token, password: "l0ng-enough" });
      assert.equal(ok.status, 200, "the token survived the rejected attempt");
    });

    test("only the newest link works, and links expire", async () => {
      const account = await createAccount({ email: "links@example.com" });
      const first = await issueToken(account.id, "password_reset");
      const second = await issueToken(account.id, "password_reset");
      const client = new TestClient(server.url);

      const superseded = await client.post("/api/auth/password/reset", { token: first, password: "N3w-passw0rd" });
      assert.equal(superseded.status, 400);

      await AppDataSource.query(
        `UPDATE auth_tokens SET expires_at = now() - interval '1 second' WHERE account_id = $1`,
        [account.id],
      );
      const expired = await client.post("/api/auth/password/reset", { token: second, password: "N3w-passw0rd" });
      assert.equal(expired.status, 400);
      assert.equal(expired.body.error, "INVALID_OR_EXPIRED_TOKEN");
    });

    test("a token is consumed exactly once under concurrent use", async () => {
      const account = await createAccount({ email: "race@example.com" });
      const token = await issueToken(account.id, "password_reset");
      const results = await Promise.all(
        ["Racer-0ne!", "Racer-tw0!", "Racer-thr3e!"].map((password) =>
          new TestClient(server.url).post("/api/auth/password/reset", { token, password }),
        ),
      );
      assert.deepEqual(results.map((r) => r.status).sort(), [200, 400, 400]);
    });
  });

  describe("signed-in account settings", () => {
    test("changing the password keeps this session and ends the others", async () => {
      const account = await createAccount({ email: "change@example.com" });
      const current = new TestClient(server.url);
      const other = new TestClient(server.url);
      await signIn(current, account.email);
      await signIn(other, account.email);
      const pendingReset = await issueToken(account.id, "password_reset");

      const wrong = await current.put("/api/account/password", {
        currentPassword: "not-my-password",
        newPassword: "N3w-passw0rd",
      });
      assert.equal(wrong.status, 400);
      assert.equal(wrong.body.error, "INVALID_CURRENT_PASSWORD");

      const same = await current.put("/api/account/password", {
        currentPassword: DEFAULT_PASSWORD,
        newPassword: DEFAULT_PASSWORD,
      });
      assert.equal(same.body.error, "PASSWORD_UNCHANGED");

      const changed = await current.put<UserBody>("/api/account/password", {
        currentPassword: DEFAULT_PASSWORD,
        newPassword: "N3w-passw0rd",
      });
      assert.equal(changed.status, 200);
      assert.equal((await current.get<UserBody>("/api/auth/me")).body.user?.email, account.email);
      assert.equal((await other.get<UserBody>("/api/auth/me")).body.user, null);

      const stale = await other.post("/api/auth/password/reset", { token: pendingReset, password: "Att4cker-pass" });
      assert.equal(stale.status, 400, "reset links issued before the change are revoked");
    });

    test("signing out other devices keeps this one", async () => {
      const account = await createAccount({ email: "devices@example.com" });
      const [here, there] = [new TestClient(server.url), new TestClient(server.url)];
      await signIn(here, account.email);
      await signIn(there, account.email);

      assert.equal((await here.delete("/api/account/sessions")).status, 204);
      assert.equal((await here.get<UserBody>("/api/auth/me")).body.user?.email, account.email);
      assert.equal((await there.get<UserBody>("/api/auth/me")).body.user, null);
      assert.equal((await there.delete("/api/account/sessions")).status, 401);

      assert.deepEqual(
        (await auditActions(account.id)).map((r) => r.action),
        ["auth.sessions_revoked"],
      );
    });

    test("sessions issued before versioning stay valid until revoked", async () => {
      const account = await createAccount({ email: "legacy@example.com" });
      const legacy = jwt.sign({ sub: account.id }, config.JWT_SECRET, { algorithm: "HS256", expiresIn: "1d" });
      const client = new TestClient(server.url);
      const headers = { Cookie: `parvazyab_session=${legacy}` };
      assert.equal((await client.get<UserBody>("/api/auth/me", headers)).body.user?.email, account.email);

      await signIn(client, account.email);
      await client.delete("/api/account/sessions");
      assert.equal((await client.get<UserBody>("/api/auth/me", headers)).body.user, null);
    });

    test("updates the display name", async () => {
      const account = await createAccount({ email: "profile@example.com", name: "نام قدیمی" });
      const client = new TestClient(server.url);
      await signIn(client, account.email);

      const invalid = await client.patch("/api/account/profile", { name: " ی " });
      assert.equal(invalid.status, 400);

      const res = await client.patch<UserBody>("/api/account/profile", { name: "  نام تازه " });
      assert.equal(res.status, 200);
      assert.equal(res.body.user?.name, "نام تازه");
      assert.equal((await client.get<UserBody>("/api/auth/me")).body.user?.name, "نام تازه");
    });

    test("guests can't set a password they never had", async () => {
      const guest = new TestClient(server.url);
      await guest.post("/api/auth/guest");
      const res = await guest.put("/api/account/password", { currentPassword: "x", newPassword: "N3w-passw0rd" });
      assert.equal(res.status, 403);
      assert.equal(res.body.error, "GUEST_ACCOUNT");
    });

    test("requires a session", async () => {
      const anon = new TestClient(server.url);
      assert.equal((await anon.patch("/api/account/profile", { name: "کسی" })).status, 401);
      assert.equal((await anon.put("/api/account/password", {})).status, 401);
      assert.equal((await anon.delete("/api/account/sessions")).status, 401);
    });
  });

  test("role changes by an admin are audited", async () => {
    const admin = await createAccount({ email: "admin@example.com", role: "admin" });
    const target = await createAccount({ email: "promote@example.com" });
    const client = new TestClient(server.url);
    await signIn(client, admin.email);
    assert.equal((await client.patch(`/api/admin/users/${target.id}/role`, { accountRole: "agency" })).status, 200);
    // Setting the role it already has is not an event.
    await client.patch(`/api/admin/users/${target.id}/role`, { accountRole: "agency" });

    const rows = await auditActions(target.id);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].action, "admin.role_changed");
    assert.equal(rows[0].actorId, admin.id);
    assert.deepEqual(rows[0].details, { from: "user", to: "agency" });
  });
});
