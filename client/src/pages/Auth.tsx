import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AuthShell } from "@/components/auth/AuthShell";
import { FormError, MIN_PASSWORD_LENGTH, PasswordInput, PasswordRule } from "@/components/auth/fields";
import { OtpFlow } from "@/components/auth/OtpFlow";
import { useAuth } from "@/hooks/use-auth";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { isGuest } from "@/lib/account";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { ArrowLeft, Loader2, UserRound } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";

const DEFAULT_REDIRECT = "/dashboard";

/** Only same-site paths: `//evil.example` or `https://…` would be an open redirect. */
function safeRedirect(returnTo: string | null): string {
  return returnTo?.startsWith("/") && !returnTo.startsWith("//") && !returnTo.startsWith("/\\")
    ? returnTo
    : DEFAULT_REDIRECT;
}

type Method = "phone" | "email";
type EmailMode = "signin" | "signup";

/** After SMS sign-up: the account exists; ask what to call its owner (skippable). */
function NameStep({ initialName, onDone }: { initialName: string; onDone: () => void }) {
  const { applyUser } = useAuth();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useId();

  const save = async () => {
    if (name.trim().length < 2) {
      setError("نام باید حداقل ۲ حرف باشد.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      applyUser((await api.account.updateProfile(name.trim())).user);
      onDone();
    } catch (err) {
      setError(errorMessage(err, "نام ذخیره نشد. دوباره تلاش کنید."));
      setBusy(false);
    }
  };

  return (
    <form
      className="space-y-4 p-6"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-name`}>نام و نام خانوادگی</Label>
        <Input
          id={`${id}-name`}
          className="h-11"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="مثلاً علی رضایی"
          autoComplete="name"
          maxLength={120}
          aria-describedby={`${id}-hint`}
          disabled={busy}
          autoFocus
          required
        />
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          تا نامی ننویسید، «{initialName}» خطابتان می‌کنیم.
        </p>
      </div>
      <FormError message={error} />
      <div className="flex gap-2">
        <Button type="submit" className="h-11 flex-1" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
          ذخیره و ادامه
        </Button>
        <Button type="button" variant="ghost" className="h-11" onClick={onDone} disabled={busy}>
          بعداً
        </Button>
      </div>
    </form>
  );
}

export default function AuthPage() {
  const { isLoading: sessionLoading, user, signIn, signUp, signInAsGuest, applyUser } = useAuth();
  // Guests come here to sign up or sign in for real; their saved flights carry over either way.
  const guest = user !== null && isGuest(user);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = safeRedirect(searchParams.get("returnTo"));
  const wantsSignup = searchParams.get("mode") === "signup";
  const [method, setMethod] = useState<Method>(
    wantsSignup || searchParams.get("method") === "email" ? "email" : "phone",
  );
  const [mode, setMode] = useState<EmailMode>(wantsSignup ? "signup" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<"form" | "guest" | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Set while a just-created SMS account picks its name. */
  const [naming, setNaming] = useState<string | null>(null);
  const ids = useId();

  useDocumentTitle(naming ? "خوش آمدید" : method === "email" && mode === "signup" ? "ثبت‌نام" : "ورود");

  // Already signed in (e.g. opened /auth from a bookmark).
  useEffect(() => {
    if (!sessionLoading && user && !guest && busy === null && naming === null) navigate(redirect, { replace: true });
  }, [sessionLoading, user, guest, busy, naming, navigate, redirect]);

  const run = async (kind: "form" | "guest", action: () => Promise<unknown>, fallback: string) => {
    setBusy(kind);
    setError(null);
    try {
      await action();
      navigate(redirect, { replace: true });
    } catch (err) {
      setError(errorMessage(err, fallback));
      setBusy(null);
    }
  };

  const submitSignIn = () => run("form", () => signIn(email.trim(), password), "ورود ناموفق بود. دوباره تلاش کنید.");

  const submitSignUp = () => {
    if (name.trim().length < 2) return setError("نام باید حداقل ۲ حرف باشد.");
    if (password.length < MIN_PASSWORD_LENGTH) return setError("رمز عبور باید حداقل ۸ نویسه باشد.");
    return run("form", () => signUp(name.trim(), email.trim(), password), "ثبت‌نام ناموفق بود. دوباره تلاش کنید.");
  };

  const verifyCode = async (challengeId: string, code: string) => {
    const res = await api.auth.verifyOtp(challengeId, code);
    // Set before the session changes, so the redirect above waits for the name step.
    if (res.created) setNaming(res.user.name);
    applyUser(res.user);
    if (!res.created) navigate(redirect, { replace: true });
  };

  if (naming !== null) {
    return (
      <AuthShell title="خوش آمدید" description="حساب شما ساخته شد. نامتان را بنویسید تا با آن خطابتان کنیم.">
        <NameStep initialName={naming} onDone={() => navigate(redirect, { replace: true })} />
      </AuthShell>
    );
  }

  const disabled = busy !== null;
  const switchMode = (next: EmailMode) => {
    setMode(next);
    setError(null);
  };

  return (
    <AuthShell
      title={method === "email" && mode === "signup" ? "ساخت حساب پروازیاب" : "ورود به پروازیاب"}
      description={
        guest
          ? "پروازهایی که در حساب مهمان ذخیره کرده‌اید به حساب دائمی منتقل می‌شوند."
          : method === "phone"
            ? "با کد پیامکی وارد شوید؛ اگر حساب ندارید، همین حالا ساخته می‌شود."
            : "برای ذخیره پروازها و انتشار پرواز (آژانس‌ها) وارد شوید."
      }
    >
      <Tabs
        value={method}
        onValueChange={(v) => {
          setMethod(v as Method);
          setError(null);
        }}
        className="p-6"
      >
        <TabsList className="grid h-10 w-full grid-cols-2">
          <TabsTrigger value="phone">کد پیامکی</TabsTrigger>
          <TabsTrigger value="email">ایمیل و رمز عبور</TabsTrigger>
        </TabsList>

        <TabsContent value="phone" className="mt-5">
          <OtpFlow request={api.auth.requestOtp} verify={verifyCode} verifyLabel="ورود" />
        </TabsContent>

        <TabsContent value="email" className="mt-5">
          {mode === "signin" ? (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void submitSignIn();
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor={`${ids}-email`}>ایمیل</Label>
                <Input
                  id={`${ids}-email`}
                  type="email"
                  inputMode="email"
                  dir="ltr"
                  className="h-11"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  autoComplete="email"
                  disabled={disabled}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <Label htmlFor={`${ids}-password`}>رمز عبور</Label>
                  {/* The typed email rides along in router state, not in the URL. */}
                  <Link
                    to="/auth/forgot"
                    state={{ email: email.trim() }}
                    className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                  >
                    رمز عبور را فراموش کرده‌اید؟
                  </Link>
                </div>
                <PasswordInput
                  id={`${ids}-password`}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  disabled={disabled}
                  required
                />
              </div>
              <FormError message={error} />
              <Button type="submit" className="h-11 w-full" disabled={disabled}>
                {busy === "form" ? <Loader2 className="animate-spin" aria-hidden /> : null}
                ورود
                {busy === "form" ? null : <ArrowLeft aria-hidden />}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                حساب ندارید؟{" "}
                <button
                  type="button"
                  className="font-medium text-primary underline-offset-4 hover:underline"
                  onClick={() => switchMode("signup")}
                >
                  ثبت‌نام با ایمیل
                </button>
              </p>
            </form>
          ) : (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void submitSignUp();
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor={`${ids}-name`}>نام و نام خانوادگی</Label>
                <Input
                  id={`${ids}-name`}
                  className="h-11"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="مثلاً علی رضایی"
                  autoComplete="name"
                  minLength={2}
                  maxLength={120}
                  disabled={disabled}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${ids}-email`}>ایمیل</Label>
                <Input
                  id={`${ids}-email`}
                  type="email"
                  inputMode="email"
                  dir="ltr"
                  className="h-11"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  autoComplete="email"
                  disabled={disabled}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${ids}-password`}>رمز عبور</Label>
                <PasswordInput
                  id={`${ids}-password`}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  minLength={MIN_PASSWORD_LENGTH}
                  maxLength={128}
                  aria-describedby={`${ids}-password-hint`}
                  disabled={disabled}
                  required
                />
                <PasswordRule id={`${ids}-password-hint`} password={password} />
              </div>
              <FormError message={error} />
              <Button type="submit" className="h-11 w-full" disabled={disabled}>
                {busy === "form" ? <Loader2 className="animate-spin" aria-hidden /> : null}
                ساخت حساب
                {busy === "form" ? null : <ArrowLeft aria-hidden />}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                حساب دارید؟{" "}
                <button
                  type="button"
                  className="font-medium text-primary underline-offset-4 hover:underline"
                  onClick={() => switchMode("signin")}
                >
                  ورود
                </button>
              </p>
            </form>
          )}
        </TabsContent>

        {guest ? null : (
          <>
            <div className="mt-5 flex items-center gap-3 text-xs text-muted-foreground" aria-hidden>
              <span className="h-px flex-1 bg-border" />
              یا
              <span className="h-px flex-1 bg-border" />
            </div>
            <Button
              type="button"
              variant="outline"
              className="mt-5 h-11 w-full"
              onClick={() => void run("guest", signInAsGuest, "ورود مهمان ناموفق بود. دوباره تلاش کنید.")}
              disabled={disabled}
            >
              {busy === "guest" ? <Loader2 className="animate-spin" aria-hidden /> : <UserRound aria-hidden />}
              ادامه به‌عنوان مهمان
            </Button>
          </>
        )}
      </Tabs>
    </AuthShell>
  );
}
