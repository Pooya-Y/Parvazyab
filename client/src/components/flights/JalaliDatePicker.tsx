import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import {
  FA_MONTHS,
  addDaysToKey,
  formatDateKey,
  formatPrice,
  formatThousandToman,
  jMonthsLength,
  jalaliFromKey,
  keyFromJalali,
  persianWeekdayIndex,
  relativeDayLabel,
  toFaDigits,
  todayKey,
  type JalaliDate,
} from "@/lib/persian";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

const WEEKDAYS = [
  ["ش", "شنبه"],
  ["ی", "یکشنبه"],
  ["د", "دوشنبه"],
  ["س", "سه‌شنبه"],
  ["چ", "چهارشنبه"],
  ["پ", "پنجشنبه"],
  ["ج", "جمعه"],
] as const;

type MonthView = Pick<JalaliDate, "jy" | "jm">;

function shiftMonth(v: MonthView, delta: number): MonthView {
  const index = v.jy * 12 + (v.jm - 1) + delta;
  return { jy: Math.floor(index / 12), jm: (index % 12) + 1 };
}

const monthIndex = (v: MonthView) => v.jy * 12 + v.jm;

function viewOf(key: string): MonthView {
  const j = jalaliFromKey(key)!;
  return { jy: j.jy, jm: j.jm };
}

interface JalaliDatePickerProps {
  id?: string;
  label: string;
  /** Gregorian `yyyy-mm-dd` key, or null for "any day". */
  value: string | null;
  onChange: (key: string | null) => void;
  /** Earliest selectable day (inclusive). */
  minKey?: string;
  /** Offer a "any day" option that clears the value. */
  clearLabel?: string;
  placeholder?: string;
  className?: string;
  /** Cheapest price per date key (null = no flights). Days without an entry show a loading slot. */
  prices?: Map<string, number | null>;
  /** Called with the visible month while the calendar is open, so the parent can fetch its prices. */
  onViewChange?: (range: { start: string; days: number }) => void;
}

/**
 * Persian calendar popover. Keyboard: arrows move by day/week (←/→ follow RTL
 * reading order), PageUp/PageDown by month, Enter selects.
 */
export function JalaliDatePicker({
  id,
  label,
  value,
  onChange,
  minKey,
  clearLabel,
  placeholder = "انتخاب تاریخ",
  className,
  prices,
  onViewChange,
}: JalaliDatePickerProps) {
  const [open, setOpen] = useState(false);
  const today = todayKey();
  const [view, setView] = useState<MonthView>(() => viewOf(value ?? today));
  const [focusKey, setFocusKey] = useState<string>(value ?? minKey ?? today);
  const gridRef = useRef<HTMLDivElement>(null);
  const shouldFocus = useRef(false);

  const isDisabled = (key: string) => (minKey ? key < minKey : false);
  const minView = minKey ? viewOf(minKey) : null;
  const canGoBack = !minView || monthIndex(view) > monthIndex(minView);

  const reportView = useEffectEvent((start: string, length: number) => onViewChange?.({ start, days: length }));
  useEffect(() => {
    if (open) reportView(keyFromJalali({ ...view, jd: 1 }), jMonthsLength(view.jy, view.jm));
  }, [open, view]);

  useEffect(() => {
    if (!open || !shouldFocus.current) return;
    shouldFocus.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-key="${focusKey}"]`)?.focus();
  }, [open, focusKey, view]);

  const openChange = (next: boolean) => {
    if (next) {
      const start = value ?? (minKey && today < minKey ? minKey : today);
      setView(viewOf(start));
      setFocusKey(start);
      shouldFocus.current = true;
    }
    setOpen(next);
  };

  const pick = (key: string | null) => {
    onChange(key);
    setOpen(false);
  };

  const moveFocus = (key: string) => {
    if (isDisabled(key)) return;
    setFocusKey(key);
    setView(viewOf(key));
    shouldFocus.current = true;
  };

  const onGridKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const steps: Record<string, number> = { ArrowLeft: 1, ArrowRight: -1, ArrowDown: 7, ArrowUp: -7 };
    if (e.key in steps) {
      e.preventDefault();
      moveFocus(addDaysToKey(focusKey, steps[e.key]));
    } else if (e.key === "PageDown" || e.key === "PageUp") {
      e.preventDefault();
      moveFocus(addDaysToKey(focusKey, e.key === "PageDown" ? 30 : -30));
    }
  };

  const firstColumn = persianWeekdayIndex({ ...view, jd: 1 });
  const days = Array.from({ length: jMonthsLength(view.jy, view.jm) }, (_, i) => keyFromJalali({ ...view, jd: i + 1 }));
  // The roving tab stop must be a day that is visible in this month.
  const tabStop = days.includes(focusKey) ? focusKey : (days.find((d) => !isDisabled(d)) ?? days[0]);

  // The month's cheapest bookable day gets the "good" highlight (always paired with a text label).
  const showPrices = prices !== undefined || onViewChange !== undefined;
  const monthPrices = days
    .filter((d) => !isDisabled(d))
    .map((d) => prices?.get(d))
    .filter((p): p is number => typeof p === "number");
  const cheapest = monthPrices.length ? Math.min(...monthPrices) : null;

  const relative = value ? relativeDayLabel(value) : null;
  const display = value ? formatDateKey(value, { weekday: true }) : (clearLabel ?? placeholder);

  return (
    <Popover open={open} onOpenChange={openChange}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={`${label}: ${display}${relative ? ` (${relative})` : ""}`}
          className={cn(
            "flex h-14 w-full min-w-0 items-center gap-2.5 rounded-lg border border-input bg-background px-3 text-start transition-colors",
            "hover:border-foreground/25 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none",
            "dark:bg-input/30",
            className,
          )}
        >
          <CalendarDays className="size-4.5 shrink-0 text-primary" aria-hidden />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-[11px] leading-4 text-muted-foreground">{label}</span>
            <span className={cn("truncate text-[15px] leading-6", value ? "font-semibold" : "text-muted-foreground")}>
              {display}
              {relative ? <span className="ms-1.5 text-xs font-normal text-muted-foreground">({relative})</span> : null}
            </span>
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[min(20rem,calc(100vw-2rem))] p-3"
        align="start"
        collisionPadding={16}
        aria-label={`انتخاب ${label}`}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {/* DOM order is RTL visual order: previous month sits on the right. */}
        <div className="mb-2 flex items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setView((v) => shiftMonth(v, -1))}
            disabled={!canGoBack}
            aria-label="ماه قبل"
          >
            <ChevronRight aria-hidden />
          </Button>
          <div className="text-sm font-semibold" aria-live="polite">
            {FA_MONTHS[view.jm - 1]} {toFaDigits(view.jy)}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setView((v) => shiftMonth(v, 1))}
            aria-label="ماه بعد"
          >
            <ChevronLeft aria-hidden />
          </Button>
        </div>

        <div className="grid grid-cols-7 text-center" aria-hidden>
          {WEEKDAYS.map(([short, full]) => (
            <abbr key={full} title={full} className="py-1 text-xs text-muted-foreground no-underline">
              {short}
            </abbr>
          ))}
        </div>

        <div ref={gridRef} className="grid grid-cols-7 gap-y-1" onKeyDown={onGridKeyDown}>
          {Array.from({ length: firstColumn }, (_, i) => (
            <span key={`pad-${i}`} aria-hidden />
          ))}
          {days.map((key, i) => {
            const selected = key === value;
            const disabled = isDisabled(key);
            const price = prices?.get(key);
            const isCheapest = !disabled && price !== undefined && price !== null && price === cheapest;
            const priceLabel =
              price === undefined || disabled
                ? ""
                : price === null
                  ? "، بدون پرواز"
                  : `، از ${formatPrice(price)}${isCheapest ? "، ارزان‌ترین روز این ماه" : ""}`;
            return (
              <button
                key={key}
                type="button"
                data-key={key}
                tabIndex={key === tabStop ? 0 : -1}
                disabled={disabled}
                onClick={() => pick(key)}
                onFocus={() => setFocusKey(key)}
                aria-pressed={selected}
                aria-current={key === today ? "date" : undefined}
                aria-label={`${formatDateKey(key, { weekday: true })}${priceLabel}`}
                className={cn(
                  "mx-auto flex w-full max-w-11 flex-col items-center justify-center rounded-md text-sm tabular-nums transition-colors",
                  showPrices ? "h-11" : "aspect-square max-w-10",
                  "focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                  selected
                    ? "bg-primary font-semibold text-primary-foreground"
                    : disabled
                      ? "text-muted-foreground/40"
                      : "hover:bg-accent",
                  key === today && !selected && "font-semibold text-primary ring-1 ring-primary/40 ring-inset",
                )}
              >
                <span className={cn(showPrices && "leading-5")}>{toFaDigits(i + 1)}</span>
                {showPrices && !disabled ? (
                  price === undefined ? (
                    <span className="h-2 w-6 animate-pulse rounded-sm bg-muted" aria-hidden />
                  ) : (
                    <span
                      aria-hidden
                      className={cn(
                        "text-[9.5px] leading-3",
                        selected
                          ? "text-primary-foreground/90"
                          : isCheapest
                            ? "font-bold text-success"
                            : "text-muted-foreground",
                      )}
                    >
                      {price === null ? "—" : formatThousandToman(price)}
                    </span>
                  )
                ) : null}
              </button>
            );
          })}
        </div>

        {showPrices ? (
          <p className="mt-2 text-[11px] text-muted-foreground">
            کمترین قیمت هر روز، به هزار تومان
            {cheapest !== null ? (
              <>
                {" · ارزان‌ترین: "}
                <span className="font-bold text-success">{formatThousandToman(cheapest)}</span>
              </>
            ) : null}
          </p>
        ) : null}

        <div className="mt-3 flex items-center justify-between gap-2 border-t pt-3">
          <Button type="button" variant="ghost" size="sm" onClick={() => pick(today)} disabled={isDisabled(today)}>
            امروز
          </Button>
          {clearLabel ? (
            <Button type="button" variant={value ? "outline" : "secondary"} size="sm" onClick={() => pick(null)}>
              {clearLabel}
            </Button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
