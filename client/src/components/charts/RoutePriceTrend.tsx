import { useId, useState } from "react";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { formatPrice, toFaDigits } from "@/lib/persian";
import { useApiQuery } from "@/lib/use-api-query";
import type { PriceHistory } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PriceHistoryChart } from "./PriceHistoryChart";

const HISTORY_DAYS = 60;

function Verdict({ history }: { history: PriceHistory }) {
  const s = history.summary;
  const days = toFaDigits(history.points.length);
  if (!s) return <p className="text-xs text-muted-foreground">هنوز داده کافی برای مقایسه قیمت امروز نداریم.</p>;
  const pct = `${toFaDigits(Math.abs(s.deltaPercent))}٪`;
  // Status is always icon + words; colour only reinforces it.
  const [Icon, iconClass, text] =
    s.verdict === "below"
      ? [TrendingDown, "text-success", `امروز ${pct} ارزان‌تر از میانگین ${days} روز گذشته`]
      : s.verdict === "above"
        ? [TrendingUp, "text-destructive", `امروز ${pct} گران‌تر از میانگین ${days} روز گذشته`]
        : [Minus, "text-muted-foreground", `قیمت امروز نزدیک به میانگین ${days} روز گذشته است`];
  return (
    <p className="flex items-start gap-1.5 text-sm">
      <Icon className={cn("mt-0.5 size-4 shrink-0", iconClass)} aria-hidden />
      <span>
        {text}
        <span className="text-muted-foreground"> · کمترین این دوره {formatPrice(s.low)}</span>
      </span>
    </p>
  );
}

/** "Is today's price good?" for a route: a verdict line plus the 60-day trend chart. */
export function RoutePriceTrend({
  originCode,
  destinationCode,
  collapsible = false,
  className,
}: {
  originCode: string;
  destinationCode: string;
  /** Start with just the verdict and a toggle (results page). */
  collapsible?: boolean;
  className?: string;
}) {
  const headingId = useId();
  const chartId = useId();
  const [open, setOpen] = useState(!collapsible);
  const history = useApiQuery(`history:${originCode}:${destinationCode}`, (signal) =>
    api.priceHistory(originCode, destinationCode, HISTORY_DAYS, signal),
  );

  // Trends are a bonus: never let them break or crowd the page.
  if (history.error && !history.data) return null;
  if (history.isLoading) return <Skeleton className={cn("h-16 rounded-lg", className)} />;
  const data = history.data;
  if (!data || data.points.length < 2) return null;

  return (
    <section aria-labelledby={headingId} className={cn("rounded-lg border bg-card p-3 md:p-4", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 id={headingId} className="text-sm font-semibold">
            روند قیمت {toFaDigits(data.points.length)} روز اخیر
          </h2>
          <Verdict history={data} />
        </div>
        {collapsible ? (
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0"
            aria-expanded={open}
            aria-controls={chartId}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "بستن نمودار" : "نمایش نمودار"}
          </Button>
        ) : null}
      </div>
      {open ? (
        <div id={chartId} className="mt-3">
          <PriceHistoryChart
            points={data.points}
            average={data.summary?.average}
            label={`نمودار کمترین قیمت روزانه در ${toFaDigits(data.points.length)} روز اخیر`}
          />
        </div>
      ) : null}
    </section>
  );
}
