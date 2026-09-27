import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { Heart, Loader2, Trash2 } from "lucide-react";
import { LoadError, RouteLabel } from "@/components/dashboard/common";
import { BecomeAgencyCard } from "@/components/dashboard/BecomeAgencyCard";
import { StateMessage } from "@/components/StateMessage";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useSavedFlights } from "@/hooks/use-saved-flights";
import { isGuest } from "@/lib/account";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { formatDuration, formatJalaliDate, formatPrice, formatStops, formatTime } from "@/lib/persian";
import { searchUrl } from "@/lib/search-state";
import { cn } from "@/lib/utils";

function SavedFlightsList() {
  const saved = useSavedFlights();
  const [removing, setRemoving] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  const remove = async (flightKey: string) => {
    setRemoving(flightKey);
    try {
      await api.saved.remove(flightKey);
      saved.setData((list) => list?.filter((s) => s.flightKey !== flightKey));
      toast.success("از ذخیره‌شده‌ها حذف شد");
    } catch (err) {
      toast.error(errorMessage(err, "حذف انجام نشد. دوباره تلاش کنید."));
    } finally {
      setRemoving(null);
    }
  };

  if (saved.error && !saved.data) return <LoadError error={saved.error} onRetry={saved.refetch} />;
  if (saved.isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2" aria-hidden>
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-28 rounded-lg" />
        ))}
      </div>
    );
  }
  const list = saved.data ?? [];
  if (list.length === 0) {
    return (
      <StateMessage
        icon={Heart}
        title="هنوز پروازی ذخیره نکرده‌اید"
        description="در نتایج جستجو روی آیکن قلب هر پرواز بزنید تا اینجا ذخیره شود."
        action={
          <Button asChild>
            <Link to="/">جستجوی پرواز</Link>
          </Button>
        }
      />
    );
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {list.map((f) => {
        const departed = f.departAt < now;
        return (
          <li key={f.id} className={cn("rounded-lg border bg-card p-4", departed && "opacity-70")}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold">
                  <RouteLabel from={f.originCode} to={f.destinationCode} />
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                  {f.airline}
                  <bdi className="font-mono text-xs">{f.flightNo}</bdi>
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="-me-2 -mt-1 text-muted-foreground hover:text-destructive"
                onClick={() => void remove(f.flightKey)}
                disabled={removing === f.flightKey}
                aria-label={`حذف پرواز ${f.airline} ${f.flightNo} از ذخیره‌شده‌ها`}
              >
                {removing === f.flightKey ? <Loader2 className="animate-spin" /> : <Trash2 />}
              </Button>
            </div>
            <p className="mt-3 text-sm">
              {formatJalaliDate(f.departAt)} · ساعت {formatTime(f.departAt)}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatDuration(f.durationMin)} · {formatStops(f.stops)}
            </p>
            <div className="mt-3 flex items-center justify-between gap-2 border-t pt-3">
              <div>
                <div className="text-[11px] text-muted-foreground">قیمت هنگام ذخیره · {f.agencyName}</div>
                <div className="font-bold tabular-nums">{formatPrice(f.priceToman)}</div>
              </div>
              {departed ? (
                <span className="text-xs text-muted-foreground">پرواز انجام شده</span>
              ) : (
                <Button asChild variant="outline" size="sm">
                  <Link
                    to={searchUrl({
                      from: f.originCode,
                      to: f.destinationCode,
                    })}
                  >
                    قیمت‌های فعلی
                  </Link>
                </Button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default function SavedFlightsPage() {
  const { user } = useAuth();
  useDocumentTitle("پروازهای ذخیره‌شده");
  return (
    <>
      <h2 className="mb-4 text-lg font-bold">پروازهای ذخیره‌شده</h2>
      <SavedFlightsList />
      {user && user.role === "user" && !isGuest(user) ? <BecomeAgencyCard /> : null}
    </>
  );
}
