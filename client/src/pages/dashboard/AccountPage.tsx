import { useId, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { CircleAlert, CircleCheck, Loader2, LogOut, UserRound } from "lucide-react";
import { toast } from "sonner";
import { FormError, MIN_PASSWORD_LENGTH, PasswordInput, PasswordRule } from "@/components/auth/fields";
import { OtpFlow } from "@/components/auth/OtpFlow";
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
import { formatMobile } from "@/lib/phone";
import type { User } from "@/lib/types";

function VerifiedBadge({ verified }: { verified: boolean }) {
  return verified ? (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
      <CircleCheck className="size-3.5" aria-hidden />
      تأییدشده
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
      <CircleAlert className="size-3.5" aria-hidden />
      تأییدنشده
    </span>
  );
}

/** For accounts made by SMS code: an email plus the password that goes with it. */
function AddEmailForm() {
  const { applyUser } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useId();

  const submit = async () => {
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError("رمز عبور باید حداقل ۸ نویسه باشد.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      applyUser((await api.account.addEmail(email.trim(), password)).user);
      toast.success("ایمیل افزوده شد. پیوند تأیید را برایتان فرستادیم.");
    } catch (err) {
      setError(errorMessage(err, "ایمیل افزوده نشد. دوباره تلاش کنید."));
      setBusy(false);
    }
  };

  return (
    <form
      className="mt-3 space-y-4 sm:max-w-sm"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <p className="text-sm leading-7 text-muted-foreground">
        با افزودن ایمیل می‌توانید با ایمیل و رمز عبور هم وارد شوید و هشدارهای قیمت را با ایمیل بگیرید.
      </p>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-email`}>نشانی ایمیل</Label>
        <Input
          id={`${id}-email`}
          type="email"
          inputMode="email"
          dir="ltr"
          className="h-10"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@example.com"
          autoComplete="email"
          maxLength={320}
          disabled={busy}
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-password`}>رمز عبور</Label>
        <PasswordInput
          id={`${id}-password`}
          className="h-10"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          maxLength={128}
          aria-describedby={`${id}-rule`}
          disabled={busy}
          required
        />
        <PasswordRule id={`${id}-rule`} password={password} />
      </div>
      <FormError message={error} />
      <Button type="submit" variant="outline" disabled={busy}>
        {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
        افزودن ایمیل
      </Button>
    </form>
  );
}

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
        {user.email ? (
          <>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <bdi dir="ltr" className="inline-block max-w-full break-all">
                {user.email}
              </bdi>
              <VerifiedBadge verified={user.emailVerifiedAt !== null} />
            </p>
            {user.emailVerifiedAt !== null ? null : (
              <div className="mt-3 space-y-2">
                <p className="text-sm leading-7 text-muted-foreground">
                  پیوند تأیید را به این نشانی فرستادیم. تا ایمیل تأیید نشود، هشدار قیمتی برایتان فرستاده نمی‌شود.
                </p>
                <ResendVerificationButton />
              </div>
            )}
          </>
        ) : (
          <AddEmailForm />
        )}
      </div>
    </SettingsSection>
  );
}

function PhoneSection({ user }: { user: User }) {
  const { applyUser } = useAuth();
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);

  const confirm = async (challengeId: string, code: string) => {
    applyUser((await api.account.confirmPhoneLink(challengeId, code)).user);
    setEditing(false);
    toast.success("شمارهٔ موبایل تأیید شد و به حساب وصل شد.");
  };

  const remove = async () => {
    setRemoving(true);
    try {
      applyUser((await api.account.removePhone()).user);
      toast.success("شمارهٔ موبایل از حساب حذف شد.");
    } catch (err) {
      toast.error(errorMessage(err, "حذف انجام نشد. دوباره تلاش کنید."));
    } finally {
      setRemoving(false);
    }
  };

  return (
    <SettingsSection
      title="شمارهٔ موبایل"
      description="با شمارهٔ تأییدشده می‌توانید بدون رمز عبور، با کد پیامکی وارد شوید."
    >
      {editing ? (
        <div className="sm:max-w-sm">
          <OtpFlow
            request={api.account.requestPhoneLink}
            verify={confirm}
            requestLabel="فرستادن کد تأیید"
            verifyLabel="تأیید شماره"
            onCancel={() => setEditing(false)}
            autoFocus
          />
        </div>
      ) : user.phone ? (
        <>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <bdi dir="ltr" className="tabular-nums">
              {formatMobile(user.phone)}
            </bdi>
            <VerifiedBadge verified />
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              تغییر شماره
            </Button>
            {user.email ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm" disabled={removing}>
                    {removing ? <Loader2 className="animate-spin" aria-hidden /> : null}
                    حذف شماره
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>شمارهٔ موبایل حذف شود؟</AlertDialogTitle>
                    <AlertDialogDescription>
                      پس از حذف، فقط با ایمیل و رمز عبور وارد می‌شوید. هر وقت خواستید می‌توانید دوباره شماره اضافه کنید.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>انصراف</AlertDialogCancel>
                    <AlertDialogAction onClick={() => void remove()}>حذف شماره</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : null}
          </div>
          {user.email ? null : (
            <p className="mt-2 text-xs leading-6 text-muted-foreground">
              این شماره تنها راه ورود به حساب است؛ برای حذفش اول ایمیل اضافه کنید.
            </p>
          )}
        </>
      ) : (
        <Button variant="outline" onClick={() => setEditing(true)}>
          افزودن شمارهٔ موبایل
        </Button>
      )}
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
        <input type="email" name="username" autoComplete="username" value={user.email ?? ""} readOnly hidden />
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
          <PhoneSection user={user} />
          {user.hasPassword ? <PasswordSection user={user} /> : null}
          <SessionsSection />
        </div>
      )}
    </>
  );
}
