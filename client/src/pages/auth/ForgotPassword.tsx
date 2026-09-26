import { useId, useState } from "react";
import { Link, useLocation } from "react-router";
import { ArrowLeft, Loader2, MailCheck } from "lucide-react";
import { AuthFooter, AuthShell } from "@/components/auth/AuthShell";
import { FormError } from "@/components/auth/fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCountdown } from "@/hooks/use-countdown";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { toFaDigits } from "@/lib/persian";

/** Matches the server: one reset email a minute per account. */
const RESEND_SECONDS = 60;

export default function ForgotPasswordPage() {
  const location = useLocation();
  const carried = (location.state as { email?: unknown } | null)?.email;
  const [email, setEmail] = useState(typeof carried === "string" ? carried : "");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, startCooldown] = useCountdown();
  const id = useId();
  useDocumentTitle("بازیابی رمز عبور");

  const send = async (address: string) => {
    setBusy(true);
    setError(null);
    try {
      await api.auth.forgotPassword(address);
      setSentTo(address);
      startCooldown(RESEND_SECONDS);
    } catch (err) {
      setError(errorMessage(err, "درخواست فرستاده نشد. دوباره تلاش کنید."));
    } finally {
      setBusy(false);
    }
  };

  const footer = (
    <AuthFooter>
      <Link to="/auth" className="font-medium text-primary underline-offset-4 hover:underline">
        بازگشت به صفحهٔ ورود
      </Link>
    </AuthFooter>
  );

  if (sentTo) {
    return (
      <AuthShell title="ایمیل خود را بررسی کنید">
        <div className="p-6">
          <div className="flex items-start gap-3" role="status">
            <MailCheck className="mt-1 size-5 shrink-0 text-success" aria-hidden />
            <div className="space-y-2 text-sm leading-7">
              <p>
                اگر حسابی با نشانی{" "}
                <bdi dir="ltr" className="inline-block max-w-full break-all align-top">
                  {sentTo}
                </bdi>{" "}
                وجود داشته باشد، پیوند تعیین رمز عبور تازه تا چند لحظهٔ دیگر به آن می‌رسد.
              </p>
              <p className="text-muted-foreground">
                پیوند ۳۰ دقیقه معتبر است و فقط یک بار کار می‌کند. اگر ایمیلی نرسید، پوشهٔ هرزنامه را هم نگاه کنید.
              </p>
            </div>
          </div>
          <FormError message={error} className="mt-4" />
          <div className="mt-5 flex flex-wrap gap-2">
            <Button variant="outline" disabled={busy || cooldown > 0} onClick={() => void send(sentTo)}>
              {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
              {cooldown > 0 ? (
                <span>
                  ارسال دوباره تا <span className="tabular-nums">{toFaDigits(cooldown)}</span> ثانیهٔ دیگر
                </span>
              ) : (
                "ارسال دوباره"
              )}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setSentTo(null);
                setError(null);
              }}
            >
              نشانی دیگری وارد می‌کنم
            </Button>
          </div>
        </div>
        {footer}
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="بازیابی رمز عبور"
      description="ایمیل حساب خود را وارد کنید تا پیوند تعیین رمز عبور تازه را برایتان بفرستیم."
    >
      <form
        className="space-y-4 p-6"
        onSubmit={(e) => {
          e.preventDefault();
          void send(email.trim());
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-email`}>ایمیل</Label>
          <Input
            id={`${id}-email`}
            type="email"
            inputMode="email"
            dir="ltr"
            className="h-11"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            autoComplete="email"
            maxLength={320}
            disabled={busy}
            autoFocus
            required
          />
        </div>
        <FormError message={error} />
        <Button type="submit" className="h-11 w-full" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
          فرستادن پیوند بازیابی
          {busy ? null : <ArrowLeft aria-hidden />}
        </Button>
      </form>
      {footer}
    </AuthShell>
  );
}
