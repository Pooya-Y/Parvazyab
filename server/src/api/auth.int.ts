import { skip } from "../test/use-test-database";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { TestClient, closeDatabase, resetDatabase, startServer, type TestServer } from "../test/harness";

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
    const ok = await client.post<UserBody>("/api/auth/login", { email: "SARA@example.com", password: "long-enough-pass" });
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
});
