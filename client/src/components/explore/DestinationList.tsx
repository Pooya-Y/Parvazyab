import { Link } from "react-router";
import { ChevronLeft } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { airportDistinctName, airportShortCity } from "@/domain/airports";
import { formatDateKey, formatPrice, formatToman, toFaDigits } from "@/lib/persian";
import { searchUrl } from "@/lib/search-state";
import type { ExploreDestination } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Destinations ranked by lowest fare, prices in an aligned column. The full list
 * adds a thin bar under each destination, starting at zero (one data colour,
 * rounded data end), so a domestic fare next to an international one reads at a
 * glance. The teaser leaves it out: five close prices say more as numbers.
 * Each row searches from the airport its fare leaves from.
 */
export function DestinationList({
  destinations,
  compact = false,
  showOrigin = false,
  fetching = false,
}: {
  destinations: ExploreDestination[];
  /** Tighter rows without airline details or bars (landing teaser). */
  compact?: boolean;
  /** Name the departure airport (a city with several, such as Tehran). */
  showOrigin?: boolean;
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
              to={searchUrl({ from: d.originCode, to: d.code, date: d.cheapestDate })}
              aria-label={`${airportShortCity(d.code)}${showOrigin ? ` از ${airportDistinctName(d.originCode)}` : ""}، از ${formatPrice(d.minPrice)}، ارزان‌ترین روز ${when}`}
              className="grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-x-3 px-3 py-3 transition-colors hover:bg-accent md:grid-cols-[1.75rem_minmax(0,1fr)_auto_1rem] md:px-4"
            >
              <span className="text-center text-sm font-bold tabular-nums text-muted-foreground">
                {toFaDigits(i + 1)}
              </span>
              <span className="min-w-0">
                <span className="flex items-baseline gap-1.5">
                  <span className="truncate font-semibold">{airportShortCity(d.code)}</span>
                  <bdi className="font-mono text-xs text-muted-foreground">{d.code}</bdi>
                  {/* "Cheapest" only means something next to others. */}
                  {i === 0 && destinations.length > 1 ? (
                    <span className="rounded-sm border border-success/30 bg-success/10 px-1 text-[10px] font-medium text-success">
                      ارزان‌ترین
                    </span>
                  ) : null}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {showOrigin ? `از ${airportDistinctName(d.originCode)} · ` : null}
                  {when} · {toFaDigits(d.flights)} پرواز
                  {compact ? null : <span className="hidden sm:inline"> · {d.airlines.join("، ")}</span>}
                </span>
                {compact ? null : (
                  <span className="mt-2 block h-1.5 max-w-72" aria-hidden>
                    <span
                      className="block h-full rounded-e-[4px] bg-chart-1"
                      style={{ width: `${Math.max(4, (d.minPrice / max) * 100)}%` }}
                    />
                  </span>
                )}
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
        <div key={i} className="flex items-center gap-3 px-4 py-3.5">
          <Skeleton className="size-5" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-40" />
          </div>
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}
