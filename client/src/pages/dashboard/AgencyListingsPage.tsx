import { useState } from "react";
import { toast } from "sonner";
import { BarChart3, Building2, ExternalLink, Loader2, Pencil, Plane, Plus, Store, Trash2 } from "lucide-react";
import { ListingForm } from "@/components/dashboard/ListingForm";
import { LoadError, RouteLabel, StatBox } from "@/components/dashboard/common";
import { OfferTags } from "@/components/flights/FlightCard";
import { StateMessage } from "@/components/StateMessage";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { airportShortCity } from "@/domain/airports";
import { api, safeExternalUrl } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { formatJalaliDate, formatPrice, formatTime, formatToman, toFaDigits } from "@/lib/persian";
import type { Listing } from "@/lib/types";
import { useApiQuery } from "@/lib/use-api-query";
import { cn } from "@/lib/utils";

export default function AgencyListingsPage() {
  const stats = useApiQuery("agency-stats", (signal) => api.dashboard.stats(signal), ["listings"]);
  const listings = useApiQuery("agency-listings", (signal) => api.dashboard.listings(signal), ["listings"]);
  const [editor, setEditor] = useState<{ open: boolean; listing?: Listing }>({
    open: false,
  });
  const [toDelete, setToDelete] = useState<Listing | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  useDocumentTitle("پروازهای آژانس");

  const toggleActive = async (l: Listing) => {
    setBusyId(l.id);
    try {
      await api.dashboard.setListingActive(l.id, !l.isActive);
      listings.setData((rows) => rows?.map((r) => (r.id === l.id ? { ...r, isActive: !l.isActive } : r)));
      stats.refetch();
      toast.success(l.isActive ? "پرواز از نتایج جستجو خارج شد" : "پرواز در نتایج جستجو نمایش داده می‌شود");
    } catch (err) {
      toast.error(errorMessage(err, "تغییر وضعیت ناموفق بود."));
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    const target = toDelete;
    setBusyId(target.id);
    try {
      await api.dashboard.deleteListing(target.id);
      listings.setData((rows) => rows?.filter((r) => r.id !== target.id));
      stats.refetch();
      toast.success("پرواز حذف شد");
    } catch (err) {
      toast.error(errorMessage(err, "حذف ناموفق بود."));
    } finally {
      setBusyId(null);
      setToDelete(null);
    }
  };

  let content;
  if (listings.error && !listings.data) content = <LoadError error={listings.error} onRetry={listings.refetch} />;
  else if (listings.isLoading)
    content = (
      <div className="space-y-2" aria-hidden>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </div>
    );
  else if (!listings.data?.length)
    content = (
      <StateMessage
        icon={Store}
        title="هنوز پروازی منتشر نکرده‌اید"
        description="با دکمه «پرواز جدید» اولین پروازتان را منتشر کنید تا در نتایج جستجو دیده شود."
      />
    );
  else
    content = (
      <ul className="divide-y overflow-hidden rounded-lg border bg-card">
        {listings.data.map((l) => {
          const url = safeExternalUrl(l.bookingUrl);
          return (
            <li key={l.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 p-4">
              <div className="min-w-0 flex-1 basis-60">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-semibold">
                    <RouteLabel from={l.originCode} to={l.destinationCode} />
                  </span>
                  <span
                    className={cn(
                      "rounded-md px-2 py-0.5 text-[11px] font-medium",
                      l.isActive ? "bg-success/10 text-success" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {l.isActive ? "فعال" : "غیرفعال"}
                  </span>
                  {l.suspendedAt ? (
                    <span className="rounded-md bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
                      معلق توسط مدیر
                    </span>
                  ) : null}
                </div>
                {l.suspendedAt ? (
                  <p className="mt-1 text-xs leading-6 text-destructive">
                    این پرواز به مسافران نشان داده نمی‌شود{l.suspensionReason ? `: ${l.suspensionReason}` : "."}
                  </p>
                ) : null}
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {l.airline} · <bdi className="font-mono text-xs">{l.flightNo}</bdi> · {formatJalaliDate(l.departAt)}{" "}
                  ساعت {formatTime(l.departAt)}
                  <OfferTags offer={l} />
                </p>
              </div>
              <div className="flex w-full items-center justify-between gap-3 sm:w-auto">
                <div className="font-bold tabular-nums">{formatPrice(l.priceToman)}</div>
                <div className="flex items-center gap-1">
                  <Switch
                    checked={l.isActive}
                    disabled={busyId === l.id}
                    onCheckedChange={() => void toggleActive(l)}
                    aria-label={`نمایش پرواز ${l.flightNo} در نتایج`}
                    className="me-2"
                  />
                  {url ? (
                    <Button asChild variant="ghost" size="icon" aria-label="باز کردن لینک رزرو">
                      <a href={url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink />
                      </a>
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setEditor({ open: true, listing: l })}
                    aria-label={`ویرایش پرواز ${l.flightNo}`}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => setToDelete(l)}
                    disabled={busyId === l.id}
                    aria-label={`حذف پرواز ${l.flightNo}`}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    );

  return (
    <div className="space-y-5">
      {stats.data ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatBox icon={Plane} label="کل پروازها" value={toFaDigits(stats.data.total)} />
          <StatBox icon={Store} label="فعال" value={toFaDigits(stats.data.active)} />
          <StatBox
            icon={BarChart3}
            label="میانگین قیمت"
            value={stats.data.avgPrice ? formatToman(stats.data.avgPrice) : "—"}
          />
          <StatBox
            icon={Building2}
            label="ارزان‌ترین"
            value={stats.data.minPrice ? formatToman(stats.data.minPrice) : "—"}
          />
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold">پروازهای من</h2>
        <Button onClick={() => setEditor({ open: true })}>
          <Plus aria-hidden />
          پرواز جدید
        </Button>
      </div>

      {content}

      <Dialog open={editor.open} onOpenChange={(open) => setEditor((e) => ({ ...e, open }))}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editor.listing ? "ویرایش پرواز" : "انتشار پرواز جدید"}</DialogTitle>
            <DialogDescription>پس از انتشار، پرواز در نتایج جستجوی این مسیر نمایش داده می‌شود.</DialogDescription>
          </DialogHeader>
          {editor.open ? (
            <ListingForm
              key={editor.listing?.id ?? "new"}
              listing={editor.listing}
              onSuccess={() => setEditor({ open: false })}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog open={toDelete !== null} onOpenChange={(open) => !open && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>این پرواز حذف شود؟</AlertDialogTitle>
            <AlertDialogDescription>
              {toDelete ? (
                <>
                  پرواز <bdi>{toDelete.flightNo}</bdi> ({airportShortCity(toDelete.originCode)} به{" "}
                  {airportShortCity(toDelete.destinationCode)}) برای همیشه حذف می‌شود. اگر فقط می‌خواهید موقتاً دیده
                  نشود، آن را غیرفعال کنید.
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
            >
              {busyId === toDelete?.id ? <Loader2 className="animate-spin" aria-hidden /> : null}
              حذف پرواز
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
