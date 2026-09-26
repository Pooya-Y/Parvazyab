/**
 * HTTP-boundary tests: validation, authentication and error shaping. These run
 * without Postgres/Redis — every request here is rejected before touching storage.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import jwt from "jsonwebtoken";
import { createApp } from "./app";
import { config, parseConfig } from "./config/env";

let server: Server;
let base: string;

before(async () => {
  server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});

after(() => {
  server.closeAllConnections();
  server.close();
});

async function call(path: string, init?: RequestInit) {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const text = await res.text();
  return { status: res.status, body: text ? (JSON.parse(text) as Record<string, unknown>) : null };
}

test("search without a route is a 400 with INVALID_REQUEST", async () => {
  const { status, body } = await call("/search");
  assert.equal(status, 400);
  assert.equal(body?.error, "INVALID_REQUEST");
});

test("search rejects identical origin and destination", async () => {
  const { status } = await call("/search?originCode=THR&destinationCode=THR");
  assert.equal(status, 400);
});

test("protected routes require a session", async () => {
  for (const path of ["/saved-flights", "/dashboard/listings", "/admin/stats"]) {
    const { status, body } = await call(path);
    assert.equal(status, 401, path);
    assert.equal(body?.error, "UNAUTHENTICATED");
  }
});

test("tampered or wrongly-signed session cookies are rejected", async () => {
  const forged = jwt.sign({ sub: "00000000-0000-0000-0000-000000000000" }, "x".repeat(40));
  const { status } = await call("/saved-flights", { headers: { Cookie: `parvazyab_session=${forged}` } });
  assert.equal(status, 401);
  const none = jwt.sign({ sub: "00000000-0000-0000-0000-000000000000" }, "", { algorithm: "none" });
  assert.equal((await call("/saved-flights", { headers: { Cookie: `parvazyab_session=${none}` } })).status, 401);
});

test("register validates input before hitting the database", async () => {
  const { status, body } = await call("/auth/register", {
    method: "POST",
    body: JSON.stringify({ name: "ع", email: "not-an-email", password: "short" }),
  });
  assert.equal(status, 400);
  assert.equal(body?.error, "INVALID_REQUEST");
});

test("malformed JSON bodies get a 400, not a 500", async () => {
  const { status, body } = await call("/auth/login", { method: "POST", body: "{nope" });
  assert.equal(status, 400);
  assert.equal(body?.error, "INVALID_JSON");
});

test("unknown API routes are JSON 404s", async () => {
  const { status, body } = await call("/does-not-exist");
  assert.equal(status, 404);
  assert.equal(body?.error, "NOT_FOUND");
});

test("env flags parse 'false' as false", () => {
  assert.equal(parseConfig({ COOKIE_SECURE: "false" }).COOKIE_SECURE, false);
  assert.equal(parseConfig({ COOKIE_SECURE: "true" }).COOKIE_SECURE, true);
  assert.equal(config.NODE_ENV === "production", false);
});

test("production refuses placeholder JWT secrets", () => {
  assert.throws(() => parseConfig({ NODE_ENV: "production" }));
  assert.throws(() =>
    parseConfig({ NODE_ENV: "production", JWT_SECRET: "replace-this-in-production-with-a-long-random-secret" }),
  );
  assert.doesNotThrow(() => parseConfig({ NODE_ENV: "production", JWT_SECRET: "k".repeat(48) }));
});
