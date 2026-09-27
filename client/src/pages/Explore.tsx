import { useSearchParams } from "react-router";
import { MapPinned, RotateCcw, WifiOff } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { AirportPicker } from "@/components/flights/AirportPicker";
import { DestinationList, DestinationListSkeleton } from "@/components/explore/DestinationList";
import { Segmented } from "@/components/Segmented";
import { ShareButton } from "@/components/ShareButton";
import { StateMessage } from "@/components/StateMessage";
import { Button } from "@/components/ui/button";
import { airportCity, isKnownAirport } from "@/domain/airports";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { toFaDigits } from "@/lib/persian";
import type { ExploreScope } from "@/lib/types";
import { useApiQuery } from "@/lib/use-api-query";

const WINDOWS = [
  { value: 7, label: "هفته آینده" },
  { value: 14, label: "۲ هفته" },
  { value: 30, label: "۳۰ روز" },
];
const SCOPES: { value: ExploreScope; label: string }[] = [
  { value: "all", label: "همه" },
  { value: "domestic", label: "داخلی" },
  { value: "international", label: "خارجی" },
];

export default function Explore() {
  const [params, setParams] = useSearchParams();
  const fromParam = (params.get("from") ?? "").toUpperCase();
  const origin = isKnownAirport(fromParam) ? fromParam : "THR";
  const daysParam = Number(params.get("days"));
  const days = WINDOWS.some((w) => w.value === daysParam) ? daysParam : 30;
  const scopeParam = params.get("scope");
  const scope = SCOPES.find((s) => s.value === scopeParam)?.value ?? "all";
  // Full name: "تهران" alone is ambiguous between Mehrabad and Imam Khomeini.
  const city = airportCity(origin);

  useDocumentTitle(`ارزان‌ترین مقصدها از ${city}`);

  const update = (patch: { from?: string; days?: number; scope?: ExploreScope }) => {
    const next = { from: origin, days, scope, ...patch };
    setParams(
      new URLSearchParams({
        from: next.from,
        ...(next.days !== 30 ? { days: String(next.days) } : {}),
        ...(next.scope !== "all" ? { scope: next.scope } : {}),
      }),
      { replace: true },
    );
  };

  const query = useApiQuery(`explore:${origin}:${days}:${scope}`, (signal) => api.explore(origin, days, scope, signal));
  const destinations = query.data?.destinations ?? [];

  let body;
  if (query.error && !query.data) {
    body = (
      <StateMessage
        tone="error"
        icon={WifiOff}
        title="مقصدها دریافت نشد"
        description={errorMessage(query.error)}
        action={
          <Button variant="outline" onClick={query.refetch}>
            <RotateCcw />
            تلاش دوباره
          </Button>
        }
      />
    );
  } else if (query.isLoading) {
    body = <DestinationListSkeleton />;
  } else if (destinations.length === 0) {
    body = (
      <StateMessage
        icon={MapPinned}
        title={`در این بازه از ${city} پروازی پیدا نشد`}
        description="بازه طولانی‌تر یا مبدا دیگری را امتحان کنید."
        action={
          days < 30 ? (
            <Button variant="outline" onClick={() => update({ days: 30 })}>
              نمایش ۳۰ روز آینده
            </Button>
          ) : undefined
        }
      />
    );
  } else {
    body = <DestinationList originCode={origin} destinations={destinations} fetching={query.isFetching} />;
  }

  return (
    <PageShell className="container-page max-w-4xl py-6 sm:py-8">
      <h1 className="text-2xl font-bold">ارزان‌ترین مقصدها</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        کمترین قیمت بلیط اکونومی به هر مقصد، از ارزان به گران. روی هر مقصد بزنید تا پروازهای ارزان‌ترین روزش را ببینید.
      </p>

      {/* Filters: one row above everything they scope. */}
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <AirportPicker label="مبدا" value={origin} onChange={(code) => update({ from: code })} className="sm:w-64" />
        <div className="flex flex-wrap items-center gap-2">
          <Segmented legend="بازه زمانی" options={WINDOWS} value={days} onChange={(v) => update({ days: v })} />
          <Segmented legend="نوع مقصد" options={SCOPES} value={scope} onChange={(v) => update({ scope: v })} />
          <ShareButton
            compact
            label="اشتراک‌گذاری این فهرست"
            title="پروازیاب"
            text={`ارزان‌ترین مقصدها از ${city} در پروازیاب`}
          />
        </div>
      </div>

      <p className="mt-5 mb-2 text-sm text-muted-foreground" role="status">
        {query.isLoading ? "در حال یافتن مقصدها…" : `${toFaDigits(destinations.length)} مقصد از ${city}`}
      </p>
      {body}
    </PageShell>
  );
}
