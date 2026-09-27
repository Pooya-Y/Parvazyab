import { useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePriceCalendar, type CalendarRequest } from "@/hooks/use-price-calendar";
import {
  addDaysToKey,
  dayDiff,
  formatDateKey,
  formatPrice,
  formatThousandToman,
  jalaliFromKey,
  toFaDigits,
  todayKey,
  FA_MONTHS,
} from "@/lib/persian";
import type { CalendarDay } from "@/lib/types";
import { cn } from "@/lib/utils";

const WINDOW_DAYS = 14;
const SHIFT_DAYS = 7;
/** Bar heights (px): the cheapest day gets the shortest bar, the dearest the tallest. */
const BAR_MIN = 6;
const BAR_MAX = 26;

const WEEKDAY_SHORT = ["یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه"];

function weekdayOf(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return WEEKDAY_SHORT[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

function dayMonthOf(key: string): string {
  const j = jalaliFromKey(key)!;
  return `${toFaDigits(j.jd)} ${FA_MONTHS[j.jm - 1]}`;
}

interface DateStripProps {
  /** Route and filters (everything search uses except the date). */
  request: Omit<CalendarRequest, "start" | "days">;
  /** Selected day, or undefined for "any day". */
  selected: string | undefined;
  /** URL for a given day (undefined = any day). */
  hrefFor: (date: string | undefined) => string;
  /** Days before this can't be chosen (e.g. returns before the outbound date). */
  minDate?: string;
  /** Offer the "any day" entry (one-way searches only). */
  allowAnyDay?: boolean;
  /** Accessible name of the strip. */
  label?: string;
}

/**
 * Two weeks of cheapest-per-day prices above the results: a row of day links,
 * each with a small bar (emphasis form — every day in neutral grey, only the
 * cheapest in the "good" green, always with its price as text).
 */
export function DateStrip({
  request,
  selected,
  hrefFor,
  minDate,
  allowAnyDay = true,
  label = "انتخاب روز پرواز",
}: DateStripProps) {
  const today = todayKey();
  const earliest = minDate && minDate > today ? minDate : today;
  // Show the selected day with a few days of context before it, never before today.
  const windowFor = (day: string | undefined) => {
    const anchor = day ? addDaysToKey(day, -3) : earliest;
    return anchor < earliest ? earliest : anchor;
  };
  const [start, setStart] = useState(() => windowFor(selected));
  // Clicking a visible day keeps the window steady; a day outside it (chosen elsewhere) moves it.
  const [prevSelected, setPrevSelected] = useState(selected);
  if (selected !== prevSelected) {
    setPrevSelected(selected);
    if (selected && (selected < start || dayDiff(start, selected) >= WINDOW_DAYS)) setStart(windowFor(selected));
  }
  const calendar = usePriceCalendar({ ...request, start, days: WINDOW_DAYS }, { keepPrevious: true });
  const scroller = useRef<HTMLOListElement>(null);
  const loaded = calendar.days !== undefined;

  // Bring the selected day into view without scrolling the page.
  useLayoutEffect(() => {
    const list = scroller.current;
    const item = list?.querySelector<HTMLElement>("[aria-current='date']");
    if (!list || !item) return;
    const listBox = list.getBoundingClientRect();
    const itemBox = item.getBoundingClientRect();
    list.scrollLeft += itemBox.left + itemBox.width / 2 - (listBox.left + listBox.width / 2);
  }, [loaded]);

  if (calendar.error && !calendar.days) return null; // The picker still works; don't block results.

  const days: (CalendarDay | null)[] = calendar.days ?? Array.from({ length: WINDOW_DAYS }, () => null);
  const prices = (calendar.days ?? []).map((d) => d.minPrice).filter((p): p is number => p !== null);
  const min = prices.length ? Math.min(...prices) : 0;
  const max = prices.length ? Math.max(...prices) : 0;
  const barHeight = (p: number) =>
    max === min ? (BAR_MIN + BAR_MAX) / 2 : BAR_MIN + ((p - min) / (max - min)) * (BAR_MAX - BAR_MIN);
  const canGoBack = dayDiff(earliest, start) > 0;

  return (
    <nav aria-label={label} className="mb-4 rounded-lg border bg-card">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-1.5">
        <p className="text-xs text-muted-foreground">
          کمترین قیمت هر روز · <span className="font-medium">هزار تومان</span>
        </p>
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={!canGoBack}
            onClick={() =>
              setStart((s) =>
                dayDiff(earliest, addDaysToKey(s, -SHIFT_DAYS)) < 0 ? earliest : addDaysToKey(s, -SHIFT_DAYS),
              )
            }
            aria-label="روزهای قبل"
          >
            <ChevronRight aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setStart((s) => addDaysToKey(s, SHIFT_DAYS))}
            aria-label="روزهای بعد"
          >
            <ChevronLeft aria-hidden />
          </Button>
        </div>
      </div>

      <ol
        ref={scroller}
        className={cn(
          "flex snap-x gap-1 overflow-x-auto p-1.5 [scrollbar-width:thin]",
          calendar.isFetching && calendar.days && "opacity-60 transition-opacity",
        )}
        aria-busy={calendar.isFetching}
      >
        {allowAnyDay ? (
          <li className="snap-start">
            <Link
              to={hrefFor(undefined)}
              aria-current={selected ? undefined : "date"}
              className={cn(
                "flex h-full min-w-[4.25rem] flex-col items-center justify-center gap-1 rounded-md border border-transparent px-2 py-1.5 text-center text-xs transition-colors hover:bg-accent",
                !selected && "border-primary bg-primary/5 font-semibold text-primary",
              )}
            >
              همه روزها
            </Link>
          </li>
        ) : null}
        {days.map((day, i) => {
          const date = day?.date ?? addDaysToKey(start, i);
          const isSelected = date === selected;
          const disabled = Boolean(minDate && date < minDate);
          const cheapest = day?.minPrice !== null && day?.minPrice !== undefined && day.minPrice === min;
          const ariaLabel = `${formatDateKey(date, { weekday: true })}، ${
            !day ? "در حال بارگذاری" : day.minPrice === null ? "بدون پرواز" : `از ${formatPrice(day.minPrice)}`
          }${cheapest ? "، ارزان‌ترین روز" : ""}`;
          const cellClass = cn(
            "flex min-w-[4.25rem] flex-col items-center gap-1 rounded-md border border-transparent px-2 py-1.5 text-center transition-colors hover:bg-accent",
            isSelected && "border-primary bg-primary/5",
            day?.minPrice === null && "opacity-60",
          );
          const content = (
            <>
              {/* Bar area: fixed height, bars grow up from a shared baseline. */}
              <span className="flex h-[26px] w-full items-end justify-center border-b border-chart-axis" aria-hidden>
                {day?.minPrice != null ? (
                  <span
                    className={cn("w-4 rounded-t-[4px]", cheapest ? "bg-chart-good" : "bg-chart-muted")}
                    style={{ height: `${barHeight(day.minPrice)}px` }}
                  />
                ) : !day ? (
                  <span className="h-3 w-4 animate-pulse rounded-t-[4px] bg-muted" />
                ) : null}
              </span>
              <span className="text-[11px] leading-4 text-muted-foreground">{weekdayOf(date)}</span>
              <span
                className={cn(
                  "text-xs leading-4 whitespace-nowrap",
                  isSelected ? "font-bold text-primary" : "font-medium",
                )}
              >
                {dayMonthOf(date)}
              </span>
              <span
                className={cn(
                  "text-xs leading-4 tabular-nums",
                  cheapest ? "font-bold text-success" : "text-foreground",
                )}
              >
                {!day ? " " : day.minPrice === null ? "—" : formatThousandToman(day.minPrice)}
              </span>
            </>
          );
          return (
            <li key={date} className="snap-start">
              {disabled ? (
                <span
                  aria-disabled="true"
                  aria-label={`${ariaLabel}، قبل از تاریخ رفت`}
                  className={cn(cellClass, "cursor-not-allowed opacity-40 hover:bg-transparent")}
                >
                  {content}
                </span>
              ) : (
                <Link
                  to={hrefFor(date)}
                  aria-label={ariaLabel}
                  aria-current={isSelected ? "date" : undefined}
                  className={cellClass}
                >
                  {content}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
