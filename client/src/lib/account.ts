import type { User } from "./types";

/** Guest accounts are throwaway: they can't sign back in once the session ends. */
export const isGuest = (u: Pick<User, "email">) => u.email.endsWith("@guest.parvazyab.local");
