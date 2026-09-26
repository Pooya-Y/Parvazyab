import { useId, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { CircleAlert, CircleCheck, Loader2, LogOut, UserRound } from "lucide-react";
import { toast } from "sonner";
import { FormError, MIN_PASSWORD_LENGTH, PasswordInput, PasswordRule } from "@/components/auth/fields";
import { ResendVerificationButton } from "@/components/auth/ResendVerificationButton";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { isGuest } from "@/lib/account";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { formatJalaliDate } from "@/lib/persian";
import type { User } from "@/lib/types";

/** Settings row: what it is on the start side, the controls beside it (stacked on phones). */
function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className="grid gap-4 p-5 sm:p-6 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] md:gap-10"
    >
      <div>
        <h3 id={id} className="font-semibold">
          {title}
        </h3>
        {description ? <p className="mt-1 text-sm leading-7 text-muted-foreground">{description}</p> : null}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function ProfileSection({ user }: { user: User }) {
  const { applyUser } = useAuth();
  const [name, setName] = useState(user.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  const trimmed = name.trim();
  const changed = trimmed !== user.name;
  const verified = user.emailVerifiedAt !== null;

  const save = async () => {
    if (trimmed.length < 2) {
      setError("نام باید حداقل ۲ حرف باشد.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api.account.updateProfile(trimmed);
      applyUser(res.user);
      setName(res.user.name);
      toast.success("نام ذخیره شد");
    } catch (err) {
      setError(errorMessage(err, "نام ذخیره نشد. دوباره تلاش کنید."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsSection title="مشخصات" description="نامی که در پروازیاب و در ایمیل‌ها خطاب به شما می‌آید.">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Label htmlFor={`${id}-name`}>نام و نام خانوادگی</Label>
        <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
          <Input
            id={`${id}-name`}
            className="h-10 sm:max-w-72"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            maxLength={120}
            aria-invalid={error ? true : undefined}
            disabled={busy}
          />
          <Button type="submit" variant="outline" className="h-10" disabled={busy || !changed}>
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
            ذخیرهٔ نام
          </Button>
        </div>
        <FormError message={error} className="mt-2" />
      </form>

      <div className="mt-6">
        <p className="text-sm font-medium">ایمیل</p>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <bdi dir="ltr" className="inline-block max-w-full break-all">
            {user.email}
          </bdi>
          {verified ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
              <CircleCheck className="size-3.5" aria-hidden />
              تأییدشده
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
              <CircleAlert className="size-3.5" aria-hidden />
              تأییدنشده
            </span>
          )}
        </p>
        {verified ? null : (
          <div className="mt-3 space-y-2">
            <p className="text-sm leading-7 text-muted-foreground">
              پیوند تأیید را به این نشانی فرستادیم. تا ایمیل تأیید نشود، هشدار قیمتی برایتان فرستاده نمی‌شود.
            </p>
            <ResendVerificationButton />
          </div>
        )}
      </div>
    </SettingsSection>
  );
}

function PasswordSection({ user }: { user: User }) {
  const { applyUser } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useId();

  const submit = async () => {
    if (next.length < MIN_PASSWORD_LENGTH) {
      setError("رمز عبور تازه باید حداقل ۸ نویسه باشد.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api.account.changePassword(current, next);
      applyUser(res.user);
      setCurrent("");
      setNext("");
      toast.success("رمز عبور تغییر کرد و نشست‌های دیگر بسته شدند.");
    } catch (err) {
      setError(errorMessage(err, "رمز عبور تغییر نکرد. دوباره تلاش کنید."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsSection
      title="رمز عبور"
      description={
        user.passwordChangedAt
          ? `آخرین تغییر: ${formatJalaliDate(Date.parse(user.passwordChangedAt))}. با تغییر رمز، همهٔ دستگاه‌های دیگر خارج می‌شوند.`
          : "با تغییر رمز، همهٔ دستگاه‌های دیگر خارج می‌شوند."
      }
    >
      <form
        className="space-y-4 sm:max-w-sm"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {/* Lets password managers file the new password under the right account. */}
        <input type="email" name="username" autoComplete="username" value={user.email} readOnly hidden />
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-current`}>رمز عبور فعلی</Label>
          <PasswordInput
            id={`${id}-current`}
            className="h-10"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoComplete="current-password"
            maxLength={128}
            disabled={busy}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-next`}>رمز عبور تازه</Label>
          <PasswordInput
            id={`${id}-next`}
            className="h-10"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            maxLength={128}
            aria-describedby={`${id}-rule`}
            disabled={busy}
            required
          />
          <PasswordRule id={`${id}-rule`} password={next} />
        </div>
        <FormError message={error} />
        <Button type="submit" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
          تغییر رمز عبور
        </Button>
      </form>
    </SettingsSection>
  );
}

function SessionsSection() {
  const [busy, setBusy] = useState(false);

  const signOutOthers = async () => {
    setBusy(true);
    try {
      await api.account.signOutOtherSessions();
      toast.success("از همهٔ دستگاه‌های دیگر خارج شدید.");
    } catch (err) {
      toast.error(errorMessage(err, "انجام نشد. دوباره تلاش کنید."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsSection
      title="دستگاه‌ها"
      description="اگر روی دستگاهی عمومی یا گم‌شده وارد شده‌اید، از آن خارج شوید. این دستگاه وارد می‌ماند."
    >
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="outline" disabled={busy}>
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : <LogOut aria-hidden />}
            خروج از همهٔ دستگاه‌های دیگر
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>از همهٔ دستگاه‌های دیگر خارج شوید؟</AlertDialogTitle>
            <AlertDialogDescription>
              هر مرورگر یا دستگاه دیگری که با این حساب وارد شده است باید دوباره وارد شود.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction onClick={() => void signOutOthers()}>خروج از دستگاه‌های دیگر</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsSection>
  );
}

export default function AccountPage() {
  const { user } = useAuth();
  useDocumentTitle("تنظیمات حساب");
  if (!user) return null;

  return (
    <>
      <h2 className="mb-4 text-lg font-bold">تنظیمات حساب</h2>
      {isGuest(user) ? (
        <StateMessage
          icon={UserRound}
          title="حساب مهمان تنظیماتی ندارد"
          description="برای داشتن نام، ایمیل، رمز عبور و هشدار قیمت، حساب دائمی بسازید. پروازهای ذخیره‌شده‌تان به حساب تازه منتقل می‌شوند."
          action={
            <Button asChild>
              <Link to="/auth?mode=signup&returnTo=%2Fdashboard%2Faccount">ساخت حساب دائمی</Link>
            </Button>
          }
        />
      ) : (
        <div className="divide-y rounded-lg border bg-card">
          <ProfileSection user={user} />
          <PasswordSection user={user} />
          <SessionsSection />
        </div>
      )}
    </>
  );
}
