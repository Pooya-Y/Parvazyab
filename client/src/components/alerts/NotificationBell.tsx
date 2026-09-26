import { useState } from "react";
import { Link } from "react-router";
import { Bell, Loader2 } from "lucide-react";
import { NotificationList } from "@/components/alerts/NotificationList";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useUnreadCount } from "@/hooks/use-notifications";
import { api } from "@/lib/api";
import { toFaDigits } from "@/lib/persian";
import type { AppNotification } from "@/lib/types";
import { invalidate, useApiQuery } from "@/lib/use-api-query";

const RECENT = 8;

/** Header bell: unread count, and the latest notifications a click away. */
export function NotificationBell() {
  const count = useUnreadCount(true);
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const recent = useApiQuery(open ? "notifications:recent" : null, (signal) => api.notifications.list(RECENT, signal), [
    "notifications",
  ]);

  const markRead = async (ids?: string[]) => {
    try {
      await api.notifications.markRead(ids);
    } finally {
      invalidate("notifications");
    }
  };

  const openItem = (item: AppNotification) => {
    setOpen(false);
    if (!item.read) void markRead([item.id]);
  };

  const items = recent.data?.items ?? [];
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setNow(Date.now());
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={count ? `اعلان‌ها، ${toFaDigits(count)} خوانده‌نشده` : "اعلان‌ها"}
        >
          <Bell aria-hidden />
          {count > 0 ? (
            <span
              className="absolute -end-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-none font-bold text-primary-foreground tabular-nums"
              aria-hidden
            >
              {count > 9 ? "۹+" : toFaDigits(count)}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(24rem,calc(100vw-1.5rem))] p-0">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <h2 className="text-sm font-semibold">اعلان‌ها</h2>
          {count > 0 ? (
            <button
              type="button"
              className="text-xs font-medium text-primary underline-offset-4 hover:underline"
              onClick={() => void markRead()}
            >
              همه را خوانده‌شده کن
            </button>
          ) : null}
        </div>
        <div className="max-h-[min(26rem,60dvh)] overflow-y-auto">
          {recent.isLoading ? (
            <p className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground" role="status">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              در حال دریافت…
            </p>
          ) : items.length ? (
            <NotificationList items={items} now={now} onOpen={openItem} />
          ) : (
            <p className="p-6 text-center text-sm leading-7 text-muted-foreground">
              اعلانی ندارید. با ساختن هشدار قیمت در صفحهٔ نتایج، کاهش قیمت‌ها اینجا نشان داده می‌شود.
            </p>
          )}
        </div>
        <div className="border-t px-4 py-2.5 text-center text-sm">
          <Link
            to="/dashboard/alerts"
            className="font-medium text-primary underline-offset-4 hover:underline"
            onClick={() => setOpen(false)}
          >
            هشدارها و همهٔ اعلان‌ها
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
