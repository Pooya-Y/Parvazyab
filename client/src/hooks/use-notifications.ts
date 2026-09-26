import { useEffect } from "react";
import { api } from "@/lib/api";
import { useApiQuery } from "@/lib/use-api-query";

const POLL_MS = 60_000;

/**
 * Unread notifications for the header bell. Polls once a minute while the tab
 * is visible and checks again the moment it becomes visible; `invalidate("notifications")`
 * refreshes it right away after reading something.
 */
export function useUnreadCount(enabled: boolean): number {
  const query = useApiQuery(
    enabled ? "notifications:unread" : null,
    (signal) => api.notifications.unreadCount(signal),
    ["notifications"],
  );
  const { refetch } = query;

  useEffect(() => {
    if (!enabled) return;
    const check = () => {
      if (document.visibilityState === "visible") refetch();
    };
    const timer = window.setInterval(check, POLL_MS);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [enabled, refetch]);

  return enabled ? (query.data?.count ?? 0) : 0;
}
