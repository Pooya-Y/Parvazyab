import { skip } from "../test/use-test-database";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeDatabase, createAccount, resetDatabase } from "../test/harness";
import { AppDataSource, accounts } from "../database/dataSource";
import { purgeStaleGuests } from "./maintenance";

describe("maintenance jobs", { skip }, () => {
  before(async () => {
    await resetDatabase();
  });

  after(async () => {
    await closeDatabase();
  });

  test("purges only guests past the cutoff", async () => {
    const fresh = await createAccount({ email: "guest-fresh@guest.parvazyab.local" });
    const stale = await createAccount({ email: "guest-stale@guest.parvazyab.local" });
    const oldUser = await createAccount({ email: "real-user@example.com" });
    await AppDataSource.query(`UPDATE accounts SET created_at = now() - interval '30 days' WHERE id = ANY($1)`, [
      [stale.id, oldUser.id],
    ]);
    assert.equal(await purgeStaleGuests(), 1);
    const remaining = (await accounts().find()).map((a) => a.email).sort();
    assert.deepEqual(remaining, [fresh.email, oldUser.email].sort());
    assert.equal(await purgeStaleGuests(), 0);
  });
});
