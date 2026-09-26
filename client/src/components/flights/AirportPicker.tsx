import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { ALL_AIRPORTS, INTERNATIONAL_AIRPORTS, IRAN_AIRPORTS, findAirport, type Airport } from "@/domain/airports";
import { normalizeForSearch } from "@/lib/persian";
import { Check, ChevronDown, Globe2, MapPin } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

interface AirportPickerProps {
  id?: string;
  /** Visible field label, e.g. "مبدا" — also used for the accessible name. */
  label: string;
  value: string;
  onChange: (code: string) => void;
  placeholder?: string;
  className?: string;
}

const SEARCH_INDEX = ALL_AIRPORTS.map((a) => ({
  airport: a,
  code: a.code.toLowerCase(),
  city: normalizeForSearch(a.city),
  en: a.en.toLowerCase(),
}));

/** Code / city prefix matches first, then substring matches. */
function searchAirports(query: string): Airport[] {
  const q = normalizeForSearch(query);
  if (!q) return [];
  const scored: { airport: Airport; rank: number }[] = [];
  for (const entry of SEARCH_INDEX) {
    let rank = -1;
    if (entry.code === q) rank = 0;
    else if (entry.city.startsWith(q) || entry.en.startsWith(q)) rank = 1;
    else if (entry.code.startsWith(q)) rank = 2;
    else if (entry.city.includes(q) || entry.en.includes(q)) rank = 3;
    if (rank >= 0) scored.push({ airport: entry.airport, rank });
  }
  return scored.sort((a, b) => a.rank - b.rank).map((s) => s.airport);
}

function AirportOption({ airport, selected, onSelect }: { airport: Airport; selected: boolean; onSelect: () => void }) {
  const Icon = airport.isInternational ? Globe2 : MapPin;
  return (
    <CommandItem value={airport.code} onSelect={onSelect} className="min-h-11 gap-3 px-3">
      <Icon className="text-muted-foreground" aria-hidden />
      <span className="flex-1 truncate">{airport.city}</span>
      <span dir="ltr" className="font-mono text-xs text-muted-foreground">
        {airport.code}
      </span>
      <Check className={cn("size-4 text-primary", selected ? "opacity-100" : "opacity-0")} aria-hidden />
    </CommandItem>
  );
}

/**
 * Searchable airport combobox (Persian or English city name, or IATA code).
 * Domestic and international airports are listed as separate groups.
 */
export function AirportPicker({
  id,
  label,
  value,
  onChange,
  placeholder = "انتخاب شهر",
  className,
}: AirportPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const matches = useMemo(() => searchAirports(query), [query]);
  const selected = findAirport(value);

  const select = (code: string) => {
    onChange(code);
    setOpen(false);
    setQuery("");
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label={selected ? `${label}: ${selected.city} (${selected.code})` : `${label}: ${placeholder}`}
          className={cn(
            "flex h-14 w-full min-w-0 items-center gap-2 rounded-lg border border-input bg-background px-3 text-start transition-colors",
            "hover:border-foreground/25 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none",
            "dark:bg-input/30",
            className,
          )}
        >
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-[11px] leading-4 text-muted-foreground">{label}</span>
            {selected ? (
              <span className="flex min-w-0 items-baseline gap-1.5">
                <span className="truncate text-[15px] font-semibold leading-6">{selected.city}</span>
                <span dir="ltr" className="shrink-0 font-mono text-xs text-muted-foreground">
                  {selected.code}
                </span>
              </span>
            ) : (
              <span className="truncate text-[15px] leading-6 text-muted-foreground">{placeholder}</span>
            )}
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(22rem,calc(100vw-2rem))] p-0" align="start" collisionPadding={16}>
        <Command shouldFilter={false} label={`انتخاب ${label}`}>
          <CommandInput placeholder="نام شهر یا کد فرودگاه…" value={query} onValueChange={setQuery} />
          <CommandList className="max-h-[min(20rem,45dvh)]">
            <CommandEmpty>فرودگاهی با این نام پیدا نشد.</CommandEmpty>
            {query.trim() ? (
              matches.length > 0 && (
                <CommandGroup heading="نتایج">
                  {matches.map((a) => (
                    <AirportOption
                      key={a.code}
                      airport={a}
                      selected={a.code === value}
                      onSelect={() => select(a.code)}
                    />
                  ))}
                </CommandGroup>
              )
            ) : (
              <>
                <CommandGroup heading="فرودگاه‌های داخلی">
                  {IRAN_AIRPORTS.map((a) => (
                    <AirportOption
                      key={a.code}
                      airport={a}
                      selected={a.code === value}
                      onSelect={() => select(a.code)}
                    />
                  ))}
                </CommandGroup>
                <CommandGroup heading="بین‌المللی">
                  {INTERNATIONAL_AIRPORTS.map((a) => (
                    <AirportOption
                      key={a.code}
                      airport={a}
                      selected={a.code === value}
                      onSelect={() => select(a.code)}
                    />
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
