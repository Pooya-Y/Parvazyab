import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AuthShell } from "@/components/auth/AuthShell";
import { FormError, MIN_PASSWORD_LENGTH, PasswordInput, PasswordRule } from "@/components/auth/fields";
import { useAuth } from "@/hooks/use-auth";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { isGuest } from "@/lib/account";
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

export default function AuthPage() {
  const { isLoading: sessionLoading, user, signIn, signUp, signInAsGuest } = useAuth();
  // Guests come here to sign up or sign in for real; their saved flights carry over either way.
  const guest = user !== null && isGuest(user);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = safeRedirect(searchParams.get("returnTo"));
  const [tab, setTab] = useState(searchParams.get("mode") === "signup" ? "signup" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<"form" | "guest" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ids = useId();

  useDocumentTitle(tab === "signup" ? "ثبت‌نام" : "ورود");

  // Already signed in (e.g. opened /auth from a bookmark).
  useEffect(() => {
    if (!sessionLoading && user && !guest && busy === null) navigate(redirect, { replace: true });
  }, [sessionLoading, user, guest, busy, navigate, redirect]);

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

  const disabled = busy !== null;
  const emailField = (id: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={id}>ایمیل</Label>
      <Input
        id={id}
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
  );

  return (
    <AuthShell
      title={tab === "signup" ? "ساخت حساب پروازیاب" : "ورود به پروازیاب"}
      description={
        guest
          ? "پروازهایی که در حساب مهمان ذخیره کرده‌اید به حساب دائمی منتقل می‌شوند."
          : "برای ذخیره پروازها و انتشار پرواز (آژانس‌ها) وارد شوید."
      }
    >
      <Tabs
        value={tab}
        onValueChange={(v) => {
          setTab(v);
          setError(null);
        }}
        className="p-6"
      >
        <TabsList className="grid h-10 w-full grid-cols-2">
          <TabsTrigger value="signin">ورود</TabsTrigger>
          <TabsTrigger value="signup">ثبت‌نام</TabsTrigger>
        </TabsList>

        <TabsContent value="signin" className="mt-5">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void submitSignIn();
            }}
          >
            {emailField(`${ids}-signin-email`)}
            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <Label htmlFor={`${ids}-signin-password`}>رمز عبور</Label>
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
                id={`${ids}-signin-password`}
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
          </form>
        </TabsContent>

        <TabsContent value="signup" className="mt-5">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void submitSignUp();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor={`${ids}-signup-name`}>نام و نام خانوادگی</Label>
              <Input
                id={`${ids}-signup-name`}
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
            {emailField(`${ids}-signup-email`)}
            <div className="space-y-1.5">
              <Label htmlFor={`${ids}-signup-password`}>رمز عبور</Label>
              <PasswordInput
                id={`${ids}-signup-password`}
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
          </form>
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
