/**
 * Background worker: periodic jobs that must not run inside request handlers.
 * Runs as its own process (`npm run dev:worker`, or the `worker` Compose service).
 */
import { writeFile } from "node:fs/promises";
import { AppDataSource } from "./database/dataSource";
import { seedDemoData } from "./database/seed";
import { redis } from "./services/redis";
import { config } from "./config/env";
import { Scheduler } from "./jobs/scheduler";
import { snapshotRoutePrices } from "./services/priceHistory";
import { purgeDeadAuthTokens, purgeOldAuditEntries, purgeStaleGuests } from "./services/maintenance";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
/** Touched regularly; the container healthcheck fails if it goes stale. */
const HEARTBEAT_FILE = process.env.WORKER_HEARTBEAT_FILE ?? "/tmp/parvazyab-worker-heartbeat";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Migrations are the API's job; wait until the schema is current. */
async function waitForSchema() {
  while (await AppDataSource.showMigrations()) {
    console.log("[worker] waiting for pending migrations…");
    await sleep(3_000);
  }
}

async function main() {
  await AppDataSource.initialize();
  await waitForSchema();
  try {
    await redis.connect();
  } catch {
    console.warn("[worker] Redis unavailable; continuing without cache.");
  }

  const scheduler = new Scheduler()
    .add({ name: "route-price-snapshots", everyMs: 30 * MINUTE, run: () => snapshotRoutePrices(), runAtStart: true })
    .add({ name: "purge-stale-guests", everyMs: 24 * HOUR, run: () => purgeStaleGuests(), runAtStart: true })
    .add({ name: "purge-auth-tokens", everyMs: 6 * HOUR, run: () => purgeDeadAuthTokens(), runAtStart: true })
    .add({ name: "purge-audit-log", everyMs: 24 * HOUR, run: () => purgeOldAuditEntries() });
  if (config.SEED_DEMO_DATA) {
    scheduler.add({ name: "demo-timetable", everyMs: 6 * HOUR, run: () => seedDemoData() });
  }

  const beat = () => writeFile(HEARTBEAT_FILE, String(Date.now())).catch(() => undefined);
  await beat();
  const heartbeat = setInterval(beat, 30_000);
  console.log("[worker] started");

  const shutdown = async (signal: string) => {
    console.log(`[worker] ${signal} received, finishing running jobs`);
    clearInterval(heartbeat);
    const timeout = setTimeout(() => process.exit(1), 30_000);
    timeout.unref();
    await scheduler.stop();
    await Promise.allSettled([AppDataSource.destroy(), redis.quit()]);
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("[worker] failed to start", err);
  process.exit(1);
});
