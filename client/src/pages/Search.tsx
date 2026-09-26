import { useCallback, useMemo } from "react";
import { Link, useSearchParams } from "react-router";
import { SearchX } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { SearchWidget } from "@/components/flights/SearchWidget";
import { OneWayResults } from "@/components/search/OneWayResults";
import { RoundTripResults } from "@/components/search/RoundTripResults";
import { StateMessage } from "@/components/StateMessage";
import { Button } from "@/components/ui/button";
import { airportShortCity } from "@/domain/airports";
import { isRoundTrip, parseSearchState, toSearchParams, type SearchState } from "@/lib/search-state";
import { useDocumentTitle } from "@/hooks/use-document-title";

const PROBLEM_TEXT = {
  missing: "مبدا و مقصد مشخص نشده است.",
  "unknown-airport": "فرودگاه واردشده در فهرست پروازیاب نیست.",
  "same-airport": "مبدا و مقصد نمی‌توانند یکسان باشند.",
} as const;

export default function Search() {
  const [params, setParams] = useSearchParams();
  const { state, problem } = useMemo(() => parseSearchState(params), [params]);
  const round = isRoundTrip(state);

  useDocumentTitle(
    problem
      ? "جستجوی نامعتبر"
      : `بلیط ${round ? "رفت و برگشت " : ""}هواپیما ${airportShortCity(state.from)} به ${airportShortCity(state.to)}`,
  );

  // Filter tweaks replace the history entry so "back" returns to the previous search, not the previous checkbox;
  // choosing flights and switching legs are real steps and push one.
  const update = useCallback(
    (patch: Partial<SearchState>, { push = false }: { push?: boolean } = {}) => {
      setParams((prev) => toSearchParams({ ...parseSearchState(prev).state, ...patch }), { replace: !push });
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

  const routeKey = `${state.from}-${state.to}`;
  return (
    <PageShell bottomBar={round ? "always" : false}>
      <div className="border-b bg-muted/30">
        <div className="container-page py-3 md:py-4">
          <SearchWidget
            key={`${routeKey}-${state.date ?? "any"}-${state.ret ?? "oneway"}`}
            compact
            initial={{
              originCode: state.from,
              destinationCode: state.to,
              date: state.date ?? null,
              returnDate: state.ret ?? null,
            }}
          />
        </div>
      </div>
      {/* Remount per route (and trip type) so a new route shows skeletons; a new date keeps the frame. */}
      {round ? (
        <RoundTripResults key={`${routeKey}-round`} state={state} update={update} />
      ) : (
        <OneWayResults key={routeKey} state={state} onChange={update} />
      )}
    </PageShell>
  );
}
