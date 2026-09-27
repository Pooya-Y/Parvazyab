/**
 * Building blocks shared by one-way and round-trip results: per-leg data, the
 * filter panel/sheet, the sort control and the results body with its
 * loading / error / empty states.
 */
import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import { RotateCcw, SearchX, SlidersHorizontal, WifiOff } from "lucide-react";
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
import type { LegResults } from "./use-leg-results";
import { cn } from "@/lib/utils";

type FilterChange = (patch: Partial<SearchState>) => void;

export function FiltersAside({ data, onChange }: { data: LegResults; onChange: FilterChange }) {
  return (
    <aside className="hidden rounded-lg border bg-card p-4 lg:sticky lg:top-20 lg:block" aria-label="فیلتر نتایج">
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
  const count = data.results.data?.length ?? 0;
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
            {data.results.isFetching ? "در حال به‌روزرسانی…" : `نمایش ${toFaDigits(count)} پرواز`}
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
  arrange = (list) => list,
}: {
  data: LegResults;
  onChange: FilterChange;
  /** Empty state when the route/day has no flights at all. */
  noFlights: ReactNode;
  renderCard: (flight: Flight, index: number, list: Flight[]) => ReactNode;
  /** Reorder the list before rendering (e.g. unavailable flights last). */
  arrange?: (flights: Flight[]) => Flight[];
}) {
  const { results, facets, filterCount } = data;
  const flights = arrange(results.data ?? []);
  const total = facets.data?.total ?? 0;

  if (results.error && !results.data) {
    return (
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
  }
  if (results.isLoading) {
    return (
      <div className="space-y-3" role="status" aria-label="در حال بارگذاری نتایج">
        {[0, 1, 2, 3].map((i) => (
          <FlightCardSkeleton key={i} />
        ))}
      </div>
    );
  }
  if (flights.length === 0) {
    return filterCount > 0 && total > 0 ? (
      <StateMessage
        icon={SearchX}
        title="پروازی با این فیلترها پیدا نشد"
        description={`در این مسیر ${toFaDigits(total)} پرواز هست، اما هیچ‌کدام با فیلترهای انتخابی جور نیست.`}
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
      {results.error ? (
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
      <ul
        className={cn("space-y-3 transition-opacity", results.isFetching && "opacity-60")}
        aria-busy={results.isFetching}
      >
        {flights.map((f, i) => (
          <li key={f.id}>{renderCard(f, i, flights)}</li>
        ))}
      </ul>
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
