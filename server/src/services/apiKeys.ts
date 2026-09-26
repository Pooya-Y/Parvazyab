import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { AppDataSource, accounts } from "../database/dataSource";
import type { Account } from "../database/entities";
import { HttpError, notFound } from "../http/errors";
import { runInBackground } from "../lib/background";

/**
 * Keys for the agency API: `pvz_<prefix>_<secret>`. The prefix (public, shown
 * in the dashboard) finds the key; only a SHA-256 of the whole key is stored,
 * which is enough for 256 bits of randomness. The key is shown once, at creation.
 */
export const MAX_ACTIVE_KEYS = 5;
const KEY_SHAPE = /^pvz_([a-z0-9]{10})_([A-Za-z0-9_-]{43})$/;

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export interface ApiKeyView {
  id: string;
  name: string;
  prefix: string;
  createdAt: number;
  lastUsedAt: number | null;
}

interface KeyRow {
  id: string;
  name: string;
  prefix: string;
  createdAt: Date;
  lastUsedAt: Date | null;
}

const view = (k: KeyRow): ApiKeyView => ({
  id: k.id,
  name: k.name,
  prefix: k.prefix,
  createdAt: k.createdAt.getTime(),
  lastUsedAt: k.lastUsedAt?.getTime() ?? null,
});

export async function listApiKeys(accountId: string): Promise<ApiKeyView[]> {
  const rows = (await AppDataSource.query(
    `SELECT id, name, prefix, created_at AS "createdAt", last_used_at AS "lastUsedAt"
       FROM api_keys WHERE account_id = $1 AND revoked_at IS NULL ORDER BY created_at DESC`,
    [accountId],
  )) as KeyRow[];
  return rows.map(view);
}

export async function createApiKey(accountId: string, name: string): Promise<ApiKeyView & { key: string }> {
  const [{ active }] = (await AppDataSource.query(
    `SELECT count(*)::int AS active FROM api_keys WHERE account_id = $1 AND revoked_at IS NULL`,
    [accountId],
  )) as { active: number }[];
  if (active >= MAX_ACTIVE_KEYS) throw new HttpError(409, "API_KEY_LIMIT_REACHED");
  // 10 characters of [a-z0-9]; collisions are astronomically unlikely and the UNIQUE index would catch one.
  const prefix = randomBytes(8).toString("hex").slice(0, 10);
  const key = `pvz_${prefix}_${randomBytes(32).toString("base64url")}`;
  const [row] = (await AppDataSource.query(
    `INSERT INTO api_keys (account_id, name, prefix, key_hash) VALUES ($1, $2, $3, $4)
     RETURNING id, name, prefix, created_at AS "createdAt", last_used_at AS "lastUsedAt"`,
    [accountId, name, prefix, sha256(key)],
  )) as KeyRow[];
  return { ...view(row), key };
}

export async function revokeApiKey(accountId: string, id: string): Promise<void> {
  const [row] = (await AppDataSource.query(
    `WITH revoked AS (
       UPDATE api_keys SET revoked_at = now() WHERE id = $1 AND account_id = $2 AND revoked_at IS NULL RETURNING 1
     )
     SELECT 1 AS ok FROM revoked`,
    [id, accountId],
  )) as unknown[];
  if (!row) throw notFound();
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Locals {
      apiKeyPrefix?: string;
    }
  }
}

/** Last-used is informational; writing it at most once a minute keeps hot keys from hammering one row. */
function touch(id: string) {
  runInBackground("api key last used", () =>
    AppDataSource.query(
      `UPDATE api_keys SET last_used_at = now()
        WHERE id = $1 AND (last_used_at IS NULL OR last_used_at < now() - interval '1 minute')`,
      [id],
    ),
  );
}

/**
 * `Authorization: Bearer pvz_…`. Sets `res.locals.user` to the key's agency.
 * The same 401 for every way a key can be wrong, so probing learns nothing.
 */
export async function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const match = KEY_SHAPE.exec(/^Bearer (\S+)$/.exec(req.get("authorization") ?? "")?.[1] ?? "");
  if (!match) throw new HttpError(401, "INVALID_API_KEY", { "WWW-Authenticate": 'Bearer realm="parvazyab"' });
  const [key, prefix] = match;
  const [row] = (await AppDataSource.query(
    `SELECT id, account_id AS "accountId", key_hash AS "keyHash" FROM api_keys WHERE prefix = $1 AND revoked_at IS NULL`,
    [prefix],
  )) as { id: string; accountId: string; keyHash: string }[];
  const valid = row && timingSafeEqual(Buffer.from(row.keyHash, "hex"), Buffer.from(sha256(key), "hex"));
  if (!valid) throw new HttpError(401, "INVALID_API_KEY", { "WWW-Authenticate": 'Bearer realm="parvazyab"' });
  const account: Account | null = await accounts().findOne({ where: { id: row.accountId } });
  // A key outlives nothing: an account that is no longer an agency can't use its old keys.
  if (!account || account.role !== "agency") throw new HttpError(403, "FORBIDDEN");
  res.locals.user = account;
  res.locals.apiKeyPrefix = prefix;
  touch(row.id);
  next();
}
