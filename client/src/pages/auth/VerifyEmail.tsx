import { useEffect, useState } from "react";
import { Link } from "react-router";
import { CircleCheck, Link2Off, Loader2, RotateCcw, WifiOff } from "lucide-react";
import { AuthFooter, AuthShell } from "@/components/auth/AuthShell";
import { ResendVerificationButton } from "@/components/auth/ResendVerificationButton";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useFragmentToken } from "@/hooks/use-fragment-token";
import { isGuest } from "@/lib/account";
import { api } from "@/lib/api";
import { errorCode, errorMessage } from "@/lib/errors";

/**
 * One request per token, however often the effect runs (Strict Mode runs it
 * twice): the token is single-use, so a second POST would report it as used.
 */
const verifications = new Map<string, Promise<unknown>>();
function verifyOnce(token: string) {
  let pending = verifications.get(token);
  if (!pending) {
    pending = api.auth.verifyEmail(token);
    verifications.set(token, pending);
  }
  return pending;
}

type Status = "verifying" | "verified" | "invalid" | "failed";

export default function VerifyEmailPage() {
  const token = useFragmentToken();
  const { user, refresh } = useAuth();
  const [status, setStatus] = useState<Status>(token ? "verifying" : "invalid");
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  useDocumentTitle("تأیید ایمیل");

  useEffect(() => {
    if (!token) return;
    let active = true;
    verifyOnce(token).then(
      () => {
        if (!active) return;
        setStatus("verified");
        void refresh();
      },
      (err: unknown) => {
        if (!active) return;
        setStatus(errorCode(err) === "INVALID_OR_EXPIRED_TOKEN" ? "invalid" : "failed");
        setError(err);
      },
    );
    return () => {
      active = false;
    };
  }, [token, attempt, refresh]);

  const signedIn = user !== null && !isGuest(user);
  const onward = signedIn ? (
    <Link to="/dashboard" className="font-medium text-primary underline-offset-4 hover:underline">
      رفتن به داشبورد
    </Link>
  ) : (
    <Link
      to={`/auth?returnTo=${encodeURIComponent("/dashboard/account")}`}
      className="font-medium text-primary underline-offset-4 hover:underline"
    >
      ورود به حساب
    </Link>
  );

  if (status === "verifying") {
    return (
      <AuthShell title="تأیید ایمیل">
        <p className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground" role="status">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          در حال تأیید نشانی ایمیل…
        </p>
      </AuthShell>
    );
  }

  if (status === "verified") {
    return (
      <AuthShell title="ایمیل شما تأیید شد">
        <div className="flex items-start gap-3 p-6" role="status">
          <CircleCheck className="mt-1 size-5 shrink-0 text-success" aria-hidden />
          <p className="text-sm leading-7">از این پس هشدارهای کاهش قیمت و پیام‌های امنیتی حساب به این نشانی می‌رسد.</p>
        </div>
        <AuthFooter>{onward}</AuthFooter>
      </AuthShell>
    );
  }

  if (status === "failed") {
    return (
      <AuthShell title="تأیید ایمیل انجام نشد">
        <div className="flex items-start gap-3 p-6" role="alert">
          <WifiOff className="mt-1 size-5 shrink-0 text-destructive" aria-hidden />
          <div className="space-y-4 text-sm leading-7">
            <p>{errorMessage(error)}</p>
            <Button
              variant="outline"
              onClick={() => {
                if (token) verifications.delete(token);
                setStatus("verifying");
                setAttempt((n) => n + 1);
              }}
            >
              <RotateCcw aria-hidden />
              تلاش دوباره
            </Button>
          </div>
        </div>
        <AuthFooter>{onward}</AuthFooter>
      </AuthShell>
    );
  }

  const alreadyVerified = signedIn && user.emailVerifiedAt !== null;
  return (
    <AuthShell title={alreadyVerified ? "ایمیل شما قبلاً تأیید شده است" : "این پیوند دیگر کار نمی‌کند"}>
      <div className="flex items-start gap-3 p-6">
        {alreadyVerified ? (
          <CircleCheck className="mt-1 size-5 shrink-0 text-success" aria-hidden />
        ) : (
          <Link2Off className="mt-1 size-5 shrink-0 text-muted-foreground" aria-hidden />
        )}
        <div className="space-y-4 text-sm leading-7">
          {alreadyVerified ? (
            <p>نیازی به کار دیگری نیست.</p>
          ) : (
            <>
              <p>
                پیوند تأیید ۳ روز معتبر است و فقط یک بار کار می‌کند؛ با درخواست پیوند تازه هم پیوندهای قبلی باطل
                می‌شوند.
              </p>
              {signedIn ? (
                <ResendVerificationButton size="default" />
              ) : (
                <p className="text-muted-foreground">برای دریافت پیوند تازه وارد حساب خود شوید.</p>
              )}
            </>
          )}
        </div>
      </div>
      <AuthFooter>{onward}</AuthFooter>
    </AuthShell>
  );
}
