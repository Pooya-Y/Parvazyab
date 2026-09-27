/**
 * Building blocks shared by one-way and round-trip results: per-leg data, the
 * filter panel/sheet, the sort control and the results body with its
 * loading / error / empty states.
 */
import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { Loader2, RotateCcw, SearchX, SlidersHorizontal, WifiOff } from "lucide-react";
import { FlightCardSkeleton } from "@/components/flights/FlightCardSkeleton";
import { SearchFilters } from "@/components/flights/SearchFilters";
import { StateMessage } from "@/components/StateMessage";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { errorMessage } from "@/lib/errors";
import { toFaDigits } from "@/lib/persian";
import { CLEARED_FILTERS, SORT_OPTIONS, legPatch, type SearchState } from "@/lib/search-state";
import type { Flight, SortMode } from "@/lib/types";
import { SEARCH_PAGE_SIZE, type PagedSearch } from "@/lib/use-paged-search";
import type { LegResults } from "./use-leg-results";
import { cn } from "@/lib/utils";

type FilterChange = (patch: Partial<SearchState>) => void;

export function FiltersAside({ data, onChange }: { data: LegResults; onChange: FilterChange }) {
  return (
    // Sticky, so it scrolls on its own when taller than the window (below the 5rem header offset).
    <aside
      className="hidden rounded-lg border bg-card p-4 [scrollbar-width:thin] lg:sticky lg:top-20 lg:block lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto lg:overscroll-contain"
      aria-label="فیلتر نتایج"
    >
      <SearchFilters
        facets={data.facets.data}
        filters={data.filters}
        onChange={(patch) => onChange(legPatch(data.leg, patch))}
      />
    </aside>
  );
}

export function FiltersSheetButton({ data, onChange }: { data: LegResults; onChange: FilterChange }) {
  const [open, setOpen] = useState(false);
  const count = data.results.total ?? 0;
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" className="flex-1 sm:flex-none lg:hidden">
          <SlidersHorizontal aria-hidden />
          فیلترها
          {data.filterCount > 0 ? (
            <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[11px] text-primary-foreground">
              {toFaDigits(data.filterCount)}
            </span>
          ) : null}
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[85dvh] gap-0 rounded-t-xl">
        <SheetHeader className="border-b pb-3">
          <SheetTitle>فیلتر نتایج</SheetTitle>
          <SheetDescription className="sr-only">تغییرات بلافاصله روی نتایج اعمال می‌شود.</SheetDescription>
        </SheetHeader>
        <div className="overflow-y-auto p-4">
          <SearchFilters
            facets={data.facets.data}
            filters={data.filters}
            onChange={(patch) => onChange(legPatch(data.leg, patch))}
            showTitle={false}
          />
        </div>
        <SheetFooter className="border-t">
          <Button onClick={() => setOpen(false)} className="h-11 w-full">
            {data.results.first.isFetching ? "در حال به‌روزرسانی…" : `نمایش ${toFaDigits(count)} پرواز`}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export function SortSelect({ value, onChange }: { value: SortMode; onChange: (sort: SortMode) => void }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as SortMode)}>
      <SelectTrigger className="h-9 flex-1 sm:w-48 sm:flex-none" aria-label="مرتب‌سازی نتایج">
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {SORT_OPTIONS.map((s) => (
          <SelectItem key={s.value} value={s.value}>
            {s.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Results list with its loading, error and two kinds of empty state. */
export function ResultsBody({
  data,
  onChange,
  noFlights,
  renderCard,
}: {
  data: LegResults;
  onChange: FilterChange;
  /** Empty state when the route/day has no flights at all. */
  noFlights: ReactNode;
  /** `total`: flights matching the search across every page. */
  renderCard: (flight: Flight, index: number, total: number) => ReactNode;
}) {
  const { results, facets, filterCount } = data;
  const { first } = results;
  const routeTotal = facets.data?.total ?? 0;

  if (first.error && !first.data) {
    return (
      <StateMessage
        tone="error"
        icon={WifiOff}
        title="نتایج دریافت نشد"
        description={errorMessage(first.error, "در دریافت نتایج مشکلی پیش آمد.")}
        action={
          <Button
            variant="outline"
            onClick={() => {
              first.refetch();
              facets.refetch();
            }}
          >
            <RotateCcw />
            تلاش دوباره
          </Button>
        }
      />
    );
  }
  if (first.isLoading) {
    return (
      <div className="space-y-3" role="status" aria-label="در حال بارگذاری نتایج">
        {[0, 1, 2, 3].map((i) => (
          <FlightCardSkeleton key={i} />
        ))}
      </div>
    );
  }
  if (results.flights.length === 0) {
    return filterCount > 0 && routeTotal > 0 ? (
      <StateMessage
        icon={SearchX}
        title="پروازی با این فیلترها پیدا نشد"
        description={`در این مسیر ${toFaDigits(routeTotal)} پرواز هست، اما هیچ‌کدام با فیلترهای انتخابی جور نیست.`}
        action={
          <Button variant="outline" onClick={() => onChange(legPatch(data.leg, CLEARED_FILTERS))}>
            <RotateCcw />
            حذف فیلترها
          </Button>
        }
      />
    ) : (
      noFlights
    );
  }
  return (
    <>
      {first.error ? (
        <p
          className="mb-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {errorMessage(first.error, "به‌روزرسانی نتایج ناموفق بود.")}{" "}
          <button type="button" className="font-semibold underline" onClick={first.refetch}>
            تلاش دوباره
          </button>
        </p>
      ) : null}
      <PagedFlightList results={results} renderCard={renderCard} />
    </>
  );
}

/**
 * The flights fetched so far, and the next ten from the server as the end of the
 * list comes near. The button does the same for keyboards and browsers without
 * IntersectionObserver, and retries when a page fails.
 */
function PagedFlightList({
  results,
  renderCard,
}: {
  results: PagedSearch;
  renderCard: (flight: Flight, index: number, total: number) => ReactNode;
}) {
  const { flights, hasMore, loadingMore, moreError } = results;
  const total = results.total ?? flights.length;
  const end = useRef<HTMLDivElement>(null);
  const reachedEnd = useEffectEvent(() => results.loadMore());

  useEffect(() => {
    const target = end.current;
    if (!target || !hasMore || loadingMore || moreError || typeof IntersectionObserver === "undefined") return;
    // A new observer reports the current state at once: if the end is still in
    // reach after a page arrives (a tall screen), the next page follows.
    const observer = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && reachedEnd(), {
      rootMargin: "0px 0px 400px 0px",
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, moreError, flights.length]);

  const busy = results.first.isFetching;
  return (
    <>
      <ul className={cn("space-y-3 transition-opacity", busy && "opacity-60")} aria-busy={busy}>
        {flights.map((f, i) => (
          <li key={f.id}>{renderCard(f, i, total)}</li>
        ))}
      </ul>
      {hasMore ? (
        <div ref={end} className="mt-4 flex flex-col items-center gap-2">
          <p className="text-xs text-muted-foreground" role="status">
            {moreError
              ? errorMessage(moreError, "دریافت پروازهای بیشتر ناموفق بود.")
              : `${toFaDigits(flights.length)} از ${toFaDigits(total)} پرواز`}
          </p>
          <Button variant="outline" onClick={results.loadMore} disabled={loadingMore}>
            {loadingMore ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : moreError ? (
              <RotateCcw aria-hidden />
            ) : null}
            {loadingMore
              ? "در حال دریافت…"
              : moreError
                ? "تلاش دوباره"
                : `نمایش ${toFaDigits(Math.min(SEARCH_PAGE_SIZE, total - flights.length))} پرواز دیگر`}
          </Button>
        </div>
      ) : total > SEARCH_PAGE_SIZE ? (
        <p className="mt-4 text-center text-xs text-muted-foreground" role="status">
          همهٔ {toFaDigits(total)} پرواز نمایش داده شد.
        </p>
      ) : null}
    </>
  );
}

export function SignInHint({ returnTo }: { returnTo: string }) {
  return (
    <p className="mt-4 text-center text-xs text-muted-foreground">
      برای ذخیره پروازها و مقایسه بعدی،{" "}
      <Link
        to={`/auth?returnTo=${encodeURIComponent(returnTo)}`}
        className="font-medium text-primary underline-offset-4 hover:underline"
      >
        وارد شوید
      </Link>
      .
    </p>
  );
}
