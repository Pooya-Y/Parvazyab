import { useCallback, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { ChevronLeft, ChevronRight, RotateCcw, SearchX, SlidersHorizontal, WifiOff } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { SearchWidget } from "@/components/flights/SearchWidget";
import { FlightCard } from "@/components/flights/FlightCard";
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
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { useApiQuery } from "@/lib/use-api-query";
import { airportShortCity } from "@/domain/airports";
import { addDaysToKey, formatDateKey, toFaDigits, todayKey } from "@/lib/persian";
import {
  DEFAULT_FILTERS,
  SORT_OPTIONS,
  activeFilterCount,
  parseSearchState,
  searchUrl,
  toApiParams,
  toSearchParams,
  type SearchFiltersState,
  type SearchState,
} from "@/lib/search-state";
import type { SortMode } from "@/lib/types";
import { useAuth } from "@/hooks/use-auth";
import { useSavedFlights } from "@/hooks/use-saved-flights";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { cn } from "@/lib/utils";

const PROBLEM_TEXT = {
  missing: "مبدا و مقصد مشخص نشده است.",
  "unknown-airport": "فرودگاه واردشده در فهرست پروازیاب نیست.",
  "same-airport": "مبدا و مقصد نمی‌توانند یکسان باشند.",
} as const;

export default function Search() {
  const [params, setParams] = useSearchParams();
  const { state, problem } = useMemo(() => parseSearchState(params), [params]);
  const routeKey = `${state.from}-${state.to}-${state.date ?? "any"}`;

  useDocumentTitle(
    problem ? "جستجوی نامعتبر" : `بلیط هواپیما ${airportShortCity(state.from)} به ${airportShortCity(state.to)}`,
  );

  const updateFilters = useCallback(
    (patch: Partial<SearchFiltersState>) => {
      // Filter tweaks replace the history entry so "back" returns to the previous search, not the previous checkbox.
      setParams((prev) => toSearchParams({ ...parseSearchState(prev).state, ...patch }), { replace: true });
    },
    [setParams],
  );

  if (problem) {
    return (
      <PageShell className="container-page py-10">
        <StateMessage
          icon={SearchX}
          title="جستجوی نامعتبر"
          description={`${PROBLEM_TEXT[problem]} مسیر را دوباره انتخاب کنید.`}
          action={
            <Button asChild>
              <Link to="/">جستجوی دوباره</Link>
            </Button>
          }
        />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="border-b bg-muted/30">
        <div className="container-page py-3 md:py-4">
          <SearchWidget
            key={routeKey}
            compact
            initial={{ originCode: state.from, destinationCode: state.to, date: state.date ?? null }}
          />
        </div>
      </div>
      {/* Remount per route so a new route shows skeletons instead of the previous route's flights. */}
      <SearchResults key={routeKey} state={state} onChange={updateFilters} />
    </PageShell>
  );
}

function SearchResults({
  state,
  onChange,
}: {
  state: SearchState;
  onChange: (patch: Partial<SearchFiltersState>) => void;
}) {
  const { isAuthenticated } = useAuth();
  const saved = useSavedFlights();
  const [filtersOpen, setFiltersOpen] = useState(false);

  const apiParams = toApiParams(state);
  const facets = useApiQuery(`facets:${state.from}:${state.to}:${state.date ?? ""}`, (signal) =>
    api.searchFacets({ originCode: state.from, destinationCode: state.to, date: state.date }, signal),
  );
  const results = useApiQuery(`search:${JSON.stringify(apiParams)}`, (signal) => api.search(apiParams, signal));

  const flights = results.data ?? [];
  const total = facets.data?.total;
  const filterCount = activeFilterCount(state);
  const clearFilters = () => onChange({ ...DEFAULT_FILTERS, sort: state.sort });
  const summary = results.isLoading
    ? "در حال جستجوی پروازها…"
    : results.error
      ? "دریافت نتایج ناموفق بود"
      : filterCount > 0 && total !== undefined
        ? `${toFaDigits(flights.length)} پرواز از ${toFaDigits(total)} پرواز`
        : `${toFaDigits(flights.length)} پرواز`;

  let body;
  if (results.error && !results.data) {
    body = (
      <StateMessage
        tone="error"
        icon={WifiOff}
        title="نتایج دریافت نشد"
        description={errorMessage(results.error, "در دریافت نتایج مشکلی پیش آمد.")}
        action={
          <Button
            variant="outline"
            onClick={() => {
              results.refetch();
              facets.refetch();
            }}
          >
            <RotateCcw />
            تلاش دوباره
          </Button>
        }
      />
    );
  } else if (results.isLoading) {
    body = (
      <div className="space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <FlightCardSkeleton key={i} />
        ))}
      </div>
    );
  } else if (flights.length === 0) {
    const filteredOut = filterCount > 0 && (total ?? 0) > 0;
    body = filteredOut ? (
      <StateMessage
        icon={SearchX}
        title="پروازی با این فیلترها پیدا نشد"
        description={`در این مسیر ${toFaDigits(total ?? 0)} پرواز هست، اما هیچ‌کدام با فیلترهای انتخابی جور نیست.`}
        action={
          <Button variant="outline" onClick={clearFilters}>
            <RotateCcw />
            حذف فیلترها
          </Button>
        }
      />
    ) : (
      <StateMessage
        icon={SearchX}
        title={state.date ? "برای این روز پروازی پیدا نشد" : "فعلاً پروازی در این مسیر نیست"}
        description={
          state.date
            ? "روزهای دیگر را امتحان کنید یا همه پروازهای پیش‌روی این مسیر را ببینید."
            : "آژانس‌ها هنوز پروازی برای این مسیر ثبت نکرده‌اند. مسیر دیگری را امتحان کنید."
        }
        action={
          state.date ? (
            <Button asChild variant="outline">
              <Link to={searchUrl({ from: state.from, to: state.to })}>نمایش همه روزها</Link>
            </Button>
          ) : (
            <Button asChild variant="outline">
              <Link to="/">جستجوی مسیر دیگر</Link>
            </Button>
          )
        }
      />
    );
  } else {
    body = (
      <ul
        className={cn("space-y-3 transition-opacity", results.isFetching && "opacity-60")}
        aria-busy={results.isFetching}
      >
        {flights.map((f, i) => (
          <li key={f.id}>
            <FlightCard
              flight={f}
              recommended={state.sort === "best" && i === 0 && flights.length > 1}
              date={state.date}
              saved={saved.savedKeys.has(f.id)}
              savePending={saved.pending.has(f.id)}
              onToggleSave={isAuthenticated ? saved.toggle : undefined}
            />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="container-page py-4 md:py-6 lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start lg:gap-6">
      <aside className="hidden rounded-xl border bg-card p-4 lg:sticky lg:top-20 lg:block" aria-label="فیلتر نتایج">
        <SearchFilters facets={facets.data} filters={state} onChange={onChange} />
      </aside>

      <section aria-labelledby="results-heading" className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="min-w-0">
            <h1 id="results-heading" className="text-lg font-bold md:text-xl">
              {airportShortCity(state.from)} به {airportShortCity(state.to)}
            </h1>
            <p className="text-sm text-muted-foreground" role="status">
              {state.date ? `${formatDateKey(state.date, { weekday: true })} · ` : "همه روزها · "}
              {summary}
            </p>
          </div>

          <div className="flex w-full items-center gap-2 sm:w-auto">
            <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" className="flex-1 sm:flex-none lg:hidden">
                  <SlidersHorizontal aria-hidden />
                  فیلترها
                  {filterCount > 0 ? (
                    <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[11px] text-primary-foreground">
                      {toFaDigits(filterCount)}
                    </span>
                  ) : null}
                </Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="max-h-[85dvh] gap-0 rounded-t-2xl">
                <SheetHeader className="border-b pb-3">
                  <SheetTitle>فیلتر نتایج</SheetTitle>
                  <SheetDescription className="sr-only">تغییرات بلافاصله روی نتایج اعمال می‌شود.</SheetDescription>
                </SheetHeader>
                <div className="overflow-y-auto px-4 pb-4">
                  <SearchFilters facets={facets.data} filters={state} onChange={onChange} showTitle={false} />
                </div>
                <SheetFooter className="border-t">
                  <Button onClick={() => setFiltersOpen(false)} className="h-11 w-full">
                    {results.isFetching ? "در حال به‌روزرسانی…" : `نمایش ${toFaDigits(flights.length)} پرواز`}
                  </Button>
                </SheetFooter>
              </SheetContent>
            </Sheet>

            <Select value={state.sort} onValueChange={(v) => onChange({ sort: v as SortMode })}>
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
          </div>
        </div>

        {state.date ? <DayStepper state={state} /> : null}

        {results.error && results.data ? (
          <p
            className="mb-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            role="alert"
          >
            {errorMessage(results.error, "به‌روزرسانی نتایج ناموفق بود.")}{" "}
            <button type="button" className="font-semibold underline" onClick={results.refetch}>
              تلاش دوباره
            </button>
          </p>
        ) : null}

        {body}

        {!isAuthenticated && flights.length > 0 ? (
          <p className="mt-4 text-center text-xs text-muted-foreground">
            برای ذخیره پروازها و مقایسه بعدی،{" "}
            <Link
              to={`/auth?returnTo=${encodeURIComponent(`/search?${toSearchParams(state)}`)}`}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              وارد شوید
            </Link>
            .
          </p>
        ) : null}
      </section>
    </div>
  );
}

/** Previous/next day shortcuts for a dated search (no going before today). */
function DayStepper({ state }: { state: SearchState }) {
  if (!state.date) return null;
  const prev = addDaysToKey(state.date, -1);
  const next = addDaysToKey(state.date, 1);
  const hrefFor = (date: string) => `/search?${toSearchParams({ ...state, date })}`;
  return (
    <nav className="mb-3 flex items-center justify-between gap-2" aria-label="تغییر روز">
      {prev >= todayKey() ? (
        <Button asChild variant="ghost" size="sm">
          <Link to={hrefFor(prev)}>
            <ChevronRight aria-hidden />
            روز قبل
          </Link>
        </Button>
      ) : (
        <span />
      )}
      <Button asChild variant="ghost" size="sm">
        <Link to={hrefFor(next)}>
          روز بعد
          <ChevronLeft aria-hidden />
        </Link>
      </Button>
    </nav>
  );
}
