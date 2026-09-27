import { useId, useRef, useState, type DragEvent, type ReactNode } from "react";
import { Copy, Download, FileSpreadsheet, KeyRound, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { FormError } from "@/components/auth/fields";
import { LoadError, RouteLabel } from "@/components/dashboard/common";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { ApiError, api, apiHref } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { columnLabel, describeRowError } from "@/lib/import-errors";
import {
  formatJalaliDate,
  formatJalaliWeekday,
  formatPrice,
  formatRelativeTime,
  formatTime,
  toFaDigits,
} from "@/lib/persian";
import { copyText } from "@/lib/share";
import type { ApiKey, ImportAction, ImportReport } from "@/lib/types";
import { invalidate, useApiQuery } from "@/lib/use-api-query";
import { cn } from "@/lib/utils";

const MAX_FILE_BYTES = 2 * 1024 * 1024;

const ACTION_LABEL: Record<ImportAction, string> = {
  create: "تازه",
  update: "به‌روزرسانی",
  unchanged: "بدون تغییر",
  error: "خطا",
};

const ACTION_STYLE: Record<ImportAction, string> = {
  create: "bg-success/10 text-success",
  update: "bg-chart-1/10 text-chart-1",
  unchanged: "bg-muted text-muted-foreground",
  error: "bg-destructive/10 text-destructive",
};

/** Errors first (they need attention), then what will change, then the rest. */
const ORDER: Record<ImportAction, number> = { error: 0, create: 1, update: 2, unchanged: 3 };

function Section({ title, description, children }: { title: string; description: ReactNode; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="rounded-lg border bg-card p-4 sm:p-6">
      <h3 id={id} className="font-semibold">
        {title}
      </h3>
      <p className="mt-1 mb-4 text-sm leading-7 text-muted-foreground">{description}</p>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// CSV import
// ---------------------------------------------------------------------------

function ReportTable({ report }: { report: ImportReport }) {
  const [showUnchanged, setShowUnchanged] = useState(false);
  const rows = [...report.rows]
    .filter((r) => showUnchanged || r.action !== "unchanged")
    .sort((a, b) => ORDER[a.action] - ORDER[b.action] || a.ref - b.ref);
  return (
    <div className="mt-4">
      <div className="max-h-[28rem] overflow-auto rounded-md border">
        <table className="w-full min-w-[36rem] text-sm">
          <caption className="sr-only">نتیجهٔ بررسی هر ردیف فایل</caption>
          <thead className="sticky top-0 z-10 bg-muted text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2 text-start font-medium">
                ردیف
              </th>
              <th scope="col" className="px-3 py-2 text-start font-medium">
                وضعیت
              </th>
              <th scope="col" className="px-3 py-2 text-start font-medium">
                پرواز
              </th>
              <th scope="col" className="px-3 py-2 text-start font-medium">
                قیمت / توضیح
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.ref} className="align-top">
                <td className="px-3 py-2 tabular-nums text-muted-foreground">{toFaDigits(r.ref)}</td>
                <td className="px-3 py-2">
                  <span className={cn("rounded-[5px] px-1.5 py-0.5 text-xs whitespace-nowrap", ACTION_STYLE[r.action])}>
                    {ACTION_LABEL[r.action]}
                  </span>
                </td>
                <td className="px-3 py-2">
                  {r.flight ? (
                    <>
                      <div>
                        <RouteLabel from={r.flight.originCode} to={r.flight.destinationCode} />{" "}
                        <bdi className="font-mono text-xs text-muted-foreground">{r.flight.flightNo}</bdi>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatJalaliWeekday(r.flight.departAt)}، {formatTime(r.flight.departAt)}
                      </div>
                    </>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {r.errors.length ? (
                    <ul className="space-y-0.5 text-xs leading-6 text-destructive">
                      {r.errors.map((e) => (
                        <li key={e}>{describeRowError(e)}</li>
                      ))}
                    </ul>
                  ) : r.flight ? (
                    <span className="tabular-nums">{formatPrice(r.flight.priceToman)}</span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {report.counts.unchanged > 0 ? (
        <button
          type="button"
          className="mt-2 text-xs font-medium text-primary underline-offset-4 hover:underline"
          onClick={() => setShowUnchanged((v) => !v)}
        >
          {showUnchanged ? "پنهان کردن" : "نمایش"} {toFaDigits(report.counts.unchanged)} ردیف بدون تغییر
        </button>
      ) : null}
    </div>
  );
}

function CsvImport() {
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [busy, setBusy] = useState<"preview" | "commit" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  const reset = () => {
    setFile(null);
    setReport(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const load = async (picked: File | undefined) => {
    if (!picked) return;
    reset();
    if (picked.size > MAX_FILE_BYTES) {
      setError("فایل بزرگ‌تر از ۲ مگابایت است. آن را چند بخش کنید.");
      return;
    }
    const text = await picked.text();
    setFile({ name: picked.name, text });
    setBusy("preview");
    try {
      setReport(await api.dashboard.importListings(text));
    } catch (err) {
      const missing =
        err instanceof ApiError && err.code === "CSV_MISSING_COLUMNS"
          ? ` ستون‌های کم: ${err.details.map(columnLabel).join("، ")}.`
          : err instanceof ApiError && err.code === "CSV_MALFORMED" && err.details[0]
            ? ` (${err.details[0].replace(/^line (\d+).*/, (_, n: string) => `ردیف ${toFaDigits(n)}`)})`
            : "";
      setError(errorMessage(err, "فایل بررسی نشد. دوباره تلاش کنید.") + missing);
    } finally {
      setBusy(null);
    }
  };

  const commit = async () => {
    if (!file || !report) return;
    setBusy("commit");
    try {
      const done = await api.dashboard.importListings(file.text, {
        commit: true,
        skipInvalid: report.counts.error > 0,
      });
      invalidate("listings");
      toast.success("پروازها ثبت شد", {
        description: `${toFaDigits(done.counts.create)} پرواز تازه، ${toFaDigits(done.counts.update)} به‌روزرسانی.`,
      });
      reset();
    } catch (err) {
      toast.error(errorMessage(err, "ثبت انجام نشد. دوباره تلاش کنید."));
    } finally {
      setBusy(null);
    }
  };

  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragging(false);
    void load(e.dataTransfer.files[0]);
  };

  const writable = report ? report.counts.create + report.counts.update : 0;

  return (
    <Section
      title="ورود گروهی با CSV"
      description="قالب را دانلود کنید، پروازها را در اکسل یا Google Sheets بنویسید و فایل را اینجا بیندازید. پیش از ثبت، نتیجهٔ هر ردیف را می‌بینید؛ پروازهای موجود به‌روز می‌شوند، نه تکراری."
    >
      <div className="mb-4 flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <a href={apiHref("/dashboard/listings/template.csv")} download>
            <FileSpreadsheet aria-hidden />
            دانلود قالب
          </a>
        </Button>
        <Button asChild variant="outline" size="sm">
          <a href={apiHref("/dashboard/listings/export.csv")} download>
            <Download aria-hidden />
            خروجی پروازهای فعلی
          </a>
        </Button>
      </div>

      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed px-4 py-7 text-center transition-colors focus-within:ring-[3px] focus-within:ring-ring/50",
          dragging ? "border-primary bg-primary/5" : "hover:bg-accent/40",
        )}
      >
        {busy === "preview" ? (
          <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
        ) : (
          <Upload className="size-5 text-muted-foreground" aria-hidden />
        )}
        <span className="text-sm font-medium">
          {busy === "preview" ? "در حال بررسی فایل…" : "فایل CSV را اینجا رها کنید یا برای انتخاب بزنید"}
        </span>
        <span className="text-xs text-muted-foreground">حداکثر ۲۰۰۰ ردیف · تاریخ‌ها شمسی یا میلادی، به وقت ایران</span>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          onChange={(e) => void load(e.target.files?.[0])}
          disabled={busy !== null}
        />
      </label>

      <FormError message={error} className="mt-3" />

      {report && file ? (
        <div className="mt-4" aria-live="polite">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <bdi className="font-medium">{file.name}</bdi>
            <span className="text-muted-foreground">
              {toFaDigits(report.counts.create)} تازه · {toFaDigits(report.counts.update)} به‌روزرسانی ·{" "}
              {toFaDigits(report.counts.unchanged)} بدون تغییر ·{" "}
              <span className={report.counts.error ? "font-medium text-destructive" : undefined}>
                {toFaDigits(report.counts.error)} خطا
              </span>
            </span>
          </p>
          <ReportTable report={report} />
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {writable > 0 ? (
              <Button onClick={() => void commit()} disabled={busy !== null}>
                {busy === "commit" ? <Loader2 className="animate-spin" aria-hidden /> : null}
                {report.counts.error
                  ? `ثبت ${toFaDigits(writable)} ردیف سالم و رد کردن ${toFaDigits(report.counts.error)} ردیف`
                  : `ثبت ${toFaDigits(writable)} تغییر`}
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">
                {report.counts.error ? "ردیف قابل ثبتی نیست؛ خطاها را در فایل درست کنید." : "همه‌چیز به‌روز است."}
              </p>
            )}
            <Button variant="ghost" onClick={reset} disabled={busy !== null}>
              انتخاب فایل دیگر
            </Button>
          </div>
        </div>
      ) : null}
    </Section>
  );
}

// ---------------------------------------------------------------------------
// API keys
// ---------------------------------------------------------------------------

function NewKeyDialog({ created, onClose }: { created: (ApiKey & { key: string }) | null; onClose: () => void }) {
  const copy = async () => {
    if (created && (await copyText(created.key))) toast.success("کلید کپی شد");
    else toast.error("کپی نشد؛ کلید را دستی انتخاب و کپی کنید.");
  };
  return (
    <Dialog open={created !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>کلید «{created?.name}» ساخته شد</DialogTitle>
          <DialogDescription>
            این کلید فقط همین یک بار نمایش داده می‌شود. آن را در سامانهٔ خود ذخیره کنید؛ اگر گم شد، کلید تازه بسازید.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Input
            readOnly
            dir="ltr"
            value={created?.key ?? ""}
            className="h-10 font-mono text-xs"
            onFocus={(e) => e.currentTarget.select()}
            aria-label="کلید API"
          />
          <Button variant="outline" className="h-10" onClick={() => void copy()}>
            <Copy aria-hidden />
            کپی
          </Button>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>ذخیره کردم</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ApiKeys() {
  const keys = useApiQuery("api-keys", (signal) => api.dashboard.apiKeys(signal), ["api-keys"]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<(ApiKey & { key: string }) | null>(null);
  const [now] = useState(() => Date.now());
  const inputId = useId();
  const full = (keys.data?.length ?? 0) >= 5;

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const key = await api.dashboard.createApiKey(name.trim());
      setCreated(key);
      setName("");
      keys.setData((prev) => [{ ...key, key: undefined } as ApiKey, ...(prev ?? [])]);
    } catch (err) {
      setError(errorMessage(err, "کلید ساخته نشد. دوباره تلاش کنید."));
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    try {
      await api.dashboard.revokeApiKey(id);
      keys.setData((prev) => prev?.filter((k) => k.id !== id));
      toast.success("کلید باطل شد");
    } catch (err) {
      toast.error(errorMessage(err, "ابطال انجام نشد. دوباره تلاش کنید."));
    }
  };

  return (
    <Section
      title="کلیدهای API"
      description="با کلید API، سامانهٔ فروش شما پروازها را خودکار ثبت و به‌روز می‌کند. هر کلید را فقط در یک سامانه به کار ببرید تا در صورت نیاز جداگانه باطلش کنید."
    >
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) void create();
        }}
      >
        <label htmlFor={inputId} className="sr-only">
          نام کلید
        </label>
        <Input
          id={inputId}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="نام کلید، مثلاً سامانهٔ فروش"
          maxLength={60}
          className="h-10 sm:max-w-72"
          disabled={busy || full}
        />
        <Button type="submit" className="h-10" disabled={busy || full || !name.trim()}>
          {busy ? <Loader2 className="animate-spin" aria-hidden /> : <KeyRound aria-hidden />}
          ساخت کلید
        </Button>
      </form>
      {full ? (
        <p className="mt-2 text-xs text-muted-foreground">حداکثر ۵ کلید فعال؛ برای کلید تازه یکی را باطل کنید.</p>
      ) : null}
      <FormError message={error} className="mt-2" />

      <div className="mt-4">
        {keys.error && !keys.data ? (
          <LoadError error={keys.error} onRetry={keys.refetch} />
        ) : keys.isLoading ? (
          <Skeleton className="h-16 rounded-md" aria-hidden />
        ) : keys.data?.length ? (
          <ul className="divide-y rounded-md border">
            {keys.data.map((k) => (
              <li key={k.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{k.name}</div>
                  <div className="text-xs text-muted-foreground">
                    <bdi dir="ltr" className="font-mono">
                      pvz_{k.prefix}_…
                    </bdi>{" "}
                    · ساخته‌شده {formatJalaliDate(k.createdAt)} · آخرین استفاده{" "}
                    {k.lastUsedAt ? formatRelativeTime(k.lastUsedAt, now) : "هرگز"}
                  </div>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive">
                      <Trash2 aria-hidden />
                      ابطال
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>کلید «{k.name}» باطل شود؟</AlertDialogTitle>
                      <AlertDialogDescription>
                        هر سامانه‌ای که با این کلید کار می‌کند از همین لحظه دسترسی‌اش را از دست می‌دهد. این کار
                        برگشت‌پذیر نیست.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>انصراف</AlertDialogCancel>
                      <AlertDialogAction onClick={() => void revoke(k.id)}>ابطال کلید</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">هنوز کلیدی نساخته‌اید.</p>
        )}
      </div>
      <NewKeyDialog created={created} onClose={() => setCreated(null)} />
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Docs
// ---------------------------------------------------------------------------

function ApiDocs() {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const example = `curl -X PUT "${origin}${apiHref("/v1/listings")}?dryRun=true" \\
  -H "Authorization: Bearer pvz_…" \\
  -H "Content-Type: application/json" \\
  -d '{"listings":[{"originCode":"THR","destinationCode":"MHD","airline":"ماهان ایر",
       "flightNo":"W5-1071","departAt":"2026-10-05T08:30:00+03:30",
       "arriveAt":"2026-10-05T10:00:00+03:30","cabin":"economy",
       "priceToman":2450000,"bookingUrl":"https://agency.example/book/W5-1071"}]}'`;
  return (
    <Section
      title="شروع سریع با API"
      description="همان قواعد ورود گروهی: پروازی که دوباره فرستاده شود به‌روز می‌شود. با dryRun=true فقط نتیجه را ببینید، بدون ثبت."
    >
      <pre dir="ltr" className="overflow-x-auto rounded-md border bg-muted/40 p-3 text-start text-xs leading-6">
        <code>{example}</code>
      </pre>
      <p className="mt-3 text-sm">
        <a
          href={apiHref("/v1/openapi.json")}
          target="_blank"
          rel="noopener"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          مستندات کامل (OpenAPI)
        </a>
        <span className="text-muted-foreground"> · حداکثر ۱۲۰ درخواست در دقیقه برای هر کلید</span>
      </p>
    </Section>
  );
}

export default function AgencyToolsPage() {
  useDocumentTitle("ورود گروهی و API");
  return (
    <>
      <h2 className="mb-1 text-lg font-bold">ورود گروهی و API</h2>
      <p className="mb-4 text-sm leading-7 text-muted-foreground">
        پروازها را یک‌جا با فایل CSV ثبت و به‌روز کنید، یا سامانهٔ فروش خود را از طریق API وصل کنید.
      </p>
      <div className="space-y-4">
        <CsvImport />
        <ApiKeys />
        <ApiDocs />
      </div>
    </>
  );
}
