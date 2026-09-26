import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Brand } from "@/components/layout/Header";
import { useAuth } from "@/hooks/use-auth";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { errorMessage } from "@/lib/errors";
import { ArrowLeft, Eye, EyeOff, Loader2, UserRound } from "lucide-react";
import { useEffect, useId, useState, type ComponentProps } from "react";
import { useNavigate, useSearchParams } from "react-router";

const DEFAULT_REDIRECT = "/dashboard";

/** Only same-site paths: `//evil.example` or `https://…` would be an open redirect. */
function safeRedirect(returnTo: string | null): string {
  return returnTo?.startsWith("/") && !returnTo.startsWith("//") && !returnTo.startsWith("/\\")
    ? returnTo
    : DEFAULT_REDIRECT;
}

function PasswordInput(props: Omit<ComponentProps<typeof Input>, "type">) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={visible ? "text" : "password"} dir="ltr" className="h-11 pe-3 ps-11" />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute inset-y-0 left-0 flex w-11 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        aria-label={visible ? "پنهان کردن رمز عبور" : "نمایش رمز عبور"}
        aria-pressed={visible}
      >
        {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
      </button>
    </div>
  );
}

function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
      {message}
    </p>
  );
}

export default function AuthPage() {
  const { isLoading: sessionLoading, isAuthenticated, signIn, signUp, signInAsGuest } = useAuth();
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
    if (!sessionLoading && isAuthenticated && busy === null) navigate(redirect, { replace: true });
  }, [sessionLoading, isAuthenticated, busy, navigate, redirect]);

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
    if (password.length < 8) return setError("رمز عبور باید حداقل ۸ نویسه باشد.");
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
    <div className="flex min-h-dvh flex-col bg-dotted">
      <header className="border-b bg-background/90 backdrop-blur">
        <div className="container-page flex h-14 items-center sm:h-16">
          <Brand />
        </div>
      </header>

      <main id="main" className="flex flex-1 items-start justify-center px-4 py-8 sm:items-center sm:py-12">
        <div className="w-full max-w-md rounded-lg border bg-card shadow-sm">
          <div className="border-b px-6 py-5 text-center">
            <h1 className="text-xl font-bold">{tab === "signup" ? "ساخت حساب پروازیاب" : "ورود به پروازیاب"}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              برای ذخیره پروازها و انتشار پرواز (آژانس‌ها) وارد شوید.
            </p>
          </div>

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
                  <Label htmlFor={`${ids}-signin-password`}>رمز عبور</Label>
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
                    minLength={8}
                    maxLength={128}
                    aria-describedby={`${ids}-password-hint`}
                    disabled={disabled}
                    required
                  />
                  <p id={`${ids}-password-hint`} className="text-xs text-muted-foreground">
                    حداقل ۸ نویسه
                  </p>
                </div>
                <FormError message={error} />
                <Button type="submit" className="h-11 w-full" disabled={disabled}>
                  {busy === "form" ? <Loader2 className="animate-spin" aria-hidden /> : null}
                  ساخت حساب
                  {busy === "form" ? null : <ArrowLeft aria-hidden />}
                </Button>
              </form>
            </TabsContent>

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
          </Tabs>
        </div>
      </main>
    </div>
  );
}
