import { skip } from "../test/use-test-database";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  TestClient,
  closeDatabase,
  createAccount,
  hoursFromNow,
  resetDatabase,
  signIn,
  startServer,
  type TestServer,
} from "../test/harness";
import { accounts, savedFlights } from "../database/dataSource";

/** Saved flights are snapshots; the API only accepts ones taken from search results, so tests insert rows. */
async function saveFlightFor(accountId: string, flightKey: string) {
  const repo = savedFlights();
  await repo.save(
    repo.create({
      accountId,
      flightKey,
      airline: "ماهان ایر",
      flightNo: "W5-101",
      originCode: "THR",
      originCity: "تهران (مهرآباد)",
      destinationCode: "MHD",
      destinationCity: "مشهد",
      departAt: hoursFromNow(48),
      arriveAt: hoursFromNow(49.5),
      durationMin: 90,
      stops: 0,
      cabin: "economy",
      priceToman: 2_450_000,
      agencyName: "آژانس آزمایشی",
    }),
  );
}

const savedKeys = async (accountId: string) =>
  (await savedFlights().find({ where: { accountId } })).map((s) => s.flightKey).sort();

interface UserBody {
  user: { id: string; email: string; role: string; accountRole: string; passwordHash?: string } | null;
}

describe("auth API", { skip }, () => {
  let server: TestServer;

  before(async () => {
    await resetDatabase();
    server = await startServer();
  });

  after(async () => {
    await server?.close();
    await closeDatabase();
  });

  test("register starts a session and never exposes the password hash", async () => {
    const client = new TestClient(server.url);
    const res = await client.post<UserBody>("/api/auth/register", {
      name: "سارا",
      email: "Sara@Example.com",
      password: "long-enough-pass",
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.user?.email, "sara@example.com");
    assert.equal(res.body.user?.passwordHash, undefined);
    assert.ok(client.hasSession());
    const me = await client.get<UserBody>("/api/auth/me");
    assert.equal(me.body.user?.email, "sara@example.com");
  });

  test("duplicate registration is a 409", async () => {
    const client = new TestClient(server.url);
    const res = await client.post("/api/auth/register", {
      name: "سارا",
      email: "sara@example.com",
      password: "long-enough-pass",
    });
    assert.equal(res.status, 409);
    assert.equal(res.body.error, "ACCOUNT_ALREADY_EXISTS");
  });

  test("login checks the password and is case-insensitive on email", async () => {
    const client = new TestClient(server.url);
    const wrong = await client.post("/api/auth/login", { email: "sara@example.com", password: "nope-nope" });
    assert.equal(wrong.status, 401);
    assert.equal(client.hasSession(), false);
    const ok = await client.post<UserBody>("/api/auth/login", {
      email: "SARA@example.com",
      password: "long-enough-pass",
    });
    assert.equal(ok.status, 200);
    assert.ok(client.hasSession());
  });

  test("logout ends the session", async () => {
    const client = new TestClient(server.url);
    await client.post("/api/auth/login", { email: "sara@example.com", password: "long-enough-pass" });
    const out = await client.post("/api/auth/logout");
    assert.equal(out.status, 204);
    const me = await client.get<UserBody>("/api/auth/me");
    assert.equal(me.body.user, null);
  });

  test("guest sign-in creates a throwaway account", async () => {
    const client = new TestClient(server.url);
    const res = await client.post<UserBody>("/api/auth/guest");
    assert.equal(res.status, 201);
    assert.match(res.body.user?.email ?? "", /@guest\.parvazyab\.local$/);
  });

  test("signing up from a guest session turns the guest into the new account", async () => {
    const client = new TestClient(server.url);
    const guest = (await client.post<UserBody>("/api/auth/guest")).body.user!;
    await saveFlightFor(guest.id, "W5__101__a");

    const res = await client.post<UserBody>("/api/auth/register", {
      name: "مهمان سابق",
      email: "former-guest@example.com",
      password: "long-enough-pass",
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.user?.id, guest.id, "same account, now permanent");
    assert.equal(res.body.user?.email, "former-guest@example.com");
    assert.deepEqual(await savedKeys(guest.id), ["W5__101__a"]);
    assert.equal((await client.get<UserBody>("/api/auth/me")).body.user?.id, guest.id);
  });

  test("a copy of the old guest cookie can't follow the upgraded account", async () => {
    const client = new TestClient(server.url);
    const guestCookie = (await client.post("/api/auth/guest")).headers.getSetCookie()[0].split(";")[0];
    await client.post("/api/auth/register", {
      name: "کاربر تازه",
      email: "upgraded@example.com",
      password: "long-enough-pass",
    });
    const stale = await new TestClient(server.url).get<UserBody>("/api/auth/me", { Cookie: guestCookie });
    assert.equal(stale.body.user, null);
  });

  test("signing in from a guest session brings the guest's saved flights along", async () => {
    const member = await createAccount({ email: "member@example.com" });
    await saveFlightFor(member.id, "shared");
    await saveFlightFor(member.id, "member-only");

    const client = new TestClient(server.url);
    const guest = (await client.post<UserBody>("/api/auth/guest")).body.user!;
    await saveFlightFor(guest.id, "shared");
    await saveFlightFor(guest.id, "guest-only");

    await signIn(client, member.email);
    assert.deepEqual(await savedKeys(member.id), ["guest-only", "member-only", "shared"]);
    assert.equal(await accounts().exists({ where: { id: guest.id } }), false, "the guest is gone");
  });

  test("a failed sign-in leaves the guest untouched", async () => {
    const client = new TestClient(server.url);
    const guest = (await client.post<UserBody>("/api/auth/guest")).body.user!;
    await saveFlightFor(guest.id, "kept");
    const res = await client.post("/api/auth/login", { email: "member@example.com", password: "wrong-password" });
    assert.equal(res.status, 401);
    assert.deepEqual(await savedKeys(guest.id), ["kept"]);
    assert.equal((await client.get<UserBody>("/api/auth/me")).body.user?.id, guest.id);
  });
});
