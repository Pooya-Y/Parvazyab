import { skip } from "../test/use-test-database";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeDatabase, resetDatabase } from "../test/harness";
import { AppDataSource } from "../database/dataSource";
import { seedDemoData } from "../database/seed";
import { routePriceHistory, snapshotRoutePrices } from "./priceHistory";
import { tehranTodayKey } from "../domain/time";

describe("route price history", { skip }, () => {
  before(async () => {
    await resetDatabase();
  });

  after(async () => {
    await closeDatabase();
  });

  test("snapshots each route once per day and serves the history", async () => {
    await seedDemoData();
    const routes = await snapshotRoutePrices();
    assert.ok(routes >= 15, `snapshotted ${routes} routes`);
    assert.equal(await snapshotRoutePrices(), routes, "re-running upserts instead of duplicating");

    const today = tehranTodayKey();
    const [{ count }] = (await AppDataSource.query(
      `SELECT count(*)::int AS count FROM route_price_snapshots WHERE snapshot_date = $1::date`,
      [today],
    )) as { count: number }[];
    assert.equal(count, routes);

    const history = await routePriceHistory("THR", "MHD", 60);
    assert.equal(history.points.length, 60);
    assert.equal(history.points.at(-1)?.date, today);
    const dates = history.points.map((p) => p.date);
    assert.deepEqual(dates, [...dates].sort(), "oldest first");
    assert.ok(history.summary);
    assert.equal(history.summary.current, history.points.at(-1)?.minPrice);
  });
});
