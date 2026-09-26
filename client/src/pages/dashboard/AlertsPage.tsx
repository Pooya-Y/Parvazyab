import { useState } from "react";
import { Link } from "react-router";
import { BellPlus, Loader2, Mail, MailX, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { NotificationList } from "@/components/alerts/NotificationList";
import { LoadError, RouteLabel } from "@/components/dashboard/common";
import { StateMessage } from "@/components/StateMessage";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { airportShortCity } from "@/domain/airports";
import { useAuth } from "@/hooks/use-auth";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { isGuest } from "@/lib/account";
import { alertConditionLabel, alertWindowLabel, isExpiredAlert } from "@/lib/alerts";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { formatPrice, formatRelativeTime, toFaDigits } from "@/lib/persian";
import { searchUrl } from "@/lib/search-state";
import type { AppNotification, PriceAlert } from "@/lib/types";
import { invalidate, useApiQuery } from "@/lib/use-api-query";
import { cn } from "@/lib/utils";

const CABIN_LABEL = { economy: "اکونومی", business: "بیزینس" } as const;

/** Lowest fare now, against the fare when the alert was made. */
function PriceNow({ alert }: { alert: PriceAlert }) {
  if (alert.lastPrice === null) {
    return <span className="text-muted-foreground">فعلاً پروازی در این بازه نیست</span>;
  }
  const change = alert.baselinePrice ? (alert.lastPrice - alert.baselinePrice) / alert.baselinePrice : 0;
  const percent = toFaDigits(Math.round(Math.abs(change) * 100));
  return (
    <span>
      کمترین قیمت الان <span className="font-semibold tabular-nums">{formatPrice(alert.lastPrice)}</span>
      {change <= -0.005 ? (
        <span className="ms-2 text-xs font-medium text-success">{percent}٪ ارزان‌تر از زمان ساخت</span>
      ) : change >= 0.005 ? (
        <span className="ms-2 text-xs text-muted-foreground">{percent}٪ گران‌تر از زمان ساخت</span>
      ) : null}
    </span>
  );
}

function AlertRow({
  alert,
  now,
  canEmail,
  onChange,
  onDelete,
}: {
  alert: PriceAlert;
  now: number;
  canEmail: boolean;
  onChange: (next: PriceAlert) => void;
  onDelete: (id: string) => void;
}) {
  const [busy, setBusy] = useState<"active" | "email" | "delete" | null>(null);
  const expired = isExpiredAlert(alert, now);
  const route = `${airportShortCity(alert.originCode)} به ${airportShortCity(alert.destinationCode)}`;

  const update = async (kind: "active" | "email", patch: { isActive?: boolean; notifyEmail?: boolean }) => {
    setBusy(kind);
    try {
      onChange(await api.alerts.update(alert.id, patch));
    } catch (err) {
      toast.error(errorMessage(err, "تغییر ذخیره نشد. دوباره تلاش کنید."));
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    setBusy("delete");
    try {
      await api.alerts.remove(alert.id);
      onDelete(alert.id);
      toast.success("هشدار حذف شد");
    } catch (err) {
      toast.error(errorMessage(err, "حذف انجام نشد. دوباره تلاش کنید."));
      setBusy(null);
    }
  };

  return (
    <li className={cn("flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:gap-6", !alert.isActive && "bg-muted/30")}>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-semibold">
            <RouteLabel from={alert.originCode} to={alert.destinationCode} />
          </span>
          <span
            className={cn(
              "rounded-[5px] px-1.5 py-0.5 text-xs",
              alert.isActive ? "bg-success/10 text-success" : "bg-muted text-muted-foreground",
            )}
          >
            {alert.isActive ? "فعال" : expired ? "تاریخ گذشته" : "متوقف"}
          </span>
        </p>
        <p className="text-sm text-muted-foreground">
          {alertWindowLabel(alert)}
          {alert.cabin ? ` · ${CABIN_LABEL[alert.cabin]}` : ""} · {alertConditionLabel(alert)}
        </p>
        <p className="text-sm">
          <PriceNow alert={alert} />
        </p>
        {alert.lastNotifiedAt ? (
          <p className="text-xs text-muted-foreground">
            آخرین اعلان {formatRelativeTime(alert.lastNotifiedAt, now)}، با قیمت{" "}
            {formatPrice(alert.lastNotifiedPrice ?? 0)}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={alert.isActive}
            disabled={busy !== null || (expired && !alert.isActive)}
            onCheckedChange={(isActive) => void update("active", { isActive })}
            aria-label={`${alert.isActive ? "توقف" : "ازسرگیری"} هشدار ${route}`}
          />
          <span className="text-muted-foreground" aria-hidden>
            فعال
          </span>
        </label>
        <Button
          variant="ghost"
          size="icon"
          disabled={busy !== null || (!canEmail && !alert.notifyEmail)}
          onClick={() => void update("email", { notifyEmail: !alert.notifyEmail })}
          aria-pressed={alert.notifyEmail}
          aria-label={alert.notifyEmail ? `ایمیل نفرست برای هشدار ${route}` : `ایمیل هم بفرست برای هشدار ${route}`}
          title={alert.notifyEmail ? "ایمیل هم فرستاده می‌شود" : "فقط اعلان در پروازیاب"}
        >
          {busy === "email" ? <Loader2 className="animate-spin" /> : alert.notifyEmail ? <Mail /> : <MailX />}
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link
            to={searchUrl({
              from: alert.originCode,
              to: alert.destinationCode,
              date: alert.dateFrom === alert.dateTo ? (alert.dateFrom ?? undefined) : undefined,
            })}
          >
            پروازها
          </Link>
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-destructive"
              disabled={busy !== null}
              aria-label={`حذف هشدار ${route}`}
            >
              {busy === "delete" ? <Loader2 className="animate-spin" /> : <Trash2 />}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>هشدار {route} حذف شود؟</AlertDialogTitle>
              <AlertDialogDescription>اعلان‌های قبلی این هشدار سر جایشان می‌مانند.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>انصراف</AlertDialogCancel>
              <AlertDialogAction onClick={() => void remove()}>حذف هشدار</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </li>
  );
}

function AlertsSection({ now }: { now: number }) {
  const { user } = useAuth();
  const alerts = useApiQuery("alerts", (signal) => api.alerts.list(signal), ["alerts"]);
  const canEmail = user !== null && user.emailVerifiedAt !== null && user.email !== null && !isGuest(user);

  if (alerts.error && !alerts.data) return <LoadError error={alerts.error} onRetry={alerts.refetch} />;
  if (alerts.isLoading) return <Skeleton className="h-40 rounded-lg" aria-hidden />;
  const list = alerts.data ?? [];
  if (!list.length) {
    return (
      <StateMessage
        icon={BellPlus}
        title="هنوز هشداری نساخته‌اید"
        description="در صفحهٔ نتایج جستجو یا جزئیات پرواز، «هشدار قیمت» را بزنید تا وقتی قیمت پایین آمد خبرتان کنیم."
        action={
          <Button asChild>
            <Link to="/">جستجوی پرواز</Link>
          </Button>
        }
      />
    );
  }
  return (
    <ul className="divide-y rounded-lg border bg-card">
      {list.map((alert) => (
        <AlertRow
          key={alert.id}
          alert={alert}
          now={now}
          canEmail={canEmail}
          onChange={(next) => alerts.setData((prev) => prev?.map((a) => (a.id === next.id ? next : a)))}
          onDelete={(id) => alerts.setData((prev) => prev?.filter((a) => a.id !== id))}
        />
      ))}
    </ul>
  );
}

function NotificationsSection({ now }: { now: number }) {
  const inbox = useApiQuery("notifications:page", (signal) => api.notifications.list(30, signal), ["notifications"]);

  const markRead = async (ids?: string[]) => {
    try {
      await api.notifications.markRead(ids);
    } finally {
      invalidate("notifications");
    }
  };
  const open = (item: AppNotification) => {
    if (!item.read) void markRead([item.id]);
  };

  const unread = inbox.data?.unreadCount ?? 0;
  return (
    <section aria-labelledby="notifications-heading" className="mt-10">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 id="notifications-heading" className="text-lg font-bold">
          اعلان‌ها
        </h2>
        {unread > 0 ? (
          <Button variant="ghost" size="sm" onClick={() => void markRead()}>
            همه را خوانده‌شده کن
          </Button>
        ) : null}
      </div>
      {inbox.error && !inbox.data ? (
        <LoadError error={inbox.error} onRetry={inbox.refetch} />
      ) : inbox.isLoading ? (
        <Skeleton className="h-32 rounded-lg" aria-hidden />
      ) : inbox.data?.items.length ? (
        <NotificationList items={inbox.data.items} now={now} onOpen={open} className="rounded-lg border bg-card" />
      ) : (
        <p className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
          هنوز اعلانی نیامده است.
        </p>
      )}
    </section>
  );
}

export default function AlertsPage() {
  useDocumentTitle("هشدارهای قیمت");
  const [now] = useState(() => Date.now());
  return (
    <>
      <h2 className="mb-1 text-lg font-bold">هشدارهای قیمت</h2>
      <p className="mb-4 text-sm leading-7 text-muted-foreground">
        قیمت مسیرهای شما را هر ۱۵ دقیقه بررسی می‌کنیم و وقتی ارزان‌تر شد، خبرتان می‌کنیم.
      </p>
      <AlertsSection now={now} />
      <NotificationsSection now={now} />
    </>
  );
}
