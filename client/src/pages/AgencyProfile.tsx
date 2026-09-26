import { useState } from "react";
import { Link, useLocation, useParams } from "react-router";
import { ChevronRight, ExternalLink, Flag, Loader2, Phone, SearchX, Trash2 } from "lucide-react";
import { ReasonDialog, type ReasonRequest } from "@/components/admin/ReasonDialog";
import { toast } from "sonner";
import { RatingChip, VerifiedMark } from "@/components/agencies/AgencyBits";
import { StarInput, StarRow } from "@/components/agencies/Stars";
import { FormError } from "@/components/auth/fields";
import { LoadError, RouteLabel } from "@/components/dashboard/common";
import { PageShell } from "@/components/layout/PageShell";
import { StateMessage } from "@/components/StateMessage";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { isGuest } from "@/lib/account";
import { formatRating } from "@/lib/agencies";
import { ApiError, api, safeExternalUrl } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { formatJalaliDate, formatPrice, toFaDigits } from "@/lib/persian";
import { searchUrl } from "@/lib/search-state";
import type { AgencyProfile, AgencyReview } from "@/lib/types";
import { useApiQuery } from "@/lib/use-api-query";
import { cn } from "@/lib/utils";

const PAGE = 10;

/** Reviews per star as horizontal bars, 5★ on top; the counts are written out, the bars only compare. */
function RatingSummary({ rating }: { rating: AgencyProfile["rating"] }) {
  const max = Math.max(1, ...rating.histogram);
  return (
    <section aria-labelledby="rating-heading" className="rounded-lg border bg-card p-4 sm:p-5">
      <h2 id="rating-heading" className="sr-only">
        امتیاز مسافران
      </h2>
      {rating.average === null ? (
        <p className="text-sm text-muted-foreground">هنوز نظری ثبت نشده است.</p>
      ) : (
        <>
          <div className="flex items-end gap-3">
            <span className="text-4xl leading-none font-extrabold tabular-nums">{formatRating(rating.average)}</span>
            <span className="pb-0.5">
              <StarRow value={rating.average} />
              <span className="block text-xs text-muted-foreground">از {toFaDigits(rating.count)} نظر</span>
            </span>
          </div>
          <ol className="mt-4 space-y-1.5" aria-label="تعداد نظرها برای هر امتیاز">
            {[5, 4, 3, 2, 1].map((stars) => {
              const count = rating.histogram[stars - 1];
              return (
                <li key={stars} className="flex items-center gap-2 text-xs">
                  <span className="w-12 shrink-0 text-muted-foreground">{toFaDigits(stars)} ستاره</span>
                  <span className="h-2 flex-1 rounded-full bg-muted" aria-hidden>
                    <span
                      className="block h-full rounded-full bg-amber-500"
                      style={{ width: `${(count / max) * 100}%` }}
                    />
                  </span>
                  <span className="w-6 shrink-0 text-end tabular-nums">{toFaDigits(count)}</span>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </section>
  );
}

function ReviewItem({ review, onReport }: { review: AgencyReview; onReport?: (review: AgencyReview) => void }) {
  return (
    <li className="py-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <StarRow value={review.rating} />
        <span className="text-sm font-medium">{review.author}</span>
        <span className="text-xs text-muted-foreground">
          {formatJalaliDate(review.createdAt)}
          {review.edited ? " · ویرایش‌شده" : ""}
        </span>
        {review.mine ? <span className="rounded-[5px] bg-muted px-1.5 py-0.5 text-xs">نظر شما</span> : null}
        {onReport && !review.mine ? (
          <button
            type="button"
            className="ms-auto inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            onClick={() => onReport(review)}
          >
            <Flag className="size-3" aria-hidden />
            گزارش
          </button>
        ) : null}
      </div>
      {review.body ? <p className="mt-2 text-sm leading-7 whitespace-pre-line">{review.body}</p> : null}
      {review.reply ? (
        <div className="mt-3 border-s-2 border-chart-1/40 ps-3">
          <p className="text-xs font-medium text-muted-foreground">پاسخ آژانس</p>
          <p className="mt-1 text-sm leading-7 whitespace-pre-line">{review.reply}</p>
        </div>
      ) : null}
    </li>
  );
}

/** The signed-in traveller's own review: write, edit or delete. Explains why when they can't. */
function MyReview({ slug, mine, onSaved }: { slug: string; mine: AgencyReview | null; onSaved: () => void }) {
  const { user } = useAuth();
  const location = useLocation();
  const [rating, setRating] = useState(mine?.rating ?? 0);
  const [body, setBody] = useState(mine?.body ?? "");
  const [busy, setBusy] = useState<"save" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!user) {
    return (
      <p className="rounded-lg border bg-muted/30 px-4 py-3 text-sm">
        برای ثبت نظر{" "}
        <Link
          to={`/auth?returnTo=${encodeURIComponent(location.pathname)}`}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          وارد شوید
        </Link>
        .
      </p>
    );
  }
  if (user.accountRole === "agency" || user.role === "admin") return null;
  if (isGuest(user)) {
    return <p className="rounded-lg border bg-muted/30 px-4 py-3 text-sm">حساب مهمان نمی‌تواند نظر ثبت کند.</p>;
  }
  if (!user.emailVerifiedAt && !user.phoneVerifiedAt) {
    return (
      <p className="rounded-lg border bg-muted/30 px-4 py-3 text-sm leading-7">
        برای ثبت نظر، اول ایمیل یا شمارهٔ موبایل حسابتان را تأیید کنید.{" "}
        <Link to="/dashboard/account" className="font-medium text-primary underline-offset-4 hover:underline">
          تنظیمات حساب
        </Link>
      </p>
    );
  }

  const save = async () => {
    if (!rating) {
      setError("یک تا پنج ستاره انتخاب کنید.");
      return;
    }
    setBusy("save");
    setError(null);
    try {
      await api.agencies.saveReview(slug, { rating, body: body.trim() });
      toast.success(mine ? "نظر شما به‌روز شد" : "نظر شما ثبت شد");
      onSaved();
    } catch (err) {
      setError(errorMessage(err, "نظر ثبت نشد. دوباره تلاش کنید."));
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    setBusy("delete");
    try {
      await api.agencies.deleteReview(slug);
      setRating(0);
      setBody("");
      toast.success("نظر شما حذف شد");
      onSaved();
    } catch (err) {
      toast.error(errorMessage(err, "حذف انجام نشد."));
    } finally {
      setBusy(null);
    }
  };

  return (
    <form
      className="rounded-lg border bg-card p-4 sm:p-5"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <h3 className="mb-3 text-sm font-semibold">{mine ? "نظر شما" : "تجربهٔ خرید از این آژانس چطور بود؟"}</h3>
      {mine?.hidden ? (
        <p className="mb-3 rounded-md bg-muted px-3 py-2 text-xs leading-6">
          این نظر را مدیر سایت پنهان کرده است و به دیگران نشان داده نمی‌شود.
        </p>
      ) : null}
      <StarInput value={rating} onChange={setRating} disabled={busy !== null} />
      <label className="mt-3 block">
        <span className="sr-only">متن نظر (اختیاری)</span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={1000}
          rows={3}
          placeholder="اختیاری: از خرید، پشتیبانی یا استرداد بنویسید."
          className="w-full resize-y rounded-md border bg-transparent px-3 py-2 text-sm leading-7 outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          disabled={busy !== null}
        />
      </label>
      <div className="mt-1 text-end text-xs text-muted-foreground tabular-nums">{toFaDigits(body.length)}/۱۰۰۰</div>
      <FormError message={error} className="mt-2" />
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="submit" disabled={busy !== null}>
          {busy === "save" ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {mine ? "ذخیرهٔ تغییرات" : "ثبت نظر"}
        </Button>
        {mine ? (
          <Button type="button" variant="ghost" onClick={() => void remove()} disabled={busy !== null}>
            {busy === "delete" ? <Loader2 className="animate-spin" aria-hidden /> : <Trash2 aria-hidden />}
            حذف نظر
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function Reviews({ slug }: { slug: string }) {
  const { user } = useAuth();
  const [reporting, setReporting] = useState<ReasonRequest | null>(null);
  const canReport = user !== null && !isGuest(user);
  const report = (review: AgencyReview) =>
    setReporting({
      title: "گزارش این نظر",
      description: "مدیر پروازیاب نظر را بررسی می‌کند و اگر توهین‌آمیز، تبلیغاتی یا نادرست باشد پنهانش می‌کند.",
      confirmLabel: "ثبت گزارش",
      placeholder: "چه مشکلی دارد؟ مثلاً توهین، تبلیغ یا اطلاعات نادرست.",
      fieldLabel: "دلیل گزارش (اختیاری)",
      tone: "default",
      run: async (reason) => {
        try {
          await api.agencies.reportReview(slug, review.id, reason);
          toast.success("گزارش شما ثبت شد");
        } catch (err) {
          toast.error(errorMessage(err, "گزارش ثبت نشد."));
          throw err;
        }
      },
    });
  const [version, setVersion] = useState(0);
  const first = useApiQuery(`agency-reviews:${slug}:${user?.id ?? "anon"}:${version}`, (signal) =>
    api.agencies.reviews(slug, { limit: PAGE }, signal),
  );
  const [paged, setPaged] = useState<{ key: string | null; items: AgencyReview[]; done: boolean }>({
    key: null,
    items: [],
    done: false,
  });
  const [loadingMore, setLoadingMore] = useState(false);
  // Pages loaded for an older first page (before a review was written, or before signing in) no longer apply.
  const more = paged.key === first.dataKey ? paged : { key: first.dataKey, items: [], done: false };
  const done = more.done;

  const items = [...(first.data?.items ?? []), ...more.items];
  const loadMore = async () => {
    const last = items.at(-1);
    if (!last) return;
    setLoadingMore(true);
    try {
      const page = await api.agencies.reviews(slug, { before: last.createdAt, limit: PAGE });
      setPaged({ key: first.dataKey, items: [...more.items, ...page.items], done: page.items.length < PAGE });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <section aria-labelledby="reviews-heading" className="mt-8">
      <h2 id="reviews-heading" className="mb-3 text-lg font-bold">
        نظر مسافران
      </h2>
      {first.data ? (
        <MyReview key={first.dataKey} slug={slug} mine={first.data.mine} onSaved={() => setVersion((v) => v + 1)} />
      ) : null}
      {first.error && !first.data ? (
        <LoadError error={first.error} onRetry={first.refetch} />
      ) : first.isLoading ? (
        <Skeleton className="mt-4 h-32 rounded-lg" aria-hidden />
      ) : items.length ? (
        <>
          <ul className="mt-2 divide-y">
            {items.map((r) => (
              <ReviewItem key={r.id} review={r} onReport={canReport ? report : undefined} />
            ))}
          </ul>
          {!done && (first.data?.items.length ?? 0) >= PAGE ? (
            <Button variant="outline" onClick={() => void loadMore()} disabled={loadingMore}>
              {loadingMore ? <Loader2 className="animate-spin" aria-hidden /> : null}
              نظرهای بیشتر
            </Button>
          ) : null}
        </>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">هنوز نظری ثبت نشده است؛ اولین نفر باشید.</p>
      )}
      <ReasonDialog request={reporting} onClose={() => setReporting(null)} />
    </section>
  );
}

export default function AgencyProfilePage() {
  const { slug = "" } = useParams();
  const profile = useApiQuery(`agency:${slug}`, (signal) => api.agencies.get(slug, signal));
  useDocumentTitle(profile.data?.name ?? "آژانس");
  const p = profile.data;
  const website = p?.website ? safeExternalUrl(p.website) : undefined;

  const back = (
    <Link
      to="/agencies"
      className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
    >
      <ChevronRight className="size-4" aria-hidden />
      همهٔ آژانس‌ها
    </Link>
  );

  if (profile.error instanceof ApiError && profile.error.status === 404) {
    return (
      <PageShell className="container-page max-w-4xl py-6">
        {back}
        <StateMessage
          className="mt-4"
          icon={SearchX}
          title="این آژانس پیدا نشد"
          description="ممکن است نشانی صفحه‌اش عوض شده باشد."
        />
      </PageShell>
    );
  }

  return (
    <PageShell className="container-page max-w-4xl py-6 md:py-8">
      {back}
      {profile.error && !p ? (
        <LoadError error={profile.error} onRetry={profile.refetch} />
      ) : !p ? (
        <div className="mt-4 space-y-3" aria-hidden>
          <Skeleton className="h-9 w-64 rounded-md" />
          <Skeleton className="h-24 rounded-lg" />
        </div>
      ) : (
        <>
          <header className="mt-3">
            <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold">
              {p.name}
              {p.verified ? (
                <span className="inline-flex items-center gap-1 rounded-[5px] bg-chart-1/10 px-1.5 py-0.5 text-xs font-medium text-chart-1">
                  <VerifiedMark className="size-3.5" />
                  تأییدشده
                </span>
              ) : null}
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              {p.city ? <span>{p.city}</span> : null}
              <span>در پروازیاب از {formatJalaliDate(p.since)}</span>
              {p.licenseNo ? <span>مجوز {p.licenseNo}</span> : null}
              {p.rating.average !== null ? (
                <RatingChip rating={{ average: p.rating.average, count: p.rating.count }} />
              ) : null}
            </p>
            {website || p.supportPhone ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {website ? (
                  <Button asChild variant="outline" size="sm">
                    <a href={website} target="_blank" rel="noopener noreferrer">
                      <ExternalLink aria-hidden />
                      وب‌سایت آژانس
                    </a>
                  </Button>
                ) : null}
                {p.supportPhone ? (
                  <Button asChild variant="outline" size="sm">
                    <a href={`tel:${p.supportPhone.replace(/[^\d+]/g, "")}`}>
                      <Phone aria-hidden />
                      <bdi dir="ltr" className="tabular-nums">
                        {toFaDigits(p.supportPhone)}
                      </bdi>
                    </a>
                  </Button>
                ) : null}
              </div>
            ) : null}
            {p.description ? (
              <p className="mt-4 max-w-2xl text-sm leading-8 whitespace-pre-line">{p.description}</p>
            ) : null}
          </header>

          <div className="mt-6 grid gap-4 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] md:items-start">
            <section aria-labelledby="routes-heading" className="rounded-lg border bg-card">
              <h2 id="routes-heading" className="border-b px-4 py-3 text-sm font-semibold">
                مسیرهایی که الان می‌فروشد
              </h2>
              {p.routes.length ? (
                <ul className="divide-y">
                  {p.routes.map((r) => (
                    <li key={`${r.originCode}-${r.destinationCode}`}>
                      <Link
                        to={searchUrl({ from: r.originCode, to: r.destinationCode })}
                        className={cn(
                          "flex items-center justify-between gap-3 px-4 py-2.5 text-sm transition-colors",
                          "hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none",
                        )}
                      >
                        <span className="min-w-0 truncate">
                          <RouteLabel from={r.originCode} to={r.destinationCode} />
                          <span className="ms-2 text-xs text-muted-foreground">{toFaDigits(r.flights)} پرواز</span>
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          از{" "}
                          <span className="font-semibold text-foreground tabular-nums">{formatPrice(r.minPrice)}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-4 py-6 text-sm text-muted-foreground">فعلاً پروازی در فروش ندارد.</p>
              )}
            </section>
            <RatingSummary rating={p.rating} />
          </div>

          <Reviews slug={p.slug} />
        </>
      )}
    </PageShell>
  );
}
