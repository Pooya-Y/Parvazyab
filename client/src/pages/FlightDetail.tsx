import { Link, useParams, useSearchParams } from "react-router";
import { ArrowRight, Building2, ExternalLink, Heart, Info, Loader2, RotateCcw, SearchX, WifiOff } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { FlightCard, FlightTimeline, OfferTags } from "@/components/flights/FlightCard";
import { StateMessage } from "@/components/StateMessage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShareButton } from "@/components/ShareButton";
import { PriceAlertButton } from "@/components/alerts/PriceAlertButton";
import { RoutePriceTrend } from "@/components/charts/RoutePriceTrend";
import { Skeleton } from "@/components/ui/skeleton";
import { api, safeExternalUrl } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { useApiQuery } from "@/lib/use-api-query";
import { isKnownAirport } from "@/domain/airports";
import {
  epochToDateKey,
  formatJalaliWeekday,
  formatPrice,
  formatTime,
  formatToman,
  relativeDayLabel,
  toFaDigits,
  isValidDateKey,
} from "@/lib/persian";
import { searchUrl } from "@/lib/search-state";
import { explainFlight } from "@/services/flightsCore";
import { useAuth } from "@/hooks/use-auth";
import { useSavedFlights } from "@/hooks/use-saved-flights";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { cn } from "@/lib/utils";

export default function FlightDetail() {
  const { id = "" } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const from = (params.get("from") ?? "").toUpperCase();
  const to = (params.get("to") ?? "").toUpperCase();
  const rawDate = params.get("date");
  const date = isValidDateKey(rawDate) ? rawDate : undefined;
  const validQuery = Boolean(id) && isKnownAirport(from) && isKnownAirport(to) && from !== to;

  const { isAuthenticated } = useAuth();
  const saved = useSavedFlights();
  const results = useApiQuery(validQuery ? `detail:${from}:${to}:${date ?? ""}` : null, (signal) =>
    api.search({ originCode: from, destinationCode: to, date, sort: "departure" }, signal),
  );

  const flight = results.data?.find((f) => f.id === id);
  const similar = results.data?.filter((f) => f.id !== id).slice(0, 4) ?? [];
  useDocumentTitle(flight ? `${flight.airline} ${flight.originCity} به ${flight.destinationCity}` : "جزئیات پرواز");

  const backHref = validQuery ? searchUrl({ from, to, date }) : "/";
  const backLink = (
    <Link
      to={backHref}
      className="inline-flex min-h-9 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowRight className="size-4" aria-hidden />
      بازگشت به نتایج جستجو
    </Link>
  );

  if (results.isLoading) {
    return (
      <PageShell className="container-page max-w-4xl py-6">
        <div role="status" aria-label="در حال بارگذاری جزئیات پرواز">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="mt-5 h-8 w-64" />
          <Skeleton className="mt-4 h-44 w-full rounded-lg" />
          <Skeleton className="mt-4 h-32 w-full rounded-lg" />
        </div>
      </PageShell>
    );
  }

  if (results.error) {
    return (
      <PageShell className="container-page max-w-4xl py-6">
        {backLink}
        <StateMessage
          className="mt-4"
          tone="error"
          icon={WifiOff}
          title="اطلاعات پرواز دریافت نشد"
          description={errorMessage(results.error)}
          action={
            <Button variant="outline" onClick={results.refetch}>
              <RotateCcw />
              تلاش دوباره
            </Button>
          }
        />
      </PageShell>
    );
  }

  if (!flight) {
    return (
      <PageShell className="container-page max-w-4xl py-6">
        <StateMessage
          icon={SearchX}
          title="پرواز پیدا نشد"
          description="این پرواز انجام شده، حذف شده یا دیگر فروخته نمی‌شود."
          action={
            <Button asChild>
              <Link to={backHref}>مشاهده پروازهای دیگر این مسیر</Link>
            </Button>
          }
        />
      </PageShell>
    );
  }

  const cheapest = flight.offers[0];
  const cheapestUrl = cheapest ? safeExternalUrl(cheapest.bookingUrl) : undefined;
  const relative = relativeDayLabel(flight.departAt);
  const isSaved = saved.savedKeys.has(flight.id);
  const savePending = saved.pending.has(flight.id);

  return (
    <PageShell bottomBar={Boolean(cheapestUrl)} className="container-page max-w-4xl py-4 md:py-6 md:pb-10">
      {backLink}

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">
            {flight.originCity} به {flight.destinationCity}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{flight.airline}</span>
            <bdi className="rounded bg-muted px-1.5 font-mono text-xs">{flight.flightNo}</bdi>
            <span aria-hidden>·</span>
            <span>
              {formatJalaliWeekday(flight.departAt)}
              {relative ? ` (${relative})` : ""}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ShareButton
            title={`${flight.airline} ${flight.flightNo}`}
            text={`${flight.airline} ${flight.originCity} به ${flight.destinationCity}، ${formatJalaliWeekday(
              flight.departAt,
            )} ساعت ${formatTime(flight.departAt)}، از ${formatPrice(flight.bestPriceToman)} در پروازیاب`}
          />
          <PriceAlertButton
            compact
            originCode={flight.originCode}
            destinationCode={flight.destinationCode}
            date={epochToDateKey(flight.departAt)}
            cabin={flight.cabin}
            lowestPrice={flight.bestPriceToman}
          />
          {isAuthenticated ? (
            <Button
              variant="outline"
              onClick={() => void saved.toggle(flight)}
              disabled={savePending}
              aria-pressed={isSaved}
              className={cn(isSaved && "border-primary/40 text-primary")}
            >
              {savePending ? <Loader2 className="animate-spin" /> : <Heart className={cn(isSaved && "fill-current")} />}
              {isSaved ? "ذخیره شده" : "ذخیره پرواز"}
            </Button>
          ) : null}
        </div>
      </div>

      <section className="mt-5 rounded-lg border bg-card p-4 sm:p-6" aria-label="برنامه پرواز">
        <FlightTimeline flight={flight} size="lg" />
        <div className="mt-5 flex flex-wrap items-center gap-2 border-t pt-4">
          <Badge variant="secondary">{flight.cabin === "business" ? "بیزینس" : "اکونومی"}</Badge>
          {flight.badges
            ?.filter((b) => b !== "مستقیم")
            .map((b) => (
              <Badge
                key={b}
                variant="outline"
                className={b === "ارزان‌ترین" ? "border-success/30 bg-success/10 text-success" : undefined}
              >
                {b}
              </Badge>
            ))}
        </div>
        {flight.reasons?.length ? (
          <p className="mt-3 flex items-start gap-2 text-sm leading-7 text-muted-foreground">
            <Info className="mt-1.5 size-4 shrink-0 text-primary" aria-hidden />
            {explainFlight(flight)}
          </p>
        ) : null}
      </section>

      <section className="mt-6" aria-labelledby="offers-heading">
        <h2 id="offers-heading" className="flex items-center gap-2 text-lg font-bold">
          <Building2 className="size-5 text-primary" aria-hidden />
          {flight.offers.length === flight.agencyCount
            ? `قیمت در ${toFaDigits(flight.agencyCount)} آژانس`
            : `${toFaDigits(flight.offers.length)} پیشنهاد از ${toFaDigits(flight.agencyCount)} آژانس`}
        </h2>
        <ul className="mt-3 divide-y overflow-hidden rounded-lg border bg-card">
          {flight.offers.map((o, i) => {
            const url = safeExternalUrl(o.bookingUrl);
            return (
              <li key={o.listingId} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="truncate font-medium">
                    {o.agencyName}
                    <OfferTags offer={o} />
                  </div>
                  {i === 0 && flight.offers.length > 1 ? (
                    <div className="text-xs font-medium text-success">ارزان‌ترین پیشنهاد</div>
                  ) : null}
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-baseline gap-1">
                    <span className="text-lg font-bold tabular-nums">{formatToman(o.priceToman)}</span>
                    <span className="text-xs text-muted-foreground">تومان</span>
                  </div>
                  {url ? (
                    <Button asChild variant={i === 0 ? "default" : "outline"}>
                      <a href={url} target="_blank" rel="noopener noreferrer">
                        خرید از آژانس
                        <ExternalLink className="size-3.5" aria-hidden />
                        <span className="sr-only">({o.agencyName}، در پنجره جدید)</span>
                      </a>
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-xs leading-6 text-muted-foreground">
          خرید و صدور بلیط در سایت آژانس انجام می‌شود. قیمت نهایی را پیش از پرداخت در سایت آژانس بررسی کنید.
          {flight.offers.some((o) => o.fareType === "charter")
            ? " بلیط چارتری را چارترکننده می‌فروشد و معمولاً استرداد و تغییر آن محدودتر است؛ قوانین را پیش از خرید بخوانید."
            : ""}
        </p>
      </section>

      <RoutePriceTrend originCode={flight.originCode} destinationCode={flight.destinationCode} className="mt-8" />

      {similar.length > 0 ? (
        <section className="mt-8" aria-labelledby="similar-heading">
          <h2 id="similar-heading" className="text-lg font-bold">
            پروازهای دیگر این مسیر
          </h2>
          <ul className="mt-3 space-y-3">
            {similar.map((f) => (
              <li key={f.id}>
                <FlightCard
                  flight={f}
                  date={date}
                  saved={saved.savedKeys.has(f.id)}
                  savePending={saved.pending.has(f.id)}
                  onToggleSave={isAuthenticated ? saved.toggle : undefined}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Mobile: keep the price and the buy action in reach. */}
      {cheapest && cheapestUrl ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] text-muted-foreground">ارزان‌ترین قیمت</div>
              <div className="truncate font-extrabold tabular-nums">{formatPrice(flight.bestPriceToman)}</div>
            </div>
            <Button asChild className="h-11 px-6">
              <a href={cheapestUrl} target="_blank" rel="noopener noreferrer">
                خرید بلیط
                <ExternalLink className="size-3.5" aria-hidden />
              </a>
            </Button>
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}
