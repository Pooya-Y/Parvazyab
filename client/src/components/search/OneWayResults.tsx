import { Link } from "react-router";
import { SearchX } from "lucide-react";
import { DateStrip } from "@/components/flights/DateStrip";
import { FlightCard } from "@/components/flights/FlightCard";
import { StateMessage } from "@/components/StateMessage";
import { Button } from "@/components/ui/button";
import { airportShortCity } from "@/domain/airports";
import { useAuth } from "@/hooks/use-auth";
import { useSavedFlights } from "@/hooks/use-saved-flights";
import { formatDateKey } from "@/lib/persian";
import { searchUrl, toSearchParams, type SearchState } from "@/lib/search-state";
import {
  FiltersAside,
  FiltersSheetButton,
  ResultsBody,
  SignInHint,
  SortSelect,
} from "./leg-results";
import { resultsSummary, useLegResults } from "./use-leg-results";

export function OneWayResults({
  state,
  onChange,
}: {
  state: SearchState;
  onChange: (patch: Partial<SearchState>) => void;
}) {
  const { isAuthenticated } = useAuth();
  const saved = useSavedFlights();
  const data = useLegResults(state, "out");
  const flights = data.results.data ?? [];

  const noFlights = (
    <StateMessage
      icon={SearchX}
      title={state.date ? "برای این روز پروازی پیدا نشد" : "فعلاً پروازی در این مسیر نیست"}
      description={
        state.date
          ? "روزهای دیگر را از نوار بالا امتحان کنید یا همه پروازهای پیش‌روی این مسیر را ببینید."
          : "آژانس‌ها هنوز پروازی برای این مسیر ثبت نکرده‌اند. مسیر دیگری را امتحان کنید."
      }
      action={
        <Button asChild variant="outline">
          {state.date ? (
            <Link to={searchUrl({ from: state.from, to: state.to })}>نمایش همه روزها</Link>
          ) : (
            <Link to="/">جستجوی مسیر دیگر</Link>
          )}
        </Button>
      }
    />
  );

  return (
    <div className="container-page py-4 md:py-6 lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start lg:gap-6">
      <FiltersAside data={data} onChange={onChange} />

      <section aria-labelledby="results-heading" className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="min-w-0">
            <h1 id="results-heading" className="scroll-mt-20 text-lg font-bold md:text-xl">
              {airportShortCity(state.from)} به {airportShortCity(state.to)}
            </h1>
            <p className="text-sm text-muted-foreground" role="status">
              {state.date ? `${formatDateKey(state.date, { weekday: true })} · ` : "همه روزها · "}
              {resultsSummary(data)}
            </p>
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <FiltersSheetButton data={data} onChange={onChange} />
            <SortSelect value={state.sort} onChange={(sort) => onChange({ sort })} />
          </div>
        </div>

        <DateStrip
          request={data.calendarRequest}
          selected={state.date}
          hrefFor={(date) => `/search?${toSearchParams({ ...state, date })}`}
        />

        <ResultsBody
          data={data}
          onChange={onChange}
          noFlights={noFlights}
          renderCard={(f, i, list) => (
            <FlightCard
              flight={f}
              recommended={state.sort === "best" && i === 0 && list.length > 1}
              date={state.date}
              saved={saved.savedKeys.has(f.id)}
              savePending={saved.pending.has(f.id)}
              onToggleSave={isAuthenticated ? saved.toggle : undefined}
            />
          )}
        />

        {!isAuthenticated && flights.length > 0 ? <SignInHint returnTo={`/search?${toSearchParams(state)}`} /> : null}
      </section>
    </div>
  );
}
