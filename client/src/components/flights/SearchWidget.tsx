import { Button } from "@/components/ui/button";
import { AirportPicker } from "./AirportPicker";
import { JalaliDatePicker } from "./JalaliDatePicker";
import { airportShortCity } from "@/domain/airports";
import { formatDateKey, todayKey } from "@/lib/persian";
import { searchUrl } from "@/lib/search-state";
import { ArrowUpDown, Pencil, Search } from "lucide-react";
import { useNavigate } from "react-router";
import { useId, useState } from "react";
import { cn } from "@/lib/utils";

export interface SearchWidgetValues {
  originCode: string;
  destinationCode: string;
  /** yyyy-mm-dd, or null = every upcoming day. */
  date: string | null;
}

const ANY_DAY = "همه روزها";

/**
 * Route + date search form. `compact` (results page) collapses to a one-line
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
  const [originCode, setOriginCode] = useState(initial?.originCode || "THR");
  const [destinationCode, setDestinationCode] = useState(initial?.destinationCode || "MHD");
  const [date, setDate] = useState<string | null>(initial?.date ?? null);
  const [expanded, setExpanded] = useState(!compact);
  const [error, setError] = useState<string | null>(null);

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

  const submit = () => {
    if (!originCode || !destinationCode) {
      setError("مبدا و مقصد را انتخاب کنید.");
      return;
    }
    if (originCode === destinationCode) {
      setError("مبدا و مقصد نمی‌توانند یکسان باشند.");
      return;
    }
    setError(null);
    if (compact) setExpanded(false);
    navigate(searchUrl({ from: originCode, to: destinationCode, date: date ?? undefined }));
  };

  return (
    <div className={cn("rounded-xl border bg-card shadow-sm", compact ? "p-3" : "p-3 sm:p-4")}>
      {compact && (
        <div className={cn("flex items-center justify-between gap-3 md:hidden", expanded && "mb-3")}>
          <div className="min-w-0">
            <p className="truncate font-semibold">
              {airportShortCity(originCode)} <span className="text-muted-foreground">به</span>{" "}
              {airportShortCity(destinationCode)}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {date ? formatDateKey(date, { weekday: true }) : ANY_DAY}
            </p>
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
        <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-center md:gap-2">
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

          <JalaliDatePicker
            id={`${formId}-date`}
            label="تاریخ حرکت"
            value={date}
            onChange={setDate}
            minKey={todayKey()}
            clearLabel={ANY_DAY}
          />

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
