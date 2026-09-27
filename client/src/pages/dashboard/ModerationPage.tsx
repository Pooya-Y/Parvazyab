import { useState } from "react";
import { Link } from "react-router";
import { Ban, BadgeCheck, ExternalLink, EyeOff, Flag, Loader2, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { ReasonDialog, type ReasonRequest } from "@/components/admin/ReasonDialog";
import { StarRow } from "@/components/agencies/Stars";
import { LoadError } from "@/components/dashboard/common";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { api, safeExternalUrl } from "@/lib/api";
import { airportShortCity } from "@/domain/airports";
import { errorMessage } from "@/lib/errors";
import { reportReasonLabel, reportReasonShort } from "@/lib/listing-reports";
import { formatJalaliWeekday, formatPrice, formatRelativeTime, formatTime, toFaDigits } from "@/lib/persian";
import type { ModerationQueue } from "@/lib/types";
import { useApiQuery } from "@/lib/use-api-query";

type Request = ModerationQueue["verificationRequests"][number];
type Reported = ModerationQueue["reportedReviews"][number];
type ReportedOffer = ModerationQueue["reportedListings"][number];

function Empty({ children }: { children: string }) {
  return <p className="rounded-lg border bg-card px-4 py-6 text-center text-sm text-muted-foreground">{children}</p>;
}

export default function ModerationPage() {
  useDocumentTitle("بررسی‌ها");
  const queue = useApiQuery("admin-moderation", (signal) => api.admin.moderation(signal), ["moderation"]);
  const [busy, setBusy] = useState<string | null>(null);
  const [reason, setReason] = useState<ReasonRequest | null>(null);
  const [now] = useState(() => Date.now());

  /** Runs an action, reports failure, and on success drops the item locally. */
  const act = async (
    key: string,
    run: () => Promise<unknown>,
    done: string,
    update: (q: ModerationQueue) => ModerationQueue,
  ) => {
    setBusy(key);
    try {
      await run();
      queue.setData((q) => (q ? update(q) : q));
      toast.success(done);
    } catch (err) {
      toast.error(errorMessage(err, "انجام نشد. دوباره تلاش کنید."));
      throw err;
    } finally {
      setBusy(null);
    }
  };

  const dropRequest = (id: string) => (q: ModerationQueue) => ({
    ...q,
    verificationRequests: q.verificationRequests.filter((r) => r.agencyId !== id),
  });
  const dropReview = (id: string) => (q: ModerationQueue) => ({
    ...q,
    reportedReviews: q.reportedReviews.filter((r) => r.reviewId !== id),
  });

  const dropOffer = (id: string) => (q: ModerationQueue) => ({
    ...q,
    reportedListings: q.reportedListings.filter((l) => l.listingId !== id),
    counts: { ...q.counts, suspendedListings: q.counts.suspendedListings + 1 },
  });
  const suspendOffer = (l: ReportedOffer) => {
    // Left empty, the agency is told the reporters' main complaint.
    const mainReason = reportReasonLabel(l.reasons[0]?.reason ?? "other");
    setReason({
      title: `پیشنهاد «${l.agencyName}» برای ${l.flightNo} معلق شود؟`,
      description: "از همهٔ نتایج برداشته می‌شود؛ آژانس دلیل را می‌بیند و گزارش‌دهنده‌ها هم خبردار می‌شوند.",
      confirmLabel: "تعلیق پیشنهاد",
      fieldLabel: "دلیل برای آژانس (خالی بماند، دلیل اصلی گزارش‌ها فرستاده می‌شود)",
      placeholder: mainReason,
      run: (note) =>
        act(
          l.listingId,
          () => api.admin.suspendListing(l.listingId, true, note || mainReason),
          "پیشنهاد معلق شد",
          dropOffer(l.listingId),
        ),
    });
  };
  const dismissOffer = (l: ReportedOffer) =>
    void act(
      l.listingId,
      () => api.admin.dismissListingReports(l.listingId),
      "گزارش‌ها رد شد",
      (q) => ({ ...q, reportedListings: q.reportedListings.filter((x) => x.listingId !== l.listingId) }),
    ).catch(() => undefined);

  const approve = (r: Request) =>
    void act(
      r.agencyId,
      () => api.admin.verifyAgency(r.agencyId, true),
      `«${r.name}» تأیید شد`,
      dropRequest(r.agencyId),
    ).catch(() => undefined);
  const reject = (r: Request) =>
    setReason({
      title: `تأیید «${r.name}» رد شود؟`,
      description: "آژانس با خبر شدن از دلیل، پروفایلش را اصلاح می‌کند و دوباره درخواست می‌دهد.",
      confirmLabel: "رد درخواست",
      placeholder: "مثلاً: شمارهٔ مجوز با نام آژانس نمی‌خواند.",
      run: (note) =>
        act(
          r.agencyId,
          () => api.admin.verifyAgency(r.agencyId, false, note),
          "درخواست رد شد",
          dropRequest(r.agencyId),
        ),
    });
  const hide = (r: Reported) =>
    void act(
      r.reviewId,
      () => api.admin.setReviewStatus(r.reviewId, "hidden"),
      "نظر پنهان شد",
      dropReview(r.reviewId),
    ).catch(() => undefined);
  const dismiss = (r: Reported) =>
    void act(r.reviewId, () => api.admin.dismissReports(r.reviewId), "گزارش‌ها رد شد", dropReview(r.reviewId)).catch(
      () => undefined,
    );

  if (queue.error && !queue.data) return <LoadError error={queue.error} onRetry={queue.refetch} />;
  if (!queue.data) return <Skeleton className="h-64 rounded-lg" aria-hidden />;
  const { verificationRequests, reportedReviews, reportedListings, counts } = queue.data;

  return (
    <>
      <h2 className="mb-1 text-lg font-bold">بررسی‌ها</h2>
      <p className="mb-6 text-sm leading-7 text-muted-foreground">
        الان پنهان: {toFaDigits(counts.suspendedAccounts)} حساب،{" "}
        <Link
          to="/dashboard/admin/listings?status=suspended"
          className="text-primary underline-offset-4 hover:underline"
        >
          {toFaDigits(counts.suspendedListings)} پرواز
        </Link>{" "}
        و {toFaDigits(counts.hiddenReviews)} نظر. هر تصمیم در{" "}
        <Link to="/dashboard/admin/audit" className="text-primary underline-offset-4 hover:underline">
          گزارش رویدادها
        </Link>{" "}
        ثبت می‌شود.
      </p>

      <section aria-labelledby="offers-heading">
        <h3 id="offers-heading" className="mb-3 flex items-center gap-2 font-semibold">
          <Flag className="size-4 text-muted-foreground" aria-hidden />
          پیشنهادهای گزارش‌شده
          {reportedListings.length ? (
            <span className="rounded-[5px] bg-primary/10 px-1.5 text-xs text-primary tabular-nums">
              {toFaDigits(reportedListings.length)}
            </span>
          ) : null}
        </h3>
        {reportedListings.length ? (
          <ul className="divide-y rounded-lg border bg-card">
            {reportedListings.map((l) => {
              const site = safeExternalUrl(l.bookingUrl);
              return (
                <li key={l.listingId} className="space-y-2 p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-semibold">
                      {l.airline} <bdi className="font-mono text-sm">{l.flightNo}</bdi> ·{" "}
                      {airportShortCity(l.originCode)} به {airportShortCity(l.destinationCode)}
                    </p>
                    <span className="text-xs text-muted-foreground">{formatRelativeTime(l.lastReportedAt, now)}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {formatJalaliWeekday(l.departAt)}، ساعت {formatTime(l.departAt)} ·{" "}
                    {l.agencySlug ? (
                      <Link
                        to={`/agencies/${encodeURIComponent(l.agencySlug)}`}
                        className="text-foreground underline-offset-4 hover:underline"
                      >
                        {l.agencyName}
                      </Link>
                    ) : (
                      <span className="text-foreground">{l.agencyName}</span>
                    )}{" "}
                    · قیمت در پروازیاب{" "}
                    <span className="font-medium text-foreground tabular-nums">{formatPrice(l.priceToman)}</span>
                  </p>
                  <p className="flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="text-muted-foreground">{toFaDigits(l.reports)} گزارش:</span>
                    {l.reasons.map((r) => (
                      <span key={r.reason} className="rounded-[5px] border px-1.5 py-0.5">
                        {reportReasonShort(r.reason)}
                        {r.count > 1 ? (
                          <span className="ms-1 tabular-nums text-muted-foreground">×{toFaDigits(r.count)}</span>
                        ) : null}
                      </span>
                    ))}
                  </p>
                  {l.notes.length ? (
                    <ul className="space-y-1.5">
                      {l.notes.map((n, i) => (
                        <li key={i} className="border-s-2 ps-3 text-sm leading-7">
                          {n.observedPrice ? (
                            <span className="font-medium">
                              قیمت در سایت آژانس: <span className="tabular-nums">{formatPrice(n.observedPrice)}</span>
                              {n.note ? " · " : ""}
                            </span>
                          ) : null}
                          {n.note}
                          <span className="ms-2 text-xs text-muted-foreground">{formatRelativeTime(n.at, now)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => suspendOffer(l)}
                      disabled={busy === l.listingId}
                    >
                      {busy === l.listingId ? <Loader2 className="animate-spin" aria-hidden /> : <Ban aria-hidden />}
                      تعلیق پیشنهاد
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => dismissOffer(l)} disabled={busy === l.listingId}>
                      گزارش‌ها بی‌پایه است
                    </Button>
                    {site ? (
                      <Button asChild size="sm" variant="ghost">
                        <a href={site} target="_blank" rel="noopener noreferrer">
                          بررسی در سایت آژانس
                          <ExternalLink className="size-3.5" aria-hidden />
                        </a>
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty>پیشنهاد گزارش‌شده‌ای نیست.</Empty>
        )}
      </section>

      <section aria-labelledby="verification-heading" className="mt-8">
        <h3 id="verification-heading" className="mb-3 flex items-center gap-2 font-semibold">
          <ShieldCheck className="size-4 text-muted-foreground" aria-hidden />
          درخواست‌های تأیید آژانس
          {verificationRequests.length ? (
            <span className="rounded-[5px] bg-primary/10 px-1.5 text-xs text-primary tabular-nums">
              {toFaDigits(verificationRequests.length)}
            </span>
          ) : null}
        </h3>
        {verificationRequests.length ? (
          <ul className="divide-y rounded-lg border bg-card">
            {verificationRequests.map((r) => (
              <li key={r.agencyId} className="space-y-2 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link
                    to={`/agencies/${encodeURIComponent(r.slug)}`}
                    className="font-semibold underline-offset-4 hover:underline"
                  >
                    {r.name}
                  </Link>
                  <span className="text-xs text-muted-foreground">{formatRelativeTime(r.requestedAt, now)}</span>
                </div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                  <dt className="text-muted-foreground">مجوز</dt>
                  <dd>{r.licenseNo}</dd>
                  {r.city ? (
                    <>
                      <dt className="text-muted-foreground">شهر</dt>
                      <dd>{r.city}</dd>
                    </>
                  ) : null}
                  {r.website ? (
                    <>
                      <dt className="text-muted-foreground">وب‌سایت</dt>
                      <dd>
                        <bdi dir="ltr" className="break-all">
                          {r.website}
                        </bdi>
                      </dd>
                    </>
                  ) : null}
                  <dt className="text-muted-foreground">پروازها</dt>
                  <dd className="tabular-nums">{toFaDigits(r.listings)}</dd>
                </dl>
                <p className="text-sm leading-7 whitespace-pre-line text-muted-foreground">{r.description}</p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button size="sm" onClick={() => approve(r)} disabled={busy === r.agencyId}>
                    {busy === r.agencyId ? (
                      <Loader2 className="animate-spin" aria-hidden />
                    ) : (
                      <BadgeCheck aria-hidden />
                    )}
                    تأیید آژانس
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => reject(r)} disabled={busy === r.agencyId}>
                    <X aria-hidden />
                    رد درخواست
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>درخواستی در صف نیست.</Empty>
        )}
      </section>

      <section aria-labelledby="reports-heading" className="mt-8">
        <h3 id="reports-heading" className="mb-3 flex items-center gap-2 font-semibold">
          <Flag className="size-4 text-muted-foreground" aria-hidden />
          نظرهای گزارش‌شده
          {reportedReviews.length ? (
            <span className="rounded-[5px] bg-primary/10 px-1.5 text-xs text-primary tabular-nums">
              {toFaDigits(reportedReviews.length)}
            </span>
          ) : null}
        </h3>
        {reportedReviews.length ? (
          <ul className="divide-y rounded-lg border bg-card">
            {reportedReviews.map((r) => (
              <li key={r.reviewId} className="space-y-2 p-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <StarRow value={r.rating} />
                  <span className="font-medium">{r.author}</span>
                  <span className="text-muted-foreground">دربارهٔ</span>
                  {r.agencySlug ? (
                    <Link
                      to={`/agencies/${encodeURIComponent(r.agencySlug)}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {r.agencyName}
                    </Link>
                  ) : (
                    <span>{r.agencyName}</span>
                  )}
                </div>
                <blockquote className="border-s-2 ps-3 text-sm leading-7 whitespace-pre-line">
                  {r.body || <span className="text-muted-foreground">(بدون متن)</span>}
                </blockquote>
                <p className="text-xs leading-6 text-muted-foreground">
                  {toFaDigits(r.reports)} گزارش، آخرینش {formatRelativeTime(r.lastReportedAt, now)}
                  {r.reasons.length ? ` · «${r.reasons.join("»، «")}»` : ""}
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button size="sm" variant="destructive" onClick={() => hide(r)} disabled={busy === r.reviewId}>
                    {busy === r.reviewId ? <Loader2 className="animate-spin" aria-hidden /> : <EyeOff aria-hidden />}
                    پنهان کردن نظر
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => dismiss(r)} disabled={busy === r.reviewId}>
                    گزارش‌ها بی‌پایه است
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>گزارشی باز نیست.</Empty>
        )}
      </section>

      <ReasonDialog request={reason} onClose={() => setReason(null)} />
    </>
  );
}
