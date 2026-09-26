import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { safeExternalUrl } from "@/lib/api";
import type { Flight } from "@/lib/types";
import { explainFlight } from "@/services/flightsCore";
import { flightDetailHref } from "@/lib/search-state";
import {
  arrivalDayOffset,
  formatDuration,
  formatJalaliWeekday,
  formatPrice,
  formatStops,
  formatTime,
  formatToman,
  relativeDayLabel,
  toFaDigits,
} from "@/lib/persian";
import { cn } from "@/lib/utils";
import { Link } from "react-router";
import { ChevronDown, ExternalLink, Heart, Loader2, Plane, Sparkles } from "lucide-react";
import { useId, useState } from "react";

/** Departure → duration/stops → arrival, laid out in RTL reading order. */
export function FlightTimeline({ flight, size = "md" }: { flight: Flight; size?: "md" | "lg" }) {
  const nextDay = arrivalDayOffset(flight.departAt, flight.arriveAt);
  const timeClass = size === "lg" ? "text-2xl sm:text-3xl" : "text-xl";
  return (
    <div className="flex items-center gap-3">
      <div className="text-start">
        <div className={cn("font-bold tabular-nums leading-tight", timeClass)}>{formatTime(flight.departAt)}</div>
        <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <span className="truncate">{flight.originCity}</span>
          <bdi className="font-mono">{flight.originCode}</bdi>
        </div>
      </div>

      <div className="flex min-w-16 flex-1 flex-col items-center text-center">
        <span className="text-[11px] leading-4 text-muted-foreground">{formatDuration(flight.durationMin)}</span>
        <div className="my-1 flex w-full items-center gap-1" aria-hidden>
          <span className="size-1.5 shrink-0 rounded-full border border-muted-foreground/50" />
          <span className="h-px flex-1 bg-border" />
          {flight.stops > 0 ? <span className="size-1.5 shrink-0 rounded-full bg-muted-foreground/60" /> : null}
          {flight.stops > 0 ? <span className="h-px flex-1 bg-border" /> : null}
          {/* lucide's plane points up-right; mirror it so it flies toward the destination (left). */}
          <Plane className="size-3.5 shrink-0 -scale-x-100 text-muted-foreground" />
        </div>
        <span className={cn("text-[11px] leading-4", flight.stops === 0 ? "text-success" : "text-muted-foreground")}>
          {formatStops(flight.stops)}
        </span>
      </div>

      <div className="text-end">
        <div className={cn("font-bold tabular-nums leading-tight", timeClass)}>
          {formatTime(flight.arriveAt)}
          {nextDay > 0 ? (
            <sup className="ms-0.5 text-[10px] font-medium text-primary" title="رسیدن در روز بعد">
              +{toFaDigits(nextDay)}
            </sup>
          ) : null}
        </div>
        <div className="mt-0.5 flex items-center justify-end gap-1 text-xs text-muted-foreground">
          <span className="truncate">{flight.destinationCity}</span>
          <bdi className="font-mono">{flight.destinationCode}</bdi>
        </div>
      </div>
    </div>
  );
}

interface FlightCardProps {
  flight: Flight;
  /** Top recommendation: highlighted and shows why it was picked. */
  recommended?: boolean;
  /** Search date, carried to the detail page's back link. */
  date?: string;
  saved?: boolean;
  savePending?: boolean;
  /** Omit to hide the save button (e.g. signed out). */
  onToggleSave?: (flight: Flight) => void;
}

export function FlightCard({
  flight,
  recommended = false,
  date,
  saved = false,
  savePending = false,
  onToggleSave,
}: FlightCardProps) {
  const [offersOpen, setOffersOpen] = useState(false);
  const headingId = useId();
  const offersId = useId();
  const cheapest = flight.offers[0];
  const bookingUrl = cheapest ? safeExternalUrl(cheapest.bookingUrl) : undefined;
  const relative = relativeDayLabel(flight.departAt);
  const highlights = (flight.badges ?? []).filter((b) => b !== "مستقیم");

  return (
    <article
      aria-labelledby={headingId}
      className={cn(
        "rounded-lg border bg-card transition-shadow hover:shadow-sm",
        recommended && "border-primary/45 ring-1 ring-primary/15",
      )}
    >
      <div className="grid gap-4 p-4 md:grid-cols-[minmax(0,1fr)_13rem] md:gap-6 md:p-5">
        {/* Flight */}
        <div className="min-w-0 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {recommended ? (
                <p className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-primary">
                  <Sparkles className="size-3.5" aria-hidden />
                  پیشنهاد پروازیاب
                </p>
              ) : null}
              <h3 id={headingId} className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <Link
                  to={flightDetailHref(flight, date)}
                  className="truncate font-semibold underline-offset-4 hover:text-primary hover:underline"
                >
                  {flight.airline}
                </Link>
                <bdi className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] leading-4 text-muted-foreground">
                  {flight.flightNo}
                </bdi>
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatJalaliWeekday(flight.departAt)}
                {relative ? ` · ${relative}` : ""}
                {flight.cabin === "business" ? " · بیزینس" : ""}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap justify-end gap-1">
              {highlights.map((b) => (
                <Badge
                  key={b}
                  variant="outline"
                  className={b === "ارزان‌ترین" ? "border-success/30 bg-success/10 text-success" : undefined}
                >
                  {b}
                </Badge>
              ))}
            </div>
          </div>

          <FlightTimeline flight={flight} />

          {recommended && flight.reasons?.length ? (
            <p className="text-xs leading-6 text-muted-foreground">{explainFlight(flight)}</p>
          ) : null}
        </div>

        {/* Price & actions */}
        {/* Mobile: price and buy button share one row; desktop: a stacked side column. */}
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-t pt-4 md:flex md:flex-col md:items-stretch md:gap-3 md:border-t-0 md:border-s md:ps-6 md:pt-0">
          <div className="flex min-w-0 items-center justify-between gap-2 md:block">
            <div>
              {flight.agencyCount > 1 ? <div className="text-[11px] text-muted-foreground">ارزان‌ترین قیمت</div> : null}
              <div className="flex items-baseline gap-1">
                <span className="text-xl font-extrabold tabular-nums">{formatToman(flight.bestPriceToman)}</span>
                <span className="text-xs text-muted-foreground">تومان</span>
              </div>
              {cheapest ? <div className="truncate text-xs text-muted-foreground">از {cheapest.agencyName}</div> : null}
            </div>
            {onToggleSave ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn("shrink-0 md:hidden", saved && "text-primary")}
                onClick={() => onToggleSave(flight)}
                disabled={savePending}
                aria-pressed={saved}
                aria-label={saved ? "حذف از ذخیره‌شده‌ها" : "ذخیره پرواز"}
              >
                {savePending ? <Loader2 className="animate-spin" /> : <Heart className={cn(saved && "fill-current")} />}
              </Button>
            ) : null}
          </div>

          <div className="flex gap-2">
            <Button asChild={Boolean(bookingUrl)} disabled={!bookingUrl} className="h-11 flex-1 px-5 md:h-10">
              {bookingUrl ? (
                <a href={bookingUrl} target="_blank" rel="noopener noreferrer">
                  خرید بلیط
                  <ExternalLink className="size-3.5" aria-hidden />
                  <span className="sr-only">(از {cheapest?.agencyName}، در پنجره جدید)</span>
                </a>
              ) : (
                "لینک خرید در دسترس نیست"
              )}
            </Button>
            {onToggleSave ? (
              <Button
                type="button"
                variant="outline"
                size="icon"
                className={cn("hidden size-10 shrink-0 md:inline-flex", saved && "border-primary/40 text-primary")}
                onClick={() => onToggleSave(flight)}
                disabled={savePending}
                aria-pressed={saved}
                aria-label={saved ? "حذف از ذخیره‌شده‌ها" : "ذخیره پرواز"}
                title={saved ? "حذف از ذخیره‌شده‌ها" : "ذخیره پرواز"}
              >
                {savePending ? <Loader2 className="animate-spin" /> : <Heart className={cn(saved && "fill-current")} />}
              </Button>
            ) : null}
          </div>

          {flight.agencyCount > 1 ? (
            <button
              type="button"
              onClick={() => setOffersOpen((v) => !v)}
              aria-expanded={offersOpen}
              aria-controls={offersId}
              className="col-span-2 flex items-center justify-center gap-1 rounded-md py-1 text-xs font-medium text-primary hover:underline"
            >
              مقایسه قیمت {toFaDigits(flight.agencyCount)} آژانس
              <ChevronDown className={cn("size-3.5 transition-transform", offersOpen && "rotate-180")} aria-hidden />
            </button>
          ) : null}
        </div>
      </div>

      {offersOpen ? (
        <ul id={offersId} className="divide-y border-t bg-muted/30 px-4 md:px-5" aria-label="قیمت آژانس‌ها">
          {flight.offers.map((o, i) => {
            const url = safeExternalUrl(o.bookingUrl);
            return (
              <li key={`${o.agencyName}-${i}`} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="min-w-0 truncate">
                  {o.agencyName}
                  {i === 0 ? <span className="ms-2 text-xs font-medium text-success">ارزان‌ترین</span> : null}
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <span className="font-semibold tabular-nums">{formatPrice(o.priceToman)}</span>
                  {url ? (
                    <Button asChild variant="outline" size="sm">
                      <a href={url} target="_blank" rel="noopener noreferrer" aria-label={`خرید از ${o.agencyName}`}>
                        خرید
                      </a>
                    </Button>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </article>
  );
}
