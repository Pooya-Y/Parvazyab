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

const sessionPayload = z.object({ sub: z.string().uuid() });

export function hashPassword(password: string) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

// Compared against when the email is unknown, so login timing doesn't reveal which emails exist.
const dummyHash = bcrypt.hashSync(randomUUID(), BCRYPT_ROUNDS);

export async function verifyPassword(password: string, hash: string | undefined) {
  const ok = await bcrypt.compare(password, hash ?? dummyHash);
  return ok && hash !== undefined;
}

export function setSession(res: Response, user: Pick<Account, "id">) {
  const token = jwt.sign({ sub: user.id }, config.JWT_SECRET, {
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
  let userId: string;
  try {
    userId = sessionPayload.parse(jwt.verify(token, config.JWT_SECRET, { algorithms: ["HS256"] })).sub;
  } catch {
    return null;
  }
  return accounts().findOne({ where: { id: userId } });
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

export type PublicUser = Omit<Account, "passwordHash"> & { accountRole: "agency" | "user" };

export function sanitizeUser(u: Account): PublicUser;
export function sanitizeUser(u: Account | null): PublicUser | null;
export function sanitizeUser(u: Account | null): PublicUser | null {
  if (!u) return null;
  const { passwordHash: _omit, ...safe } = u;
  return { ...safe, accountRole: u.role === "agency" ? "agency" : "user" };
}

export async function createGuest() {
  const repo = accounts();
  return repo.save(
    repo.create({
      email: `guest-${randomUUID()}@guest.parvazyab.local`,
      passwordHash: await hashPassword(randomUUID()),
      name: "مهمان",
      role: "user",
    }),
  );
}
