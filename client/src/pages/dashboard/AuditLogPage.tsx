import { useId, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { LoadError } from "@/components/dashboard/common";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { AUDIT_LABELS, auditLabel } from "@/lib/audit-labels";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { formatJalaliDate, formatTime, toFaDigits } from "@/lib/persian";
import type { AuditEntry } from "@/lib/types";
import { useApiQuery } from "@/lib/use-api-query";

const PAGE = 50;

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
      <div className="mb-4">
        <label htmlFor={selectId} className="me-2 text-sm">
          نوع رویداد
        </label>
        <select
          id={selectId}
          value={action}
          onChange={(e) => setAction(e.target.value)}
          className="h-9 rounded-md border bg-transparent px-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <option value="">همه</option>
          {Object.entries(AUDIT_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
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
