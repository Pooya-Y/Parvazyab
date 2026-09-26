import { Link } from "react-router";
import { History, X } from "lucide-react";
import { airportShortCity } from "@/domain/airports";
import { FA_MONTHS, jalaliFromKey, toFaDigits, todayKey } from "@/lib/persian";
import { clearSearches, removeSearch, useRecentSearches, type RecentSearch } from "@/lib/recent-searches";
import { searchUrl } from "@/lib/search-state";

function dayMonth(key: string): string {
  const j = jalaliFromKey(key)!;
  return `${toFaDigits(j.jd)} ${FA_MONTHS[j.jm - 1]}`;
}

/** A past date can't be searched any more: the entry reopens the route for any day. */
function describe(s: RecentSearch, today: string): { href: string; when: string } {
  if (s.date && s.date < today) return { href: searchUrl({ from: s.from, to: s.to }), when: "تاریخ گذشته" };
  if (s.date && s.ret) {
    return { href: searchUrl(s), when: `${dayMonth(s.date)} تا ${dayMonth(s.ret)}` };
  }
  return { href: searchUrl(s), when: s.date ? dayMonth(s.date) : "همه روزها" };
}

/** The viewer's own recent searches (this browser only); renders nothing when there are none. */
export function RecentSearches() {
  const recent = useRecentSearches();
  if (recent.length === 0) return null;
  const today = todayKey();

  return (
    <section aria-labelledby="recent-searches" className="mx-auto max-w-5xl">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 id="recent-searches" className="flex items-center gap-1.5 text-sm font-semibold">
          <History className="size-4 text-muted-foreground" aria-hidden />
          جستجوهای اخیر
        </h2>
        <button
          type="button"
          onClick={clearSearches}
          className="rounded-sm px-1 text-xs text-muted-foreground hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          پاک کردن همه
        </button>
      </div>
      <ul className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
        {recent.map((s) => {
          const { href, when } = describe(s, today);
          const route = `${airportShortCity(s.from)} به ${airportShortCity(s.to)}`;
          return (
            <li key={`${s.from}-${s.to}-${s.date ?? ""}-${s.ret ?? ""}`} className="flex shrink-0 rounded-md border bg-card">
              <Link to={href} className="flex flex-col px-3 py-1.5 hover:bg-accent">
                <span className="text-sm font-medium whitespace-nowrap">
                  {route}
                  {s.ret ? <span className="ms-1 text-xs font-normal text-muted-foreground">(رفت و برگشت)</span> : null}
                </span>
                <span className="text-xs text-muted-foreground">{when}</span>
              </Link>
              <button
                type="button"
                onClick={() => removeSearch(s)}
                aria-label={`حذف جستجوی ${route}`}
                className="flex w-8 items-center justify-center border-s text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
