import { AppDataSource } from "./database/dataSource";
import { bootstrapAdmin, seedDemoData } from "./database/seed";
import { redis } from "./services/redis";
import { createApp } from "./app";
import { config } from "./config/env";
import { drainBackgroundTasks } from "./lib/background";

async function start() {
  await AppDataSource.initialize();
  const applied = await AppDataSource.runMigrations();
  if (applied.length) console.log(`Applied migrations: ${applied.map((m) => m.name).join(", ")}`);

  if (config.SEED_DEMO_DATA) await seedDemoData();
  if (config.ADMIN_EMAIL && config.ADMIN_PASSWORD) await bootstrapAdmin(config.ADMIN_EMAIL, config.ADMIN_PASSWORD);

  try {
    await redis.connect();
  } catch {
    console.warn("Redis unavailable; serving without cache until it recovers.");
  }

  const server = createApp().listen(config.PORT, () => {
    console.log(`Parvazyab API listening on :${config.PORT}`);
  });

  const shutdown = (signal: string) => {
    console.log(`${signal} received, shutting down`);
    server.close(async () => {
      // Queued mail still needs the database (token rows) and the SMTP connection.
      await drainBackgroundTasks();
      await Promise.allSettled([AppDataSource.destroy(), redis.quit()]);
      process.exit(0);
    });
    // Don't hang forever on keep-alive connections.
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

start().catch((err) => {
  console.error("Failed to start server", err);
  process.exit(1);
});
