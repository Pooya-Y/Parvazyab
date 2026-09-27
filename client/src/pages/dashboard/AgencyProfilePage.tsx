import { useId, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { ExternalLink, Loader2, MessageSquareReply } from "lucide-react";
import { toast } from "sonner";
import { VerifiedMark } from "@/components/agencies/AgencyBits";
import { StarRow } from "@/components/agencies/Stars";
import { FormError } from "@/components/auth/fields";
import { LoadError } from "@/components/dashboard/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { SLUG_PATTERN } from "@/lib/agencies";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { formatJalaliDate, toFaDigits } from "@/lib/persian";
import type { AgencyReview, OwnAgencyProfile } from "@/lib/types";
import { useApiQuery } from "@/lib/use-api-query";

const textareaClass =
  "w-full resize-y rounded-md border bg-transparent px-3 py-2 text-sm leading-7 outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50";

function Field({ label, hint, children, id }: { label: string; hint?: ReactNode; children: ReactNode; id: string }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint ? <p className="text-xs leading-6 text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** Asking for the verified badge: needs a license number and a description of 30+ characters (checked by the server). */
function VerificationRequest({ pending }: { pending: boolean }) {
  const [requested, setRequested] = useState(pending);
  const [busy, setBusy] = useState(false);

  const ask = async () => {
    setBusy(true);
    try {
      await api.dashboard.requestVerification();
      setRequested(true);
      toast.success("درخواست تأیید ثبت شد");
    } catch (err) {
      toast.error(errorMessage(err, "درخواست ثبت نشد."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-md bg-muted/50 px-3 py-2.5 text-xs leading-6 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-muted-foreground">
        {requested
          ? "درخواست تأیید شما در صف بررسی است؛ نتیجه را در اعلان‌ها می‌بینید."
          : "نشان «تأییدشده» را مدیر پروازیاب پس از بررسی مجوز می‌دهد. شمارهٔ مجوز و معرفی آژانس را کامل و ذخیره کنید، بعد درخواست دهید."}
      </p>
      {requested ? null : (
        <Button type="button" size="sm" variant="outline" onClick={() => void ask()} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
          درخواست نشان تأیید
        </Button>
      )}
    </div>
  );
}

function ProfileForm({ initial }: { initial: OwnAgencyProfile }) {
  const [form, setForm] = useState({
    slug: initial.slug,
    description: initial.description,
    website: initial.website ?? "",
    supportPhone: initial.supportPhone ?? "",
    city: initial.city ?? "",
    licenseNo: initial.licenseNo ?? "",
  });
  const [saved, setSaved] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));
  const slugOk = SLUG_PATTERN.test(form.slug) && form.slug.length >= 3;

  const save = async () => {
    if (!slugOk) {
      setError("نشانی دست‌کم ۳ نویسه است و فقط حروف کوچک لاتین، رقم و خط تیره دارد (مثلاً sky-travel).");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const next = await api.dashboard.updateProfile({
        slug: form.slug,
        description: form.description,
        website: form.website || null,
        supportPhone: form.supportPhone || null,
        city: form.city || null,
        licenseNo: form.licenseNo || null,
      });
      setSaved(next);
      toast.success("پروفایل ذخیره شد");
    } catch (err) {
      setError(errorMessage(err, "پروفایل ذخیره نشد. دوباره تلاش کنید."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="space-y-4 rounded-lg border bg-card p-4 sm:p-6"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 font-semibold">
          {saved.name}
          {saved.verified ? <VerifiedMark className="size-4" /> : null}
        </h3>
        <Button asChild variant="outline" size="sm">
          <Link to={`/agencies/${encodeURIComponent(saved.slug)}`}>
            <ExternalLink aria-hidden />
            دیدن صفحهٔ عمومی
          </Link>
        </Button>
      </div>
      {saved.verified ? null : <VerificationRequest pending={saved.verificationPending} />}

      <Field
        id={`${id}-slug`}
        label="نشانی صفحه"
        hint={
          <>
            حروف کوچک لاتین، رقم و خط تیره. صفحهٔ شما:{" "}
            <bdi dir="ltr" className="font-mono">
              {window.location.origin}/agencies/{form.slug || "…"}
            </bdi>
          </>
        }
      >
        <Input
          id={`${id}-slug`}
          dir="ltr"
          className="h-10 font-mono"
          value={form.slug}
          onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value.toLowerCase().replace(/\s+/g, "-") }))}
          maxLength={40}
          aria-invalid={!slugOk}
          disabled={busy}
          required
        />
      </Field>

      <Field
        id={`${id}-description`}
        label="معرفی"
        hint={`${toFaDigits(form.description.length)}/۱۲۰۰ · از خدمات، سابقه و پشتیبانی آژانس بنویسید.`}
      >
        <textarea
          id={`${id}-description`}
          className={textareaClass}
          rows={4}
          maxLength={1200}
          value={form.description}
          onChange={set("description")}
          disabled={busy}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={`${id}-website`} label="وب‌سایت">
          <Input
            id={`${id}-website`}
            dir="ltr"
            type="url"
            className="h-10"
            placeholder="https://"
            value={form.website}
            onChange={set("website")}
            disabled={busy}
          />
        </Field>
        <Field id={`${id}-phone`} label="تلفن پشتیبانی">
          <Input
            id={`${id}-phone`}
            dir="ltr"
            type="tel"
            className="h-10"
            placeholder="021-91001234"
            value={form.supportPhone}
            onChange={set("supportPhone")}
            maxLength={20}
            disabled={busy}
          />
        </Field>
        <Field id={`${id}-city`} label="شهر">
          <Input
            id={`${id}-city`}
            className="h-10"
            value={form.city}
            onChange={set("city")}
            maxLength={60}
            disabled={busy}
          />
        </Field>
        <Field id={`${id}-license`} label="شمارهٔ مجوز">
          <Input
            id={`${id}-license`}
            className="h-10"
            value={form.licenseNo}
            onChange={set("licenseNo")}
            maxLength={40}
            disabled={busy}
          />
        </Field>
      </div>

      <FormError message={error} />
      <Button type="submit" disabled={busy}>
        {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
        ذخیرهٔ پروفایل
      </Button>
    </form>
  );
}

function ReviewWithReply({ review }: { review: AgencyReview }) {
  const [reply, setReply] = useState(review.reply ?? "");
  const [saved, setSaved] = useState(review.reply ?? "");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const id = useId();

  const save = async () => {
    setBusy(true);
    try {
      await api.dashboard.replyToReview(review.id, reply.trim());
      setSaved(reply.trim());
      setOpen(false);
      toast.success(reply.trim() ? "پاسخ منتشر شد" : "پاسخ حذف شد");
    } catch (err) {
      toast.error(errorMessage(err, "پاسخ ذخیره نشد."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="py-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <StarRow value={review.rating} />
        <span className="text-sm font-medium">{review.author}</span>
        <span className="text-xs text-muted-foreground">{formatJalaliDate(review.createdAt)}</span>
        {review.hidden ? (
          <span className="rounded-[5px] bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
            پنهان‌شده توسط مدیر
          </span>
        ) : null}
      </div>
      {review.body ? <p className="mt-2 text-sm leading-7 whitespace-pre-line">{review.body}</p> : null}
      {saved && !open ? (
        <div className="mt-3 border-s-2 border-chart-1/40 ps-3">
          <p className="text-xs font-medium text-muted-foreground">پاسخ شما</p>
          <p className="mt-1 text-sm leading-7 whitespace-pre-line">{saved}</p>
        </div>
      ) : null}
      {open ? (
        <form
          className="mt-3 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <label htmlFor={id} className="sr-only">
            پاسخ به این نظر
          </label>
          <textarea
            id={id}
            className={textareaClass}
            rows={3}
            maxLength={1000}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="پاسخ شما برای همه نمایش داده می‌شود. خالی بگذارید تا پاسخ قبلی حذف شود."
            disabled={busy}
            autoFocus
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
              انتشار پاسخ
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              انصراف
            </Button>
          </div>
        </form>
      ) : (
        <Button variant="ghost" size="sm" className="mt-2 -ms-2" onClick={() => setOpen(true)}>
          <MessageSquareReply aria-hidden />
          {saved ? "ویرایش پاسخ" : "پاسخ"}
        </Button>
      )}
    </li>
  );
}

export default function AgencyProfilePage() {
  useDocumentTitle("پروفایل آژانس");
  const profile = useApiQuery("agency-profile", (signal) => api.dashboard.profile(signal));
  const reviews = useApiQuery("agency-reviews", (signal) => api.dashboard.reviews(signal));

  return (
    <>
      <h2 className="mb-1 text-lg font-bold">پروفایل آژانس</h2>
      <p className="mb-4 text-sm leading-7 text-muted-foreground">
        مسافران از نتایج جستجو به این صفحه می‌رسند: معرفی، راه‌های تماس، امتیاز و نظرها.
      </p>
      {profile.error && !profile.data ? (
        <LoadError error={profile.error} onRetry={profile.refetch} />
      ) : profile.data ? (
        <ProfileForm initial={profile.data} />
      ) : (
        <Skeleton className="h-96 rounded-lg" aria-hidden />
      )}

      <section aria-labelledby="own-reviews" className="mt-8">
        <h2 id="own-reviews" className="mb-1 text-lg font-bold">
          نظر مسافران
        </h2>
        <p className="text-sm leading-7 text-muted-foreground">
          به هر نظر یک پاسخ عمومی می‌توانید بدهید. نظرها را نمی‌توانید حذف کنید؛ اگر نظری نامناسب است، از صفحهٔ عمومی
          آژانس گزارشش کنید تا مدیر بررسی کند.
        </p>
        {reviews.error && !reviews.data ? (
          <LoadError error={reviews.error} onRetry={reviews.refetch} />
        ) : reviews.isLoading ? (
          <Skeleton className="mt-4 h-32 rounded-lg" aria-hidden />
        ) : reviews.data?.length ? (
          <ul className="mt-2 divide-y rounded-lg border bg-card px-4 sm:px-5">
            {reviews.data.map((r) => (
              <ReviewWithReply key={r.id} review={r} />
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">هنوز نظری برای آژانس شما ثبت نشده است.</p>
        )}
      </section>
    </>
  );
}
