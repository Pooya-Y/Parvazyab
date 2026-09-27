/**
 * Integration-test helpers: a migrated, empty database per suite, the real Express
 * app on an ephemeral port, and a cookie-aware HTTP client.
 */
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { randomUUID } from "node:crypto";
import { AppDataSource, accounts, flightListings } from "../database/dataSource";
import type { Account, AccountRole, FlightListing } from "../database/entities";
import { hashPassword } from "../auth/auth";
import { createApp } from "../app";

export const DEFAULT_PASSWORD = "Passw0rd!2026";

export async function resetDatabase(): Promise<void> {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
    await AppDataSource.runMigrations();
  }
  const rows = (await AppDataSource.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'migrations'`,
  )) as { tablename: string }[];
  if (rows.length) {
    await AppDataSource.query(`TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
  }
}

export async function closeDatabase(): Promise<void> {
  if (AppDataSource.isInitialized) await AppDataSource.destroy();
}

export interface TestServer {
  url: string;
  close: () => Promise<void>;
}

export async function startServer(): Promise<TestServer> {
  const server: Server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

export interface TestResponse<T> {
  status: number;
  body: T;
  headers: Headers;
  text: string;
}

/**
 * A browser-like client: remembers the session cookie between requests. Give it
 * an `ip` to appear as its own client to the per-IP rate limiters (the app trusts
 * one proxy hop, so X-Forwarded-For sets req.ip).
 */
export class TestClient {
  private cookies = new Map<string, string>();

  constructor(
    private readonly base: string,
    private readonly ip?: string,
  ) {}

  async request<T = Record<string, unknown>>(
    method: string,
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ): Promise<TestResponse<T>> {
    const cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    const init: RequestInit = {
      method,
      redirect: "manual",
      headers: {
        ...(body !== undefined && typeof body !== "string" ? { "Content-Type": "application/json" } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...(this.ip ? { "X-Forwarded-For": this.ip } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    };
    const res = await fetch(`${this.base}${path}`, init);
    for (const line of res.headers.getSetCookie()) {
      const [pair, ...attrs] = line.split(";");
      const [name, ...value] = pair.split("=");
      const expired = attrs.some((a) => /^\s*expires=Thu, 01 Jan 1970/i.test(a) || /^\s*max-age=0\b/i.test(a));
      if (expired || value.join("=") === "") this.cookies.delete(name.trim());
      else this.cookies.set(name.trim(), value.join("="));
    }
    const text = await res.text();
    let parsed: unknown = text;
    if (res.headers.get("content-type")?.includes("application/json") && text) parsed = JSON.parse(text);
    return { status: res.status, body: parsed as T, headers: res.headers, text };
  }

  get<T = Record<string, unknown>>(path: string, headers?: Record<string, string>) {
    return this.request<T>("GET", path, undefined, headers);
  }
  post<T = Record<string, unknown>>(path: string, body?: unknown, headers?: Record<string, string>) {
    return this.request<T>("POST", path, body ?? {}, headers);
  }
  patch<T = Record<string, unknown>>(path: string, body?: unknown, headers?: Record<string, string>) {
    return this.request<T>("PATCH", path, body ?? {}, headers);
  }
  put<T = Record<string, unknown>>(path: string, body?: unknown, headers?: Record<string, string>) {
    return this.request<T>("PUT", path, body ?? {}, headers);
  }
  delete<T = Record<string, unknown>>(path: string, headers?: Record<string, string>) {
    return this.request<T>("DELETE", path, undefined, headers);
  }

  hasSession() {
    return this.cookies.has("parvazyab_session");
  }
}

export async function createAccount(
  opts: { email?: string; name?: string; role?: AccountRole; agencyName?: string; password?: string } = {},
): Promise<Account & { email: string }> {
  const repo = accounts();
  // Email accounts, which is what tests sign in with; phone-only accounts come from the OTP API.
  return repo.save(
    repo.create({
      email: opts.email ?? `user-${randomUUID().slice(0, 8)}@example.com`,
      name: opts.name ?? "کاربر آزمایشی",
      role: opts.role ?? "user",
      agencyName: opts.agencyName ?? (opts.role === "agency" ? "آژانس آزمایشی" : null),
      passwordHash: await hashPassword(opts.password ?? DEFAULT_PASSWORD),
    }),
  ) as Promise<Account & { email: string }>;
}

export async function signIn(client: TestClient, email: string, password = DEFAULT_PASSWORD) {
  const res = await client.post("/api/auth/login", { email, password });
  if (res.status !== 200) throw new Error(`sign-in failed (${res.status}): ${res.text}`);
  return res;
}

export const hoursFromNow = (hours: number) => new Date(Date.now() + hours * 3_600_000);

export async function createListing(accountId: string, overrides: Partial<FlightListing> = {}): Promise<FlightListing> {
  const departAt = overrides.departAt ?? hoursFromNow(48);
  const durationMin = overrides.durationMin ?? 90;
  const repo = flightListings();
  return repo.save(
    repo.create({
      accountId,
      originCode: "THR",
      originCity: "تهران (مهرآباد)",
      destinationCode: "MHD",
      destinationCity: "مشهد",
      airline: "ماهان ایر",
      flightNo: "W5-101",
      stops: 0,
      cabin: "economy",
      priceToman: 2_450_000,
      bookingUrl: "https://agency.example/book",
      isActive: true,
      ...overrides,
      departAt,
      durationMin,
      arriveAt: overrides.arriveAt ?? new Date(departAt.getTime() + durationMin * 60_000),
    }),
  );
}
