import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { invalidate } from "@/lib/use-api-query";
import { disablePush } from "@/lib/push";
import type { User } from "@/lib/types";

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: (email: string, password: string) => Promise<User>;
  signUp: (name: string, email: string, password: string) => Promise<User>;
  signInAsGuest: () => Promise<User>;
  signOut: () => Promise<void>;
  /** Re-read the session (e.g. after the account's role changed). */
  refresh: () => Promise<void>;
  /** Adopt the user an API call returned (password reset signs in; profile edits update it). */
  applyUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** One session lookup for the whole app, shared by every component through context. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setUser((await api.auth.me()).user);
    } catch {
      // Treat an unreachable API as signed out; pages show their own errors.
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    api.auth
      .me(controller.signal)
      .then(
        ({ user }) => setUser(user),
        () => {
          if (!controller.signal.aborted) setUser(null);
        },
      )
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const accept = (next: User) => {
      setUser(next);
      invalidate("saved");
      return next;
    };
    return {
      user,
      isLoading,
      isAuthenticated: user !== null,
      signIn: async (email, password) => accept((await api.auth.login(email, password)).user),
      signUp: async (name, email, password) => accept((await api.auth.register(name, email, password)).user),
      signInAsGuest: async () => accept((await api.auth.guest()).user),
      signOut: async () => {
        try {
          // A shared device must stop getting this account's notifications.
          await disablePush().catch(() => undefined);
          await api.auth.logout();
        } finally {
          setUser(null);
        }
      },
      refresh,
      applyUser: accept,
    };
  }, [user, isLoading, refresh]);

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
