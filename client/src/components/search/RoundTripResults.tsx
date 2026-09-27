import { useState, type KeyboardEvent } from "react";
import { Link } from "react-router";
import { Check, ExternalLink, SearchX } from "lucide-react";
import { toast } from "sonner";
import { DateStrip } from "@/components/flights/DateStrip";
import { FlightCard, FlightTimeline } from "@/components/flights/FlightCard";
import { StateMessage } from "@/components/StateMessage";
import { Button } from "@/components/ui/button";
import { ShareButton } from "@/components/ShareButton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { airportShortCity } from "@/domain/airports";
import { useAuth } from "@/hooks/use-auth";
import { useSavedFlights } from "@/hooks/use-saved-flights";
import { api, offerHref } from "@/lib/api";
import { formatDateKey, formatPrice, formatTime, toFaDigits } from "@/lib/persian";
import { activeLeg, flightDetailHref, legRoute, toSearchParams, type Leg, type SearchState } from "@/lib/search-state";
import type { Flight } from "@/lib/types";
import { cn } from "@/lib/utils";
import { MIN_TURNAROUND_MS, turnaroundConflict } from "@/lib/round-trip";
import { useApiQuery } from "@/lib/use-api-query";
import { FiltersAside, FiltersSheetButton, ResultsBody, SignInHint, SortSelect } from "./leg-results";
import { resultsSummary, useLegResults } from "./use-leg-results";

const LEG_NAME: Record<Leg, string> = { out: "پرواز رفت", ret: "پرواز برگشت" };

type Update = (patch: Partial<SearchState>, options?: { push?: boolean }) => void;

function scrollToResults() {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  requestAnimationFrame(() =>
    document
      .getElementById("results-heading")
      ?.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" }),
  );
}

/** A chosen flight, looked up by id: it may be on a page of results not fetched yet. */
function useChosenFlight(route: { from: string; to: string; date?: string }, id: string | undefined) {
  const query = useApiQuery(id ? `flight:${route.from}-${route.to}:${id}:${route.date ?? ""}` : null, (signal) =>
    api.flight(route.from, route.to, id ?? "", route.date, signal).then((r) => r.flight),
  );
  return query.data;
}

function LegTabs({
  state,
  leg,
  selections,
  onSelectLeg,
}: {
  state: SearchState;
  leg: Leg;
  selections: Record<Leg, Flight | undefined>;
  onSelectLeg: (leg: Leg) => void;
}) {
  const legs: Leg[] = ["out", "ret"];
  // Tabs pattern: arrows move between tabs (← is "next" in RTL).
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const next: Leg = leg === "out" ? "ret" : "out";
    onSelectLeg(next);
    document.getElementById(`leg-tab-${next}`)?.focus();
  };

  return (
    <div role="tablist" aria-label="مراحل انتخاب پرواز" className="mb-4 grid grid-cols-2 gap-2">
      {legs.map((l, i) => {
        const active = l === leg;
        const flight = selections[l];
        const route = legRoute(state, l);
        return (
          <button
            key={l}
            id={`leg-tab-${l}`}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls="leg-panel"
            tabIndex={active ? 0 : -1}
            onClick={() => onSelectLeg(l)}
            onKeyDown={onKeyDown}
            className={cn(
              "flex min-w-0 flex-col items-start gap-1 rounded-lg border bg-card p-3 text-start transition-colors",
              "hover:border-foreground/25 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
              active && "border-primary bg-primary/[0.04]",
            )}
          >
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span
                className={cn(
                  "flex size-5 items-center justify-center rounded-full text-[11px] font-bold",
                  flight
                    ? "bg-success text-white dark:text-background"
                    : active
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted",
                )}
                aria-hidden
              >
                {flight ? <Check className="size-3" /> : toFaDigits(i + 1)}
              </span>
              {LEG_NAME[l]}
              {route.date ? (
                <span className="hidden sm:inline">· {formatDateKey(route.date, { weekday: true })}</span>
              ) : null}
            </span>
            <span className="truncate text-sm font-semibold">
              {airportShortCity(route.from)} به {airportShortCity(route.to)}
            </span>
            <span className={cn("w-full truncate text-xs", flight ? "text-foreground" : "text-muted-foreground")}>
              {flight
                ? `${flight.airline} · ${formatTime(flight.departAt)} · ${formatPrice(flight.bestPriceToman)}`
                : "هنوز انتخاب نشده"}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function LegPurchase({ leg, flight, date }: { leg: Leg; flight: Flight; date?: string }) {
  const offer = flight.offers[0];
  const url = offer ? offerHref(offer, "roundtrip") : undefined;
  return (
    <section className="rounded-lg border p-3" aria-label={LEG_NAME[leg]}>
      <p className="mb-2 text-xs text-muted-foreground">
        {LEG_NAME[leg]} · {flight.airline} <bdi className="font-mono">{flight.flightNo}</bdi>
      </p>
      <FlightTimeline flight={flight} />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        <div>
          <div className="font-bold tabular-nums">{formatPrice(flight.bestPriceToman)}</div>
          {offer ? <div className="text-xs text-muted-foreground">از {offer.agencyName}</div> : null}
        </div>
        <div className="flex items-center gap-2">
          {flight.offers.length > 1 ? (
            <Button asChild variant="ghost" size="sm">
              <Link to={flightDetailHref(flight, date)}>مقایسه {toFaDigits(flight.offers.length)} پیشنهاد</Link>
            </Button>
          ) : null}
          {url ? (
            <Button asChild size="sm">
              <a href={url} target="_blank" rel="noopener">
                خرید {leg === "out" ? "رفت" : "برگشت"}
                <ExternalLink className="size-3.5" aria-hidden />
                <span className="sr-only">(از {offer?.agencyName}، در پنجره جدید)</span>
              </a>
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function RoundTripBar({
  outbound,
  inbound,
  onBuy,
}: {
  outbound: Flight | undefined;
  inbound: Flight | undefined;
  onBuy: () => void;
}) {
  const ready = Boolean(outbound && inbound);
  const total = (outbound?.bestPriceToman ?? 0) + (inbound?.bestPriceToman ?? 0);
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="container-page flex items-center gap-4 py-2.5">
        <dl className="hidden min-w-0 flex-1 gap-6 text-sm md:flex">
          {(
            [
              ["رفت", outbound],
              ["برگشت", inbound],
            ] as const
          ).map(([label, flight]) => (
            <div key={label} className="min-w-0">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="truncate font-medium">
                {flight
                  ? `${flight.airline} · ${formatTime(flight.departAt)} · ${formatPrice(flight.bestPriceToman)}`
                  : "—"}
              </dd>
            </div>
          ))}
        </dl>
        <div className="min-w-0 flex-1 md:flex-none md:text-end" aria-live="polite">
          {ready ? (
            <>
              <p className="text-xs text-muted-foreground">مجموع رفت و برگشت (یک نفر)</p>
              <p className="text-lg font-extrabold tabular-nums">{formatPrice(total)}</p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold">
                {outbound ? "۲. پرواز برگشت را انتخاب کنید" : "۱. پرواز رفت را انتخاب کنید"}
              </p>
              <p className="text-xs text-muted-foreground">
                {outbound ? `رفت: ${formatPrice(outbound.bestPriceToman)}` : "سپس پرواز برگشت را انتخاب می‌کنید"}
              </p>
            </>
          )}
        </div>
        <Button className="h-11 shrink-0 px-6" disabled={!ready} onClick={onBuy}>
          خرید بلیط‌ها
        </Button>
      </div>
    </div>
  );
}

export function RoundTripResults({ state, update }: { state: SearchState & { ret?: string }; update: Update }) {
  const { isAuthenticated } = useAuth();
  const saved = useSavedFlights();
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const leg = activeLeg(state);

  // Choices are kept by id in the URL; the flight just picked is used at once, and
  // one from a shared link is looked up.
  const [picked, setPicked] = useState<Record<string, Flight>>({});
  const outboundLookup = useChosenFlight(legRoute(state, "out"), state.outboundId);
  const inboundLookup = useChosenFlight(legRoute(state, "ret"), state.returnId);
  const outbound = state.outboundId ? (picked[state.outboundId] ?? outboundLookup) : undefined;
  const inbound = state.returnId ? (picked[state.returnId] ?? inboundLookup) : undefined;
  const selections = { out: outbound, ret: inbound };

  // Each leg's pages put the flights that can't pair with the other leg's choice last.
  const outboundData = useLegResults(
    state,
    "out",
    inbound ? { arriveBy: inbound.departAt - MIN_TURNAROUND_MS } : undefined,
  );
  const returnData = useLegResults(
    state,
    "ret",
    outbound ? { departFrom: outbound.arriveAt + MIN_TURNAROUND_MS } : undefined,
  );
  const data = leg === "out" ? outboundData : returnData;
  const other = leg === "out" ? inbound : outbound;

  const choose = (flight: Flight) => {
    setPicked((p) => ({ ...p, [flight.id]: flight }));
    if (leg === "out") {
      const patch: Partial<SearchState> = { outboundId: flight.id, leg: "ret" };
      if (inbound && turnaroundConflict("out", flight, inbound)) {
        patch.returnId = undefined;
        toast.info("پرواز برگشت قبلی با پرواز رفت جدید جور نبود؛ دوباره انتخابش کنید.");
      }
      update(patch, { push: true });
      scrollToResults();
    } else {
      update({ returnId: flight.id, leg: "ret" }, { push: true });
    }
  };

  const dayHref = (date: string | undefined) => {
    if (!date) return `/search?${toSearchParams(state)}`;
    if (leg === "ret") return `/search?${toSearchParams({ ...state, ret: date, returnId: undefined, leg: "ret" })}`;
    // Moving the outbound past the return date drags the return along.
    const ret = state.ret && state.ret < date ? date : state.ret;
    return `/search?${toSearchParams({
      ...state,
      date,
      ret,
      outboundId: undefined,
      returnId: ret === state.ret ? state.returnId : undefined,
      leg: "out",
    })}`;
  };

  const route = legRoute(state, leg);
  const noFlights = (
    <StateMessage
      icon={SearchX}
      title={`برای این روز ${LEG_NAME[leg]} پیدا نشد`}
      description="روزهای دیگر را از نوار بالا امتحان کنید."
    />
  );

  return (
    <div className="container-page py-4 md:py-6 lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start lg:gap-6">
      <FiltersAside data={data} onChange={update} />

      <section aria-labelledby="results-heading" className="min-w-0">
        <div className="mb-3">
          <h1 id="results-heading" className="scroll-mt-20 text-lg font-bold md:text-xl">
            {airportShortCity(state.from)} به {airportShortCity(state.to)}
            <span className="ms-2 text-sm font-normal text-muted-foreground">رفت و برگشت</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            رفت {state.date ? formatDateKey(state.date, { weekday: true }) : ""} · برگشت{" "}
            {state.ret ? formatDateKey(state.ret, { weekday: true }) : ""}
          </p>
        </div>

        <LegTabs
          state={state}
          leg={leg}
          selections={selections}
          onSelectLeg={(l) => update({ leg: l }, { push: true })}
        />

        <div id="leg-panel" role="tabpanel" aria-labelledby={`leg-tab-${leg}`}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <p className="text-sm text-muted-foreground" role="status">
              {LEG_NAME[leg]} · {airportShortCity(route.from)} به {airportShortCity(route.to)} · {resultsSummary(data)}
            </p>
            <div className="flex w-full items-center gap-2 sm:w-auto">
              <FiltersSheetButton data={data} onChange={update} />
              <SortSelect value={state.sort} onChange={(sort) => update({ sort })} />
              <ShareButton
                compact
                label="اشتراک‌گذاری این جستجو"
                title="پروازیاب"
                text={`رفت و برگشت ${airportShortCity(state.from)} به ${airportShortCity(state.to)} در پروازیاب`}
              />
            </div>
          </div>

          <DateStrip
            key={leg}
            request={data.calendarRequest}
            selected={route.date}
            hrefFor={dayHref}
            minDate={leg === "ret" ? state.date : undefined}
            allowAnyDay={false}
            label={`انتخاب روز ${LEG_NAME[leg]}`}
          />

          <ResultsBody
            data={data}
            onChange={update}
            noFlights={noFlights}
            renderCard={(f) => (
              <FlightCard
                flight={f}
                date={route.date}
                saved={saved.savedKeys.has(f.id)}
                savePending={saved.pending.has(f.id)}
                onToggleSave={isAuthenticated ? saved.toggle : undefined}
                selection={{
                  selected: f.id === (leg === "out" ? state.outboundId : state.returnId),
                  onSelect: () => choose(f),
                  label: leg === "out" ? "انتخاب رفت" : "انتخاب برگشت",
                  unavailableReason: turnaroundConflict(leg, f, other),
                }}
              />
            )}
          />
        </div>

        {!isAuthenticated && (data.results.total ?? 0) > 0 ? (
          <SignInHint returnTo={`/search?${toSearchParams(state)}`} />
        ) : null}
      </section>

      <RoundTripBar outbound={outbound} inbound={inbound} onBuy={() => setPurchaseOpen(true)} />

      <Dialog open={purchaseOpen && Boolean(outbound && inbound)} onOpenChange={setPurchaseOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>خرید بلیط رفت و برگشت</DialogTitle>
            <DialogDescription className="leading-7">
              هر بلیط را جداگانه از آژانس فروشنده‌اش می‌خرید. اول بلیط رفت را نهایی کنید، بعد بلیط برگشت را.
            </DialogDescription>
          </DialogHeader>
          {outbound && inbound ? (
            <div className="space-y-3">
              <LegPurchase leg="out" flight={outbound} date={state.date} />
              <LegPurchase leg="ret" flight={inbound} date={state.ret} />
              <p className="flex items-baseline justify-between border-t pt-3 text-sm">
                <span className="text-muted-foreground">مجموع برای یک نفر</span>
                <span className="text-lg font-extrabold tabular-nums">
                  {formatPrice(outbound.bestPriceToman + inbound.bestPriceToman)}
                </span>
              </p>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
