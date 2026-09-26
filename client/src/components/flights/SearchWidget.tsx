import { Button } from "@/components/ui/button";
import { AirportPicker } from "./AirportPicker";
import { JalaliDatePicker } from "./JalaliDatePicker";
import { airportShortCity } from "@/domain/airports";
import { dayDiff, formatDateKey, todayKey } from "@/lib/persian";
import { usePriceCalendar } from "@/hooks/use-price-calendar";
import { searchUrl } from "@/lib/search-state";
import { ArrowUpDown, Pencil, Search } from "lucide-react";
import { useNavigate } from "react-router";
import { useId, useState } from "react";
import { cn } from "@/lib/utils";

export interface SearchWidgetValues {
  originCode: string;
  destinationCode: string;
  /** yyyy-mm-dd, or null = every upcoming day (one-way only). */
  date: string | null;
  /** Set for round trips. */
  returnDate: string | null;
}

type TripType = "oneway" | "round";
type MonthRange = { start: string; days: number };

const ANY_DAY = "همه روزها";

/** Prices for the month a date picker is showing (never for days before today). */
function useMonthPrices(from: string, to: string, month: MonthRange | null) {
  const today = todayKey();
  return usePriceCalendar(
    month && from !== to
      ? {
          originCode: from,
          destinationCode: to,
          start: month.start < today ? today : month.start,
          days: Math.max(1, month.days - Math.max(0, dayDiff(month.start, today))),
        }
      : null,
  );
}

/**
 * Route + date(s) search form. `compact` (results page) collapses to a one-line
 * summary on small screens so the results stay above the fold.
 */
export function SearchWidget({
  initial,
  compact = false,
}: {
  initial?: Partial<SearchWidgetValues>;
  compact?: boolean;
}) {
  const navigate = useNavigate();
  const formId = useId();
  const today = todayKey();
  const [originCode, setOriginCode] = useState(initial?.originCode || "THR");
  const [destinationCode, setDestinationCode] = useState(initial?.destinationCode || "MHD");
  const [tripType, setTripType] = useState<TripType>(initial?.returnDate ? "round" : "oneway");
  const [date, setDate] = useState<string | null>(initial?.date ?? null);
  const [returnDate, setReturnDate] = useState<string | null>(initial?.returnDate ?? null);
  const [expanded, setExpanded] = useState(!compact);
  const [error, setError] = useState<string | null>(null);
  // The months the two date pickers are showing; their prices load while open.
  const [outboundMonth, setOutboundMonth] = useState<MonthRange | null>(null);
  const [returnMonth, setReturnMonth] = useState<MonthRange | null>(null);
  const outboundPrices = useMonthPrices(originCode, destinationCode, outboundMonth);
  const returnPrices = useMonthPrices(destinationCode, originCode, returnMonth);
  const round = tripType === "round";

  const swap = () => {
    setOriginCode(destinationCode);
    setDestinationCode(originCode);
    setError(null);
  };

  // Choosing the other field's airport swaps the two instead of producing an invalid route.
  const chooseOrigin = (code: string) => {
    if (code === destinationCode) setDestinationCode(originCode);
    setOriginCode(code);
    setError(null);
  };
  const chooseDestination = (code: string) => {
    if (code === originCode) setOriginCode(destinationCode);
    setDestinationCode(code);
    setError(null);
  };
  const chooseDate = (key: string | null) => {
    setDate(key);
    // A return before the new outbound date is no longer valid.
    if (key && returnDate && returnDate < key) setReturnDate(null);
    setError(null);
  };

  const submit = () => {
    if (!originCode || !destinationCode) return setError("مبدا و مقصد را انتخاب کنید.");
    if (originCode === destinationCode) return setError("مبدا و مقصد نمی‌توانند یکسان باشند.");
    if (round && !date) return setError("برای سفر رفت و برگشت، تاریخ رفت را انتخاب کنید.");
    if (round && !returnDate) return setError("تاریخ برگشت را انتخاب کنید.");
    setError(null);
    if (compact) setExpanded(false);
    navigate(
      searchUrl({
        from: originCode,
        to: destinationCode,
        date: date ?? undefined,
        ret: round ? (returnDate ?? undefined) : undefined,
      }),
    );
  };

  const summaryDates = round
    ? `رفت ${date ? formatDateKey(date, { weekday: true }) : "—"} · برگشت ${returnDate ? formatDateKey(returnDate, { weekday: true }) : "—"}`
    : date
      ? formatDateKey(date, { weekday: true })
      : ANY_DAY;

  return (
    <div className={cn("rounded-lg border bg-card shadow-sm", compact ? "p-3" : "p-3 sm:p-4")}>
      {compact && (
        <div className={cn("flex items-center justify-between gap-3 md:hidden", expanded && "mb-3")}>
          <div className="min-w-0">
            <p className="truncate font-semibold">
              {airportShortCity(originCode)} <span className="text-muted-foreground">به</span>{" "}
              {airportShortCity(destinationCode)}
              {round ? <span className="text-xs font-normal text-muted-foreground"> · رفت و برگشت</span> : null}
            </p>
            <p className="truncate text-xs text-muted-foreground">{summaryDates}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-controls={formId}
          >
            <Pencil aria-hidden />
            {expanded ? "بستن" : "تغییر جستجو"}
          </Button>
        </div>
      )}

      <form
        id={formId}
        className={cn(!expanded && "hidden md:block")}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        aria-label="جستجوی پرواز"
        noValidate
      >
        <fieldset className="mb-2.5 flex gap-1">
          <legend className="sr-only">نوع سفر</legend>
          {(
            [
              ["oneway", "یک‌طرفه"],
              ["round", "رفت و برگشت"],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="relative">
              <input
                type="radio"
                name={`${formId}-trip`}
                value={value}
                checked={tripType === value}
                onChange={() => {
                  setTripType(value);
                  setError(null);
                }}
                className="peer sr-only"
              />
              <span
                className={cn(
                  "flex h-8 cursor-pointer items-center rounded-md px-3 text-sm text-muted-foreground transition-colors hover:text-foreground",
                  "peer-checked:bg-secondary peer-checked:font-semibold peer-checked:text-foreground",
                  "peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50",
                )}
              >
                {label}
              </span>
            </label>
          ))}
        </fieldset>

        <div
          className={cn(
            "grid gap-2 md:items-center md:gap-2",
            round
              ? "md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_minmax(0,1.7fr)_auto]"
              : "md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_minmax(0,1fr)_auto]",
          )}
        >
          <AirportPicker id={`${formId}-origin`} label="مبدا" value={originCode} onChange={chooseOrigin} />

          {/* On mobile the swap button overlaps the seam between the stacked origin/destination fields. */}
          <div className="relative z-10 -my-4 flex justify-end pe-6 md:my-0 md:pe-0">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="rounded-full bg-card shadow-sm"
              onClick={swap}
              aria-label="جابه‌جایی مبدا و مقصد"
              title="جابه‌جایی مبدا و مقصد"
            >
              <ArrowUpDown className="md:rotate-90" aria-hidden />
            </Button>
          </div>

          <AirportPicker
            id={`${formId}-destination`}
            label="مقصد"
            value={destinationCode}
            onChange={chooseDestination}
          />

          <div className={cn(round && "grid grid-cols-2 gap-2")}>
            <JalaliDatePicker
              id={`${formId}-date`}
              label={round ? "تاریخ رفت" : "تاریخ حرکت"}
              value={date}
              onChange={chooseDate}
              minKey={today}
              clearLabel={round ? undefined : ANY_DAY}
              placeholder="انتخاب کنید"
              prices={outboundPrices.priceByDate}
              onViewChange={setOutboundMonth}
            />
            {round ? (
              <JalaliDatePicker
                id={`${formId}-return`}
                label="تاریخ برگشت"
                value={returnDate}
                onChange={(key) => {
                  setReturnDate(key);
                  setError(null);
                }}
                minKey={date ?? today}
                rangeStart={date ?? undefined}
                placeholder="انتخاب کنید"
                prices={returnPrices.priceByDate}
                onViewChange={setReturnMonth}
              />
            ) : null}
          </div>

          <Button type="submit" size="lg" className="h-12 w-full text-base md:h-14 md:w-auto md:px-7">
            <Search aria-hidden />
            جستجو
          </Button>
        </div>

        {error ? (
          <p className="mt-2 text-sm font-medium text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </div>
  );
}
