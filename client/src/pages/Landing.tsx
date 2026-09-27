import { PageShell } from "@/components/layout/PageShell";
import { SearchWidget } from "@/components/flights/SearchWidget";
import { DestinationList, DestinationListSkeleton } from "@/components/explore/DestinationList";
import { Segmented } from "@/components/Segmented";
import { RecentSearches } from "@/components/flights/RecentSearches";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { useApiQuery } from "@/lib/use-api-query";
import { airportShortCity } from "@/domain/airports";
import { searchUrl } from "@/lib/search-state";
import { toFaDigits } from "@/lib/persian";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { ArrowLeft, BadgeCheck, Filter, Heart, LineChart, Store, TrendingDown } from "lucide-react";
import { Link } from "react-router";
import { useState } from "react";

function PopularRoutes() {
  const { data: routes, isLoading } = useApiQuery("popular-routes", (signal) => api.popularRoutes(signal));

  if (isLoading) {
    return (
      <div className="flex flex-wrap justify-center gap-2" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-9 w-32 rounded-md" />
        ))}
      </div>
    );
  }
  // Popular routes are a shortcut; if they fail to load the search form above still works.
  if (!routes?.length) return null;

  return (
    <nav aria-label="مسیرهای پرطرفدار" className="flex flex-wrap items-center justify-center gap-2">
      <span className="w-full text-center text-sm text-muted-foreground sm:w-auto">مسیرهای پرطرفدار:</span>
      {routes.map((r) => (
        <Link
          key={`${r.originCode}-${r.destinationCode}`}
          to={searchUrl({ from: r.originCode, to: r.destinationCode })}
          className="inline-flex min-h-9 items-center rounded-md border bg-card px-3.5 text-sm transition-colors hover:border-primary/40 hover:bg-accent"
        >
          {airportShortCity(r.originCode)}
          <ArrowLeft className="mx-1.5 size-3.5 text-muted-foreground" aria-hidden />
          <span className="sr-only">به</span>
          {airportShortCity(r.destinationCode)}
        </Link>
      ))}
    </nav>
  );
}

/** Cities rather than airports: Tehran's two airports (domestic and international) count as one origin. */
const TEASER_ORIGINS = [
  { codes: ["THR", "IKA"], name: "تهران" },
  { codes: ["MHD"], name: "مشهد" },
  { codes: ["SYZ"], name: "شیراز" },
];

/** Top five cheapest destinations from a few big cities, linking to the full explore page. */
function CheapDestinations() {
  const [originIndex, setOriginIndex] = useState(0);
  const origin = TEASER_ORIGINS[originIndex];
  const codes = origin.codes.join(",");
  const query = useApiQuery(`explore:${codes}:30:all`, (signal) => api.explore(codes, 30, "all", signal));
  const top = query.data?.destinations.slice(0, 5) ?? [];

  // Stacked on phones; from lg the heading and origin picker sit beside the list, so a price is never
  // a full page width away from its destination.
  return (
    <section
      className="container-page grid gap-x-10 gap-y-5 py-12 [grid-template-areas:'head'_'list'] sm:py-16 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:[grid-template-areas:'head_list']"
      aria-labelledby="cheap-heading"
    >
      <div className="flex flex-col items-start gap-4 [grid-area:head]">
        <div>
          <h2 id="cheap-heading" className="text-xl font-bold sm:text-2xl">
            ارزان‌ترین مقصدها در ۳۰ روز آینده
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">کمترین قیمت بلیط اکونومی به هر مقصد</p>
        </div>
        <Segmented
          legend="مبدا"
          options={TEASER_ORIGINS.map((o, i) => ({ value: i, label: `از ${o.name}` }))}
          value={originIndex}
          onChange={setOriginIndex}
          className="max-w-full overflow-x-auto"
        >
          <span className="mx-1 my-1.5 w-px shrink-0 bg-border" aria-hidden />
          <Link
            to={`/explore?from=${origin.codes[0]}`}
            className="flex h-8 items-center gap-1 rounded-[5px] px-3 text-sm font-medium whitespace-nowrap text-primary transition-colors hover:bg-card focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            همه مقصدها
            <ArrowLeft className="size-3.5" aria-hidden />
          </Link>
        </Segmented>
      </div>
      <div className="[grid-area:list]">
        {query.error && !query.data ? (
          <p className="text-sm text-muted-foreground">فهرست مقصدها الان در دسترس نیست.</p>
        ) : query.isLoading ? (
          <DestinationListSkeleton rows={5} />
        ) : top.length ? (
          <DestinationList
            destinations={top}
            compact
            showOrigin={origin.codes.length > 1}
            fetching={query.isFetching}
          />
        ) : (
          <p className="text-sm text-muted-foreground">فعلاً پروازی از {origin.name} ثبت نشده است.</p>
        )}
      </div>
    </section>
  );
}

const STEPS = [
  {
    title: "مسیر و تاریخ را انتخاب کنید",
    body: "از میان بیش از ۳۰ فرودگاه داخلی و بین‌المللی، مبدا و مقصدتان را انتخاب کنید.",
  },
  {
    title: "قیمت‌ها را مقایسه کنید",
    body: "همه پروازهای مسیر با قیمت همه آژانس‌ها، یکجا و مرتب‌شده بر اساس بهترین ارزش.",
  },
  {
    title: "از سایت آژانس بخرید",
    body: "روی قیمت دلخواه بزنید و خرید را مستقیم در سایت همان آژانس نهایی کنید.",
  },
];

const FEATURES = [
  {
    icon: LineChart,
    title: "مقایسه آژانس‌ها",
    body: "قیمت یک پرواز را در همه آژانس‌ها ببینید و ارزان‌ترین را انتخاب کنید، بدون گشتن بین سایت‌ها.",
  },
  {
    icon: Filter,
    title: "فیلتر و مرتب‌سازی",
    body: "نتایج را بر اساس قیمت، ساعت حرکت، تعداد توقف و ایرلاین دقیقاً همان‌طور که می‌خواهید ببینید.",
  },
  {
    icon: TrendingDown,
    title: "پیشنهاد شفاف",
    body: "بهترین ترکیب قیمت، زمان پرواز و سابقه ایرلاین را پیشنهاد می‌کنیم و دلیلش را هم می‌گوییم.",
  },
  {
    icon: Heart,
    title: "ذخیره و پیگیری",
    body: "پروازهای موردنظر را ذخیره کنید و بعداً از داشبورد مقایسه و خریدشان کنید.",
  },
];

export default function Landing() {
  useDocumentTitle();

  return (
    <PageShell>
      <section className="bg-dotted border-b">
        <div className="container-page py-8 sm:py-14 lg:py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h1 className="text-balance text-2xl font-extrabold leading-snug sm:text-4xl sm:leading-tight">
              ارزان‌ترین بلیط هواپیما را <span className="text-primary">در یک جستجو</span> پیدا کنید
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-pretty text-sm leading-7 text-muted-foreground sm:mt-4 sm:text-base sm:leading-8">
              پروازیاب قیمت هر پرواز را بین آژانس‌های مختلف مقایسه می‌کند تا بدون گشتن بین سایت‌ها، بهترین قیمت را
              ببینید.
            </p>
          </div>

          <div className="mx-auto mt-6 max-w-5xl sm:mt-8">
            <SearchWidget />
            <div className="mt-5 space-y-5">
              <RecentSearches />
              <PopularRoutes />
            </div>
          </div>
        </div>
      </section>

      <CheapDestinations />

      <section className="container-page py-12 sm:py-16" aria-labelledby="how-heading">
        <h2 id="how-heading" className="text-center text-xl font-bold sm:text-2xl">
          چطور کار می‌کند؟
        </h2>
        <ol className="mt-8 grid gap-4 sm:grid-cols-3 sm:gap-6">
          {STEPS.map((s, i) => (
            <li key={s.title} className="rounded-lg border bg-card p-5">
              <span className="flex size-8 items-center justify-center rounded-md bg-primary/10 text-sm font-bold text-primary">
                {toFaDigits(i + 1)}
              </span>
              <h3 className="mt-3 font-semibold">{s.title}</h3>
              <p className="mt-1.5 text-sm leading-7 text-muted-foreground">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="container-page" aria-labelledby="why-heading">
        <div className="rounded-lg border bg-card px-5 py-8 sm:px-8 sm:py-10">
          <h2 id="why-heading" className="text-center text-xl font-bold sm:text-2xl">
            چرا پروازیاب؟
          </h2>
          <div className="mt-6 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
            {/* Icon beside the text on phones, above it from sm. */}
            {FEATURES.map((f) => (
              <div key={f.title} className="flex items-start gap-3 sm:block">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <f.icon className="size-5" aria-hidden />
                </div>
                <div>
                  <h3 className="font-semibold sm:mt-3">{f.title}</h3>
                  <p className="mt-1 text-sm leading-7 text-muted-foreground sm:mt-1.5">{f.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="container-page py-12 sm:py-16" aria-labelledby="agency-heading">
        <div className="flex flex-col items-start justify-between gap-6 rounded-lg border bg-card p-6 sm:p-8 md:flex-row md:items-center">
          <div className="max-w-xl">
            <h2 id="agency-heading" className="text-xl font-bold sm:text-2xl">
              آژانس مسافرتی دارید؟
            </h2>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              با حساب آژانسی، پروازهایتان را در پروازیاب منتشر کنید. مسافرها قیمت شما را کنار بقیه می‌بینند و مستقیم به
              سایت شما می‌رسند.
            </p>
            <ul className="mt-4 space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <BadgeCheck className="size-4 text-primary" aria-hidden />
                انتشار و ویرایش نامحدود پرواز
              </li>
              <li className="flex items-center gap-2">
                <Store className="size-4 text-primary" aria-hidden />
                نمایش نام آژانس در کنار قیمت‌ها
              </li>
            </ul>
          </div>
          <Button size="lg" asChild className="w-full shrink-0 md:w-auto">
            <Link to="/auth?returnTo=%2Fdashboard">
              ثبت‌نام آژانس
              <ArrowLeft aria-hidden />
            </Link>
          </Button>
        </div>
      </section>
    </PageShell>
  );
}
