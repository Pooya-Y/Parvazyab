import { useState, type ReactNode } from "react";
import { MousePointerClick, TrendingDown, TrendingUp, Users } from "lucide-react";
import { DailyBarsChart } from "@/components/charts/DailyBarsChart";
import { LoadError, RouteLabel, StatBox } from "@/components/dashboard/common";
import { Segmented } from "@/components/Segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { api } from "@/lib/api";
import { formatJalaliWeekday, formatTime, toFaDigits } from "@/lib/persian";
import type { ClickStats } from "@/lib/types";
import { useApiQuery } from "@/lib/use-api-query";

type Period = 7 | 30 | 90;

const PERIODS: { value: Period; label: string }[] = [
  { value: 7, label: "۷ روز" },
  { value: 30, label: "۳۰ روز" },
  { value: 90, label: "۹۰ روز" },
];

const SOURCE_LABEL: Record<keyof ClickStats["sources"], string> = {
  search: "نتایج جستجو",
  detail: "صفحهٔ جزئیات پرواز",
  roundtrip: "جستجوی رفت و برگشت",
  other: "سایر",
};

/** "۱۲٪ بیشتر از ۳۰ روز قبل", or null when there's nothing to compare with. */
function trend(stats: ClickStats): { text: string; up: boolean } | null {
  if (stats.previousClicks === 0) return null;
  const change = (stats.clicks - stats.previousClicks) / stats.previousClicks;
  const percent = toFaDigits(Math.round(Math.abs(change) * 100));
  return { text: `${percent}٪ ${change >= 0 ? "بیشتر" : "کمتر"}`, up: change >= 0 };
}

/** Rows of name, count and a magnitude bar; the text stays in ink, the bar carries the size. */
function RankedList({
  rows,
  caption,
}: {
  rows: { key: string; label: ReactNode; detail?: ReactNode; value: number }[];
  caption: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ol className="space-y-3" aria-label={caption}>
      {rows.map((r) => (
        <li key={r.key}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">{r.label}</span>
            <span className="shrink-0 font-semibold tabular-nums">{toFaDigits(r.value)}</span>
          </div>
          {r.detail ? <div className="text-xs text-muted-foreground">{r.detail}</div> : null}
          <div className="mt-1.5 h-1.5 rounded-full bg-muted" aria-hidden>
            <div className="h-full rounded-full bg-chart-1" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ol>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border bg-card p-4 sm:p-5" aria-label={title}>
      <h3 className="mb-4 text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

export default function AgencyInsightsPage() {
  useDocumentTitle("آمار بازدید");
  const [days, setDays] = useState<Period>(30);
  const stats = useApiQuery(`clicks:${days}`, (signal) => api.dashboard.clicks(days, signal), ["clicks"]);
  const data = stats.data;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">آمار بازدید</h2>
          <p className="text-sm leading-7 text-muted-foreground">
            هر بار که مسافری روی «خرید» یکی از پروازهای شما بزند، یک کلیک ثبت می‌شود.
          </p>
        </div>
        <Segmented legend="بازهٔ زمانی" options={PERIODS} value={days} onChange={setDays} />
      </div>

      {stats.error && !data ? (
        <LoadError error={stats.error} onRetry={stats.refetch} />
      ) : !data ? (
        <div className="space-y-4" aria-hidden>
          <div className="grid gap-3 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-20 rounded-lg" />
            ))}
          </div>
          <Skeleton className="h-56 rounded-lg" />
        </div>
      ) : (
        <div className={stats.isFetching ? "opacity-70 transition-opacity" : undefined}>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatBox icon={MousePointerClick} label="کلیک خرید" value={toFaDigits(data.clicks)} />
            <StatBox icon={Users} label="بازدیدکنندهٔ یکتا" value={toFaDigits(data.visitors)} />
            {(() => {
              const t = trend(data);
              return (
                <StatBox
                  icon={t?.up === false ? TrendingDown : TrendingUp}
                  label={`نسبت به ${toFaDigits(days)} روز قبل`}
                  value={t ? t.text : "—"}
                />
              );
            })()}
          </div>

          <section className="mt-4 rounded-lg border bg-card p-4 sm:p-5" aria-labelledby="clicks-per-day">
            <h3 id="clicks-per-day" className="mb-3 text-sm font-semibold">
              کلیک‌ها در هر روز
            </h3>
            {data.clicks === 0 ? (
              <p className="py-10 text-center text-sm leading-7 text-muted-foreground">
                در این بازه کلیکی ثبت نشده است. وقتی مسافران روی «خرید» پروازهای شما بزنند، آمارش اینجا می‌آید.
              </p>
            ) : (
              <DailyBarsChart
                points={data.daily.map((d) => ({ date: d.date, value: d.clicks }))}
                label={`کلیک‌های خرید در هر روز، ${toFaDigits(days)} روز اخیر`}
                unit="کلیک"
              />
            )}
          </section>

          {data.clicks > 0 ? (
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <Panel title="پرکلیک‌ترین پروازها">
                <RankedList
                  caption="پرکلیک‌ترین پروازها"
                  rows={data.topListings.map((l, i) => ({
                    key: `${l.listingId ?? "deleted"}-${i}`,
                    label: (
                      <>
                        <RouteLabel from={l.originCode} to={l.destinationCode} />{" "}
                        <span className="text-muted-foreground">
                          · {l.airline} <bdi className="font-mono text-xs">{l.flightNo}</bdi>
                        </span>
                      </>
                    ),
                    detail: `${formatJalaliWeekday(l.departAt)}، ساعت ${formatTime(l.departAt)}${
                      l.listingId ? "" : " · حذف‌شده"
                    }`,
                    value: l.clicks,
                  }))}
                />
              </Panel>
              <div className="grid gap-4">
                <Panel title="مسیرها">
                  <RankedList
                    caption="کلیک‌ها به تفکیک مسیر"
                    rows={data.routes.map((r) => ({
                      key: `${r.originCode}-${r.destinationCode}`,
                      label: <RouteLabel from={r.originCode} to={r.destinationCode} />,
                      value: r.clicks,
                    }))}
                  />
                </Panel>
                <Panel title="از کجای پروازیاب">
                  <RankedList
                    caption="کلیک‌ها به تفکیک صفحه"
                    rows={(Object.keys(SOURCE_LABEL) as (keyof ClickStats["sources"])[])
                      .filter((s) => data.sources[s] > 0)
                      .map((s) => ({ key: s, label: SOURCE_LABEL[s], value: data.sources[s] }))}
                  />
                </Panel>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </>
  );
}
