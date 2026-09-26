import { Link } from "react-router";
import { ChevronLeft } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { airportShortCity } from "@/domain/airports";
import { formatDateKey, formatPrice, formatToman, toFaDigits } from "@/lib/persian";
import { searchUrl } from "@/lib/search-state";
import type { ExploreDestination } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Destinations ranked by lowest fare. Prices sit in an aligned column; a thin bar
 * starting at zero shows magnitude (one data colour, rounded data end).
 */
export function DestinationList({
  originCode,
  destinations,
  compact = false,
  fetching = false,
}: {
  originCode: string;
  destinations: ExploreDestination[];
  /** Tighter rows without airline details (landing teaser). */
  compact?: boolean;
  /** Refetching: hold the previous render, dimmed. */
  fetching?: boolean;
}) {
  const max = Math.max(...destinations.map((d) => d.minPrice));
  return (
    <ol
      className={cn("divide-y overflow-hidden rounded-lg border bg-card transition-opacity", fetching && "opacity-60")}
      aria-busy={fetching}
    >
      {destinations.map((d, i) => {
        const when = formatDateKey(d.cheapestDate, { weekday: true });
        return (
          <li key={d.code}>
            <Link
              to={searchUrl({ from: originCode, to: d.code, date: d.cheapestDate })}
              aria-label={`${airportShortCity(d.code)}، از ${formatPrice(d.minPrice)}، ارزان‌ترین روز ${when}`}
              className="grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 px-3 py-3 transition-colors hover:bg-accent md:grid-cols-[1.75rem_minmax(0,1fr)_minmax(9rem,35%)_7.5rem_1rem] md:px-4"
            >
              <span className="text-center text-sm font-bold tabular-nums text-muted-foreground">
                {toFaDigits(i + 1)}
              </span>
              <span className="min-w-0">
                <span className="flex items-baseline gap-1.5">
                  <span className="truncate font-semibold">{airportShortCity(d.code)}</span>
                  <bdi className="font-mono text-xs text-muted-foreground">{d.code}</bdi>
                  {i === 0 ? (
                    <span className="rounded-sm border border-success/30 bg-success/10 px-1 text-[10px] font-medium text-success">
                      ارزان‌ترین
                    </span>
                  ) : null}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {when} · {toFaDigits(d.flights)} پرواز
                  {compact ? null : <span className="hidden sm:inline"> · {d.airlines.join("، ")}</span>}
                </span>
              </span>
              {/* Bar spans the full row on phones, its own column from md. */}
              <span
                className="col-span-3 col-start-1 row-start-2 h-2 rounded-e-[4px] md:col-span-1 md:col-start-3 md:row-start-1"
                aria-hidden
              >
                <span
                  className="block h-full rounded-e-[4px] bg-chart-1"
                  style={{ width: `${Math.max(4, (d.minPrice / max) * 100)}%` }}
                />
              </span>
              <span className="text-end">
                <span className="block font-bold tabular-nums">{formatToman(d.minPrice)}</span>
                <span className="block text-[11px] text-muted-foreground">تومان</span>
              </span>
              <ChevronLeft className="hidden size-4 text-muted-foreground md:block" aria-hidden />
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

export function DestinationListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="divide-y rounded-lg border bg-card" role="status" aria-label="در حال بارگذاری مقصدها">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-4">
          <Skeleton className="size-5" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="ms-auto h-2 w-1/3" />
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}
