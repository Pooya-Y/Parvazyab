import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { accounts } from "../database/dataSource";
import { config } from "../config/env";
import type { Account, AccountRole } from "../database/entities";
import { HttpError } from "../http/errors";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Locals {
      user?: Account;
    }
  }
}

const COOKIE = "parvazyab_session";
const SESSION_DAYS = 7;
const BCRYPT_ROUNDS = 12;
const cookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: config.COOKIE_SECURE,
  path: "/",
} as const;

/** `ver` must match the account's session_version; tokens from before versioning count as 0. */
const sessionPayload = z.object({ sub: z.string().uuid(), ver: z.number().int().nonnegative().optional() });

/** Guest accounts get an unreachable address in this domain; they can't receive mail or sign back in. */
export const GUEST_EMAIL_DOMAIN = "guest.parvazyab.local";
export const isGuestAccount = (a: Pick<Account, "email">) => a.email?.endsWith(`@${GUEST_EMAIL_DOMAIN}`) ?? false;

export function hashPassword(password: string) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

// Compared against when the email is unknown, so login timing doesn't reveal which emails exist.
const dummyHash = bcrypt.hashSync(randomUUID(), BCRYPT_ROUNDS);

/** False when there is no hash (unknown email, or an account without a password), after the same work. */
export async function verifyPassword(password: string, hash: string | null | undefined) {
  const ok = await bcrypt.compare(password, hash ?? dummyHash);
  return ok && Boolean(hash);
}

export function setSession(res: Response, user: Pick<Account, "id" | "sessionVersion">) {
  const token = jwt.sign({ sub: user.id, ver: user.sessionVersion }, config.JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: `${SESSION_DAYS}d`,
  });
  res.cookie(COOKIE, token, { ...cookieOptions, maxAge: SESSION_DAYS * 86_400_000 });
}

export function clearSession(res: Response) {
  res.clearCookie(COOKIE, cookieOptions);
}

export async function currentUser(req: Request): Promise<Account | null> {
  const token: unknown = req.cookies?.[COOKIE];
  if (typeof token !== "string" || !token) return null;
  let payload: z.infer<typeof sessionPayload>;
  try {
    payload = sessionPayload.parse(jwt.verify(token, config.JWT_SECRET, { algorithms: ["HS256"] }));
  } catch {
    return null;
  }
  const user = await accounts().findOne({ where: { id: payload.sub } });
  // A bumped version (password change, "sign out everywhere") revokes every older token.
  if (!user || user.sessionVersion !== (payload.ver ?? 0)) return null;
  return user;
}

/** Invalidates every session of the account; returns the new version for re-issuing the caller's cookie. */
export async function revokeSessions(accountId: string): Promise<number> {
  const [row] = (await accounts().query(
    `WITH bumped AS (
       UPDATE accounts SET session_version = session_version + 1 WHERE id = $1 RETURNING session_version
     )
     SELECT session_version AS "sessionVersion" FROM bumped`,
    [accountId],
  )) as { sessionVersion: number }[];
  if (!row) throw new HttpError(404, "NOT_FOUND");
  return row.sessionVersion;
}

export async function requireUser(req: Request, res: Response, next: NextFunction) {
  const user = await currentUser(req);
  if (!user) throw new HttpError(401, "UNAUTHENTICATED");
  res.locals.user = user;
  next();
}

export function requireRole(...roles: AccountRole[]) {
  return (_req: Request, res: Response, next: NextFunction) => {
    const user = res.locals.user;
    if (!user || !roles.includes(user.role)) throw new HttpError(403, "FORBIDDEN");
    next();
  };
}

/** The authenticated user; only valid behind `requireUser`. */
export function sessionUser(res: Response): Account {
  const user = res.locals.user;
  if (!user) throw new HttpError(401, "UNAUTHENTICATED");
  return user;
}

export type PublicUser = Omit<Account, "passwordHash" | "sessionVersion"> & {
  accountRole: "agency" | "user";
  /** Whether "change password" applies (accounts made by SMS code have none until they add an email). */
  hasPassword: boolean;
};

export function sanitizeUser(u: Account): PublicUser;
export function sanitizeUser(u: Account | null): PublicUser | null;
export function sanitizeUser(u: Account | null): PublicUser | null {
  if (!u) return null;
  const { passwordHash: _hash, sessionVersion: _version, ...safe } = u;
  return {
    ...safe,
    accountRole: u.role === "agency" ? "agency" : "user",
    hasPassword: u.passwordHash !== null && !isGuestAccount(u),
  };
}

export async function createGuest() {
  const repo = accounts();
  return repo.save(
    repo.create({
      email: `guest-${randomUUID()}@${GUEST_EMAIL_DOMAIN}`,
      passwordHash: await hashPassword(randomUUID()),
      name: "مهمان",
      role: "user",
    }),
  );
}
