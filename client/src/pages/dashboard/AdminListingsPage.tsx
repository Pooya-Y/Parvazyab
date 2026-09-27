import { useId, useState } from "react";
import { useSearchParams } from "react-router";
import { Ban, Loader2, RotateCcw, Search } from "lucide-react";
import { toast } from "sonner";
import { ReasonDialog, type ReasonRequest } from "@/components/admin/ReasonDialog";
import { LoadError, RouteLabel } from "@/components/dashboard/common";
import { Segmented } from "@/components/Segmented";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { formatJalaliDate, formatPrice, formatTime } from "@/lib/persian";
import type { AdminListing } from "@/lib/types";
import { useApiQuery } from "@/lib/use-api-query";
import { cn } from "@/lib/utils";

type Status = "all" | "suspended";

/** Find listings (flight number, route like THR-MHD, or agency name) and suspend or restore them. */
export default function AdminListingsPage() {
  useDocumentTitle("پروازها");
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const status: Status = params.get("status") === "suspended" ? "suspended" : "all";
  const [draft, setDraft] = useState(q);
  const [busy, setBusy] = useState<string | null>(null);
  const [reason, setReason] = useState<ReasonRequest | null>(null);
  const listings = useApiQuery(`admin-listings:${status}:${q}`, (signal) => api.admin.listings(q, status, signal), [
    "admin-listings",
  ]);
  const inputId = useId();

  const update = (patch: { q?: string; status?: Status }) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v && v !== "all") next.set(k, v);
      else next.delete(k);
    }
    setParams(next, { replace: true });
  };

  const apply = async (l: AdminListing, suspended: boolean, note = "") => {
    setBusy(l.id);
    try {
      await api.admin.suspendListing(l.id, suspended, note);
      listings.setData((rows) =>
        rows?.map((r) =>
          r.id === l.id
            ? { ...r, suspendedAt: suspended ? Date.now() : null, suspensionReason: suspended ? note || null : null }
            : r,
        ),
      );
      toast.success(suspended ? "پرواز معلق شد" : "تعلیق پرواز برداشته شد");
    } catch (err) {
      toast.error(errorMessage(err, "انجام نشد. دوباره تلاش کنید."));
      throw err;
    } finally {
      setBusy(null);
    }
  };

  const suspend = (l: AdminListing) =>
    setReason({
      title: `پرواز ${l.flightNo} معلق شود؟`,
      description: `پرواز ${l.agencyName} از همهٔ نتایج پنهان می‌شود تا تعلیق برداشته شود. آژانس خبردار می‌شود.`,
      confirmLabel: "تعلیق پرواز",
      placeholder: "مثلاً: قیمت اعلام‌شده با قیمت صفحهٔ خرید فرق دارد.",
      run: (note) => apply(l, true, note),
    });

  return (
    <>
      <h2 className="mb-1 text-lg font-bold">پروازها</h2>
      <p className="mb-4 text-sm leading-7 text-muted-foreground">
        پروازی را با شمارهٔ پرواز، مسیر (مثلاً THR-MHD) یا نام آژانس پیدا کنید.
      </p>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <form
          role="search"
          className="flex flex-1 gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            update({ q: draft.trim() });
          }}
        >
          <label htmlFor={inputId} className="sr-only">
            جستجوی پرواز
          </label>
          <Input
            id={inputId}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="W5-1071، THR-MHD یا نام آژانس"
            className="h-10"
            maxLength={60}
          />
          <Button type="submit" variant="outline" className="h-10">
            <Search aria-hidden />
            جستجو
          </Button>
        </form>
        <Segmented
          legend="وضعیت"
          options={[
            { value: "all", label: "همه" },
            { value: "suspended", label: "معلق‌شده‌ها" },
          ]}
          value={status}
          onChange={(v) => update({ status: v })}
        />
      </div>

      {listings.error && !listings.data ? (
        <LoadError error={listings.error} onRetry={listings.refetch} />
      ) : !listings.data ? (
        <Skeleton className="h-48 rounded-lg" aria-hidden />
      ) : listings.data.length ? (
        <ul className={cn("divide-y rounded-lg border bg-card", listings.isFetching && "opacity-70")}>
          {listings.data.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-semibold">
                    <RouteLabel from={l.originCode} to={l.destinationCode} />
                  </span>
                  <bdi className="font-mono text-xs text-muted-foreground">{l.flightNo}</bdi>
                  {l.suspendedAt ? (
                    <span className="rounded-[5px] bg-destructive/10 px-1.5 py-0.5 text-xs text-destructive">معلق</span>
                  ) : null}
                  {l.agencySuspended ? (
                    <span className="rounded-[5px] bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                      آژانس معلق
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {l.agencyName} · {l.airline} · {formatJalaliDate(l.departAt)} ساعت {formatTime(l.departAt)} ·{" "}
                  {formatPrice(l.priceToman)}
                </p>
                {l.suspensionReason ? (
                  <p className="mt-1 text-xs text-destructive">دلیل: {l.suspensionReason}</p>
                ) : null}
              </div>
              {l.suspendedAt ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void apply(l, false).catch(() => undefined)}
                  disabled={busy === l.id}
                >
                  {busy === l.id ? <Loader2 className="animate-spin" aria-hidden /> : <RotateCcw aria-hidden />}
                  رفع تعلیق
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => suspend(l)} disabled={busy === l.id}>
                  <Ban aria-hidden />
                  تعلیق
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
          {status === "suspended" ? "پرواز معلقی نیست." : "پروازی با این مشخصات پیدا نشد."}
        </p>
      )}
      <ReasonDialog request={reason} onClose={() => setReason(null)} />
    </>
  );
}
