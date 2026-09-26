import { useState, type ComponentType } from "react";
import { Link, useSearchParams } from "react-router";
import { toast } from "sonner";
import {
  BarChart3,
  Building2,
  ExternalLink,
  Heart,
  Info,
  Loader2,
  Pencil,
  Plane,
  Plus,
  RotateCcw,
  ShieldCheck,
  Store,
  Trash2,
  Users,
  WifiOff,
} from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { ListingForm } from "@/components/dashboard/ListingForm";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useSavedFlights } from "@/hooks/use-saved-flights";
import { api, safeExternalUrl } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { useApiQuery } from "@/lib/use-api-query";
import { airportShortCity } from "@/domain/airports";
import {
  formatDuration,
  formatJalaliDate,
  formatPrice,
  formatStops,
  formatTime,
  formatToman,
  toFaDigits,
} from "@/lib/persian";
import { searchUrl } from "@/lib/search-state";
import type { Listing, User } from "@/lib/types";
import { cn } from "@/lib/utils";

const isGuest = (u: User) => u.email.endsWith("@guest.parvazyab.local");

function RouteLabel({ from, to }: { from: string; to: string }) {
  return (
    <>
      {airportShortCity(from)} <span className="text-muted-foreground">به</span> {airportShortCity(to)}
    </>
  );
}

function LoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <StateMessage
      tone="error"
      icon={WifiOff}
      title="اطلاعات دریافت نشد"
      description={errorMessage(error)}
      action={
        <Button variant="outline" onClick={onRetry}>
          <RotateCcw />
          تلاش دوباره
        </Button>
      }
    />
  );
}

function StatBox({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="size-3.5" aria-hidden />
        {label}
      </div>
      <p className="mt-1.5 truncate text-lg font-bold tabular-nums sm:text-xl">{value}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Saved flights (every signed-in user)
// ---------------------------------------------------------------------------

function SavedFlightsTab() {
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
          <Skeleton key={i} className="h-28 rounded-xl" />
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
          <li key={f.id} className={cn("rounded-xl border bg-card p-4", departed && "opacity-70")}>
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

// ---------------------------------------------------------------------------
// Agency listings
// ---------------------------------------------------------------------------

function AgencyTab() {
  const stats = useApiQuery("agency-stats", (signal) => api.dashboard.stats(signal), ["listings"]);
  const listings = useApiQuery("agency-listings", (signal) => api.dashboard.listings(signal), ["listings"]);
  const [editor, setEditor] = useState<{ open: boolean; listing?: Listing }>({
    open: false,
  });
  const [toDelete, setToDelete] = useState<Listing | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

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
          <Skeleton key={i} className="h-20 rounded-xl" />
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
      <ul className="divide-y overflow-hidden rounded-xl border bg-card">
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
                      "rounded-full px-2 py-0.5 text-[11px] font-medium",
                      l.isActive ? "bg-success/10 text-success" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {l.isActive ? "فعال" : "غیرفعال"}
                  </span>
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {l.airline} · <bdi className="font-mono text-xs">{l.flightNo}</bdi> · {formatJalaliDate(l.departAt)}{" "}
                  ساعت {formatTime(l.departAt)}
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

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

const ROLE_LABEL = { admin: "مدیر", agency: "آژانس", user: "کاربر" } as const;

function AdminTab({ currentUserId }: { currentUserId: string }) {
  const stats = useApiQuery("admin-stats", (signal) => api.admin.stats(signal));
  const users = useApiQuery("admin-users", (signal) => api.admin.users(signal));
  const [savingId, setSavingId] = useState<string | null>(null);

  const changeRole = async (u: User, role: "user" | "agency") => {
    setSavingId(u.id);
    try {
      await api.admin.setRole(u.id, role);
      users.setData((list) => list?.map((x) => (x.id === u.id ? { ...x, role, accountRole: role } : x)));
      stats.refetch();
      toast.success("نقش کاربر تغییر کرد");
    } catch (err) {
      toast.error(errorMessage(err, "تغییر نقش ناموفق بود."));
    } finally {
      setSavingId(null);
    }
  };

  if ((stats.error && !stats.data) || (users.error && !users.data)) {
    return (
      <LoadError
        error={stats.error ?? users.error}
        onRetry={() => {
          stats.refetch();
          users.refetch();
        }}
      />
    );
  }
  if (!stats.data || !users.data) {
    return (
      <div className="space-y-3" aria-hidden>
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  const s = stats.data;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatBox icon={Plane} label="کل پروازها" value={toFaDigits(s.listingsTotal)} />
        <StatBox icon={Store} label="پروازهای فعال" value={toFaDigits(s.listingsActive)} />
        <StatBox icon={Users} label="کاربران" value={toFaDigits(s.usersTotal)} />
        <StatBox icon={Building2} label="آژانس‌ها" value={toFaDigits(s.agencies)} />
      </div>

      {s.topRoutes.length > 0 ? (
        <section aria-labelledby="top-routes">
          <h2 id="top-routes" className="mb-2 font-bold">
            مسیرهای پرپرواز
          </h2>
          <ul className="divide-y rounded-xl border bg-card">
            {s.topRoutes.map((r) => {
              const [from, to] = r.route.split("-");
              return (
                <li key={r.route} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                  <span className="font-medium">
                    <RouteLabel from={from} to={to} />
                  </span>
                  <span className="text-muted-foreground">
                    {toFaDigits(r.count)} پرواز · از {formatPrice(r.minPrice)}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="users-heading">
        <h2 id="users-heading" className="mb-2 font-bold">
          کاربران
        </h2>
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-[32rem] text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="p-3 text-start font-medium">
                  کاربر
                </th>
                <th scope="col" className="p-3 text-start font-medium">
                  نقش
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {users.data.map((u) => {
                const locked = u.role === "admin" || u.id === currentUserId;
                return (
                  <tr key={u.id}>
                    <td className="p-3">
                      <div className="font-medium">{u.agencyName || u.name}</div>
                      <div dir="ltr" className="text-start text-xs text-muted-foreground">
                        {isGuest(u) ? "guest" : u.email}
                      </div>
                    </td>
                    <td className="p-3">
                      {locked ? (
                        <span className="rounded-full bg-muted px-2.5 py-1 text-xs">{ROLE_LABEL[u.role]}</span>
                      ) : (
                        <Select
                          value={u.accountRole}
                          disabled={savingId === u.id}
                          onValueChange={(v) => void changeRole(u, v as "user" | "agency")}
                        >
                          <SelectTrigger size="sm" className="w-28" aria-label={`نقش ${u.name}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="user">کاربر</SelectItem>
                            <SelectItem value="agency">آژانس</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function BecomeAgencyCard({ onUpgraded }: { onUpgraded: () => void }) {
  const { refresh } = useAuth();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (name.trim().length < 2) {
      setError("نام آژانس باید حداقل ۲ حرف باشد.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await api.dashboard.becomeAgency(name.trim());
      await refresh();
      toast.success("حساب آژانس فعال شد");
      onUpgraded();
    } catch (err) {
      setError(errorMessage(err, "ارتقای حساب ناموفق بود."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="mt-8 rounded-xl border border-dashed p-5 sm:p-6" aria-labelledby="become-agency">
      <h2 id="become-agency" className="flex items-center gap-2 font-semibold">
        <Store className="size-4 text-primary" aria-hidden />
        آژانس مسافرتی دارید؟
      </h2>
      <p className="mt-1 text-sm leading-7 text-muted-foreground">
        نام آژانس را وارد کنید تا حساب شما آژانسی شود و بتوانید پرواز منتشر کنید.
      </p>
      <form
        className="mt-4 flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Label htmlFor="agency-name" className="sr-only">
          نام آژانس
        </Label>
        <Input
          id="agency-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="مثلاً آسمان سفر"
          className="h-10 sm:w-64"
          maxLength={60}
          aria-invalid={error ? true : undefined}
        />
        <Button type="submit" disabled={loading} className="h-10">
          {loading ? <Loader2 className="animate-spin" aria-hidden /> : null}
          ارتقا به حساب آژانس
        </Button>
      </form>
      {error ? (
        <p className="mt-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  useDocumentTitle("داشبورد");
  if (!user) return null; // RequireAuth guarantees a user; this narrows the type.

  const isAgency = user.accountRole === "agency";
  const isAdmin = user.role === "admin";
  const tabs = ["saved", ...(isAgency ? ["agency"] : []), ...(isAdmin ? ["admin"] : [])];
  const requested = params.get("tab") ?? "";
  const tab = tabs.includes(requested) ? requested : isAgency ? "agency" : "saved";
  const setTab = (next: string) => setParams({ tab: next }, { replace: true });

  return (
    <PageShell className="container-page py-6 sm:py-8">
      <h1 className="text-2xl font-bold">سلام{user.name ? `، ${user.agencyName || user.name}` : ""}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {isAgency ? "پروازهای آژانس و پروازهای ذخیره‌شده شما" : "پروازهای ذخیره‌شده و حساب شما"}
      </p>

      {isGuest(user) ? (
        <p className="mt-4 flex items-start gap-2 rounded-lg border bg-muted/40 px-3 py-2.5 text-sm leading-7">
          <Info className="mt-1.5 size-4 shrink-0 text-primary" aria-hidden />
          <span>
            با حساب مهمان وارد شده‌اید. پس از خروج، دسترسی به این حساب و پروازهای ذخیره‌شده از بین می‌رود.{" "}
            <Link to="/auth?mode=signup" className="font-medium text-primary underline-offset-4 hover:underline">
              ساخت حساب دائمی
            </Link>
          </span>
        </p>
      ) : null}

      <Tabs value={tab} onValueChange={setTab} className="mt-6">
        {tabs.length > 1 ? (
          <TabsList className="h-10">
            <TabsTrigger value="saved" className="gap-1.5 px-3">
              <Heart aria-hidden />
              ذخیره‌شده‌ها
            </TabsTrigger>
            {isAgency ? (
              <TabsTrigger value="agency" className="gap-1.5 px-3">
                <Store aria-hidden />
                پروازهای آژانس
              </TabsTrigger>
            ) : null}
            {isAdmin ? (
              <TabsTrigger value="admin" className="gap-1.5 px-3">
                <ShieldCheck aria-hidden />
                مدیریت
              </TabsTrigger>
            ) : null}
          </TabsList>
        ) : (
          <h2 className="text-lg font-bold">پروازهای ذخیره‌شده</h2>
        )}

        <TabsContent value="saved" className="mt-4">
          <SavedFlightsTab />
        </TabsContent>
        {isAgency ? (
          <TabsContent value="agency" className="mt-4">
            <AgencyTab />
          </TabsContent>
        ) : null}
        {isAdmin ? (
          <TabsContent value="admin" className="mt-4">
            <AdminTab currentUserId={user.id} />
          </TabsContent>
        ) : null}
      </Tabs>

      {user.role === "user" && !isGuest(user) ? <BecomeAgencyCard onUpgraded={() => setTab("agency")} /> : null}
    </PageShell>
  );
}
