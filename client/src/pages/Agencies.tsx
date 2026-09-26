import { Link } from "react-router";
import { ChevronLeft, Store } from "lucide-react";
import { RatingChip, VerifiedMark } from "@/components/agencies/AgencyBits";
import { LoadError } from "@/components/dashboard/common";
import { PageShell } from "@/components/layout/PageShell";
import { StateMessage } from "@/components/StateMessage";
import { Skeleton } from "@/components/ui/skeleton";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { api } from "@/lib/api";
import { toFaDigits } from "@/lib/persian";
import { useApiQuery } from "@/lib/use-api-query";

/** `/agencies`: every agency with something on sale, verified and credibly well-rated first. */
export default function AgenciesPage() {
  useDocumentTitle("آژانس‌ها");
  const agencies = useApiQuery("agencies", (signal) => api.agencies.list(signal));

  return (
    <PageShell className="container-page max-w-3xl py-6 md:py-8">
      <h1 className="text-2xl font-bold">آژانس‌های پروازیاب</h1>
      <p className="mt-1 text-sm leading-7 text-muted-foreground">
        آژانس‌هایی که پروازهایشان را در پروازیاب می‌فروشند، با امتیاز و نظر مسافران. آژانس‌های تأییدشده{" "}
        <VerifiedMark className="inline size-3.5 align-[-2px]" /> مدارکشان بررسی شده است.
      </p>

      <div className="mt-6">
        {agencies.error && !agencies.data ? (
          <LoadError error={agencies.error} onRetry={agencies.refetch} />
        ) : agencies.isLoading ? (
          <div className="space-y-2" aria-hidden>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 rounded-lg" />
            ))}
          </div>
        ) : agencies.data?.length ? (
          <ul className="divide-y rounded-lg border bg-card">
            {agencies.data.map((a) => (
              <li key={a.slug}>
                <Link
                  to={`/agencies/${encodeURIComponent(a.slug)}`}
                  className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 font-semibold">
                      <span className="truncate">{a.name}</span>
                      {a.verified ? <VerifiedMark className="size-3.5" /> : null}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      {a.city ? <span>{a.city}</span> : null}
                      <span>{toFaDigits(a.listings)} پرواز در فروش</span>
                      {a.rating ? <RatingChip rating={a.rating} /> : <span>هنوز نظری ندارد</span>}
                    </span>
                  </span>
                  <ChevronLeft className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <StateMessage icon={Store} title="هنوز آژانسی پرواز نفروخته است" />
        )}
      </div>
    </PageShell>
  );
}
