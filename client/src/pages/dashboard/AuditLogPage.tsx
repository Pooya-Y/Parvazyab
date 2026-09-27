import { useId, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { LoadError } from "@/components/dashboard/common";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { AUDIT_LABELS, auditLabel } from "@/lib/audit-labels";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { formatJalaliDate, formatTime, toFaDigits } from "@/lib/persian";
import type { AuditEntry } from "@/lib/types";
import { useApiQuery } from "@/lib/use-api-query";

const PAGE = 50;
/** Select items can't have an empty value; this one stands for "every kind". */
const ALL_ACTIONS = "all";

/** Details worth a glance ({ reason, note, from, to, …}) as short "key: value" text. */
function describeDetails(details: Record<string, unknown>): string {
  const labels: Record<string, string> = {
    reason: "دلیل",
    note: "توضیح",
    from: "از",
    to: "به",
    flight: "پرواز",
    name: "نام",
    prefix: "کلید",
    phone: "شماره",
    agencyName: "نام آژانس",
    created: "تازه",
    updated: "به‌روزرسانی",
    skipped: "ردشده",
  };
  return Object.entries(details)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${labels[k] ?? k}: ${typeof v === "number" ? toFaDigits(v) : String(v)}`)
    .join(" · ");
}

export default function AuditLogPage() {
  useDocumentTitle("گزارش رویدادها");
  const [action, setAction] = useState("");
  const first = useApiQuery(`admin-audit:${action}`, (signal) =>
    api.admin.audit({ action: action || undefined, limit: PAGE }, signal),
  );
  const [paged, setPaged] = useState<{ key: string | null; items: AuditEntry[]; done: boolean }>({
    key: null,
    items: [],
    done: false,
  });
  const [loadingMore, setLoadingMore] = useState(false);
  const selectId = useId();
  const more = paged.key === first.dataKey ? paged : { key: first.dataKey, items: [], done: false };
  const items = [...(first.data ?? []), ...more.items];

  const loadMore = async () => {
    const last = items.at(-1);
    if (!last) return;
    setLoadingMore(true);
    try {
      const page = await api.admin.audit({ action: action || undefined, before: last.createdAt, limit: PAGE });
      setPaged({ key: first.dataKey, items: [...more.items, ...page], done: page.length < PAGE });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <>
      <h2 className="mb-1 text-lg font-bold">گزارش رویدادها</h2>
      <p className="mb-4 text-sm leading-7 text-muted-foreground">
        رویدادهای امنیتی حساب‌ها و تصمیم‌های مدیریتی؛ یک سال نگه داشته می‌شوند. نشانی IP ذخیره نمی‌شود.
      </p>
      {/* The app's own select: a native one draws its open list in light colours even in the dark theme. */}
      <div className="mb-4 flex items-center gap-2">
        <label htmlFor={selectId} className="text-sm">
          نوع رویداد
        </label>
        <Select value={action || ALL_ACTIONS} onValueChange={(value) => setAction(value === ALL_ACTIONS ? "" : value)}>
          <SelectTrigger id={selectId} className="h-9 min-w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start">
            <SelectItem value={ALL_ACTIONS}>همه</SelectItem>
            {Object.entries(AUDIT_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {first.error && !first.data ? (
        <LoadError error={first.error} onRetry={first.refetch} />
      ) : !first.data ? (
        <Skeleton className="h-64 rounded-lg" aria-hidden />
      ) : items.length ? (
        <>
          <ol className="divide-y rounded-lg border bg-card">
            {items.map((e) => {
              const details = describeDetails(e.details);
              return (
                <li key={e.id} className="grid gap-1 p-3 text-sm sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4">
                  <time
                    className="text-xs text-muted-foreground tabular-nums"
                    dateTime={new Date(e.createdAt).toISOString()}
                  >
                    {formatJalaliDate(e.createdAt)}، {formatTime(e.createdAt)}
                  </time>
                  <div className="min-w-0">
                    <span className="font-medium">{auditLabel(e.action)}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      · {e.actorName ?? "ناشناس"}
                      {e.actorContact ? (
                        <>
                          {" "}
                          (<bdi dir="ltr">{e.actorContact}</bdi>)
                        </>
                      ) : null}
                    </span>
                    {details ? <p className="mt-0.5 text-xs break-words text-muted-foreground">{details}</p> : null}
                  </div>
                </li>
              );
            })}
          </ol>
          {!more.done && (first.data?.length ?? 0) >= PAGE ? (
            <Button variant="outline" className="mt-3" onClick={() => void loadMore()} disabled={loadingMore}>
              {loadingMore ? <Loader2 className="animate-spin" aria-hidden /> : null}
              رویدادهای قدیمی‌تر
            </Button>
          ) : null}
        </>
      ) : (
        <p className="rounded-lg border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
          رویدادی ثبت نشده است.
        </p>
      )}
    </>
  );
}
