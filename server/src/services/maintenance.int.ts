import { skip } from "../test/use-test-database";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { closeDatabase, createAccount, resetDatabase } from "../test/harness";
import { AppDataSource, accounts } from "../database/dataSource";
import { purgeDeadAuthTokens, purgeOldAuditEntries, purgeStaleGuests } from "./maintenance";
import { issueToken } from "../auth/tokens";
import { audit } from "./audit";

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

  test("purges auth tokens a day after they were used or expired", async () => {
    const account = await createAccount();
    await issueToken(account.id, "password_reset"); // superseded below: consumed now
    await issueToken(account.id, "password_reset"); // live
    await issueToken(account.id, "email_verify"); // live, but backdated to long expired
    await AppDataSource.query(
      `UPDATE auth_tokens SET expires_at = now() - interval '2 days' WHERE purpose = 'email_verify'`,
    );
    assert.equal(await purgeDeadAuthTokens(), 1, "the freshly consumed token is kept for the cooldown window");

    await AppDataSource.query(
      `UPDATE auth_tokens SET consumed_at = now() - interval '25 hours' WHERE consumed_at IS NOT NULL`,
    );
    assert.equal(await purgeDeadAuthTokens(), 1);
    const [{ live }] = (await AppDataSource.query(`SELECT count(*)::int AS live FROM auth_tokens`)) as {
      live: number;
    }[];
    assert.equal(live, 1);
  });

  test("keeps a year of audit history", async () => {
    await audit(null, { actorId: null, action: "auth.sessions_revoked" });
    await audit(null, { actorId: null, action: "auth.sessions_revoked" });
    await AppDataSource.query(
      `UPDATE audit_log SET created_at = now() - interval '400 days' WHERE id = (SELECT min(id) FROM audit_log)`,
    );
    assert.equal(await purgeOldAuditEntries(), 1);
    assert.equal(await purgeOldAuditEntries(), 0);
  });
});
