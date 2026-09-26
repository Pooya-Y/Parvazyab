import { useEffect, useId, useState } from "react";
import { RotateCcw } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { formatPrice, formatTomanCompact, toFaDigits } from "@/lib/persian";
import {
  CABIN_OPTIONS,
  CLEARED_FILTERS,
  TIME_WINDOWS,
  activeFilterCount,
  type SearchFiltersState,
  type TimeWindowId,
} from "@/lib/search-state";
import type { SearchFacets } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ChoiceOption<T> {
  value: T;
  label: string;
  hint?: string;
}

/** Native radio group styled as chips — keyboard and screen-reader behaviour for free. */
function ChoiceChips<T extends string | number | undefined>({
  legend,
  options,
  value,
  onChange,
}: {
  legend: string;
  options: ChoiceOption<T>[];
  value: T;
  onChange: (v: T) => void;
}) {
  const name = useId();
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold">{legend}</legend>
      <div className="grid grid-cols-3 gap-1.5">
        {options.map((o) => (
          <label key={String(o.value ?? "any")} className="relative">
            <input
              type="radio"
              name={name}
              className="peer sr-only"
              checked={value === o.value}
              onChange={() => onChange(o.value)}
            />
            <span
              className={cn(
                "flex min-h-10 cursor-pointer flex-col items-center justify-center rounded-md border px-2 py-1.5 text-center text-xs transition-colors",
                "hover:bg-accent peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50",
                "peer-checked:border-primary peer-checked:bg-primary/5 peer-checked:font-semibold peer-checked:text-primary",
              )}
            >
              {o.label}
              {o.hint ? <span className="text-[10px] font-normal text-muted-foreground">{o.hint}</span> : null}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Single choice that can be switched off again (pressing the active chip clears it). */
function TimeWindowToggles({
  legend,
  value,
  onChange,
}: {
  legend: string;
  value: TimeWindowId | undefined;
  onChange: (v: TimeWindowId | undefined) => void;
}) {
  const legendId = useId();
  return (
    <div role="group" aria-labelledby={legendId}>
      <div id={legendId} className="mb-2 text-sm font-semibold">
        {legend}
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {TIME_WINDOWS.map((t) => {
          const active = value === t.id;
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(active ? undefined : t.id)}
              className={cn(
                "flex min-h-10 flex-col items-center justify-center rounded-md border px-2 py-1 text-xs transition-colors",
                "hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                active && "border-primary bg-primary/5 font-semibold text-primary",
              )}
            >
              {t.label}
              <span className="text-[10px] font-normal text-muted-foreground">{t.hint}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const STOP_OPTIONS: ChoiceOption<0 | 1 | undefined>[] = [
  { value: undefined, label: "همه" },
  { value: 0, label: "فقط مستقیم" },
  { value: 1, label: "حداکثر ۱ توقف" },
];

const CABIN_CHOICES: ChoiceOption<SearchFiltersState["cabin"]>[] = [
  { value: undefined, label: "همه" },
  ...CABIN_OPTIONS.map((c) => ({ value: c.value, label: c.label })),
];

/** A round step for the price slider (~100 positions). */
function priceStep(min: number, max: number): number {
  const raw = Math.max(1, (max - min) / 100);
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  return Math.ceil(raw / magnitude) * magnitude;
}

function PriceFilter({
  facets,
  value,
  onCommit,
}: {
  facets: SearchFacets;
  value: number | undefined;
  onCommit: (v: number | undefined) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState(value ?? facets.maxPrice);

  // Follow external resets (e.g. "clear filters").
  const [synced, setSynced] = useState(value);
  if (synced !== value) {
    setSynced(value);
    setDraft(value ?? facets.maxPrice);
  }

  // Debounce: dragging the slider shouldn't fire a request per pixel.
  useEffect(() => {
    const committed = value ?? facets.maxPrice;
    if (draft === committed) return;
    const t = setTimeout(() => onCommit(draft >= facets.maxPrice ? undefined : draft), 350);
    return () => clearTimeout(t);
  }, [draft, value, facets.maxPrice, onCommit]);

  if (facets.maxPrice <= facets.minPrice) return null;
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <Label htmlFor={id} className="text-sm font-semibold">
          حداکثر قیمت
        </Label>
        <output htmlFor={id} className="text-xs font-medium tabular-nums text-primary">
          {draft >= facets.maxPrice ? "بدون محدودیت" : `تا ${formatPrice(draft)}`}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={facets.minPrice}
        max={facets.maxPrice}
        step={priceStep(facets.minPrice, facets.maxPrice)}
        value={draft}
        onChange={(e) => setDraft(Number(e.target.value))}
        aria-valuetext={draft >= facets.maxPrice ? "بدون محدودیت" : `تا ${formatPrice(draft)}`}
        className="h-6 w-full cursor-pointer accent-primary"
      />
      <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
        <span>{formatTomanCompact(facets.minPrice)}</span>
        <span>{formatTomanCompact(facets.maxPrice)}</span>
      </div>
    </div>
  );
}

export function SearchFilters({
  facets,
  filters,
  onChange,
  showTitle = true,
}: {
  facets: SearchFacets | undefined;
  filters: SearchFiltersState;
  onChange: (patch: Partial<SearchFiltersState>) => void;
  /** The mobile sheet has its own title. */
  showTitle?: boolean;
}) {
  const count = activeFilterCount(filters);
  const airlineIdPrefix = useId();
  const toggleAirline = (airline: string, checked: boolean) =>
    onChange({
      airlines: checked ? [...filters.airlines, airline] : filters.airlines.filter((a) => a !== airline),
    });

  return (
    <div className="space-y-6">
      {showTitle || count > 0 ? (
        <div className="flex min-h-8 items-center justify-between">
          {showTitle ? (
            <h2 className="font-bold">
              فیلترها
              {count > 0 ? (
                <span className="ms-1.5 text-sm font-normal text-muted-foreground">({toFaDigits(count)})</span>
              ) : null}
            </h2>
          ) : (
            <span />
          )}
          {count > 0 ? (
            <button
              type="button"
              onClick={() => onChange(CLEARED_FILTERS)}
              className="flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-primary hover:bg-primary/5"
            >
              <RotateCcw className="size-3.5" aria-hidden />
              حذف همه
            </button>
          ) : null}
        </div>
      ) : null}

      <ChoiceChips
        legend="توقف"
        options={STOP_OPTIONS}
        value={filters.maxStops}
        onChange={(v) => onChange({ maxStops: v })}
      />

      {/* Only offer a cabin choice on routes that actually sell more than one cabin. */}
      {facets && facets.cabins.length > 1 ? (
        <ChoiceChips
          legend="کلاس پرواز"
          options={CABIN_CHOICES}
          value={filters.cabin}
          onChange={(v) => onChange({ cabin: v })}
        />
      ) : null}

      <TimeWindowToggles legend="ساعت حرکت" value={filters.time} onChange={(v) => onChange({ time: v })} />
      <TimeWindowToggles legend="ساعت رسیدن" value={filters.arrive} onChange={(v) => onChange({ arrive: v })} />

      {facets && facets.airlines.length > 0 ? (
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">ایرلاین</legend>
          <div className="space-y-0.5">
            {facets.airlines.map((a, i) => {
              const id = `${airlineIdPrefix}-${i}`;
              return (
                <div key={a} className="flex min-h-9 items-center gap-2.5">
                  <Checkbox
                    id={id}
                    checked={filters.airlines.includes(a)}
                    onCheckedChange={(v) => toggleAirline(a, v === true)}
                  />
                  <Label htmlFor={id} className="flex-1 cursor-pointer py-1.5 font-normal">
                    {a}
                  </Label>
                </div>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      {facets && facets.total > 0 ? (
        <PriceFilter facets={facets} value={filters.maxPrice} onCommit={(v) => onChange({ maxPrice: v })} />
      ) : null}
    </div>
  );
}
