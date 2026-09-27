import { useEffect, useEffectEvent, useId, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { FormError } from "@/components/auth/fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCountdown } from "@/hooks/use-countdown";
import { errorCode, errorMessage } from "@/lib/errors";
import { toEnDigits, toFaDigits } from "@/lib/persian";
import { formatMobile, normalizeIranMobile } from "@/lib/phone";
import type { OtpChallenge } from "@/lib/types";

const CODE_LENGTH = 6;

/** 105 → "۱:۴۵" */
const clock = (seconds: number) => toFaDigits(`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`);

/** Chrome's WebOTP API (Android): reads the code from the SMS if its last line is `@host #code`. */
interface OtpCredential extends Credential {
  code: string;
}
const supportsWebOtp = () => typeof window !== "undefined" && "OTPCredential" in window;

/**
 * Phone number → six-digit SMS code, shared by sign-in and "add a number" in
 * settings. The parent decides what the code does (`verify`); this handles
 * normalizing the number, the expiry and resend countdowns, SMS autofill, and
 * submitting as soon as the sixth digit arrives.
 */
export function OtpFlow({
  request,
  verify,
  requestLabel = "دریافت کد",
  verifyLabel = "تأیید",
  autoFocus = false,
  onCancel,
}: {
  request: (phone: string) => Promise<OtpChallenge>;
  /** Rejects with the API error when the code is wrong or dead. */
  verify: (challengeId: string, code: string) => Promise<void>;
  requestLabel?: string;
  verifyLabel?: string;
  autoFocus?: boolean;
  onCancel?: () => void;
}) {
  const [phoneInput, setPhoneInput] = useState("");
  const [challenge, setChallenge] = useState<OtpChallenge | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, startResend] = useCountdown();
  const [validFor, startValidity] = useCountdown();
  const codeRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const expired = challenge !== null && validFor === 0;

  const send = async (raw: string) => {
    const phone = normalizeIranMobile(raw);
    if (!phone) {
      setError("شمارهٔ موبایل معتبر نیست. شمارهٔ ۱۱ رقمی را مثل ۰۹۱۲۳۴۵۶۷۸۹ وارد کنید.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const next = await request(phone);
      setChallenge(next);
      setCode("");
      startResend(next.resendAfter);
      startValidity(Math.max(0, Math.round((next.expiresAt - Date.now()) / 1000)));
      codeRef.current?.focus(); // on a resend; the first time, the field mounts with autoFocus
    } catch (err) {
      setError(errorMessage(err, "کد فرستاده نشد. دوباره تلاش کنید."));
    } finally {
      setBusy(false);
    }
  };

  const submit = async (value: string) => {
    if (!challenge || busy) return;
    if (value.length !== CODE_LENGTH) {
      setError("کد ۶ رقمی را کامل وارد کنید.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await verify(challenge.challengeId, value);
    } catch (err) {
      if (errorCode(err) === "OTP_EXPIRED") startValidity(0);
      setError(errorMessage(err, "کد بررسی نشد. دوباره تلاش کنید."));
      setCode("");
      codeRef.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  const onCodeInput = (raw: string) => {
    const digits = toEnDigits(raw).replace(/\D/g, "").slice(0, CODE_LENGTH);
    setCode(digits);
    if (digits.length === CODE_LENGTH) void submit(digits);
  };

  // Android Chrome: take the code straight from the SMS, for this origin only.
  const autofill = useEffectEvent((otp: string) => onCodeInput(otp));
  const challengeId = challenge?.challengeId;
  useEffect(() => {
    if (!challengeId || !supportsWebOtp()) return;
    const controller = new AbortController();
    navigator.credentials
      .get({ otp: { transport: ["sms"] }, signal: controller.signal } as CredentialRequestOptions)
      .then((credential) => {
        const otp = (credential as OtpCredential | null)?.code;
        if (otp) autofill(otp);
      })
      .catch(() => undefined); // aborted, dismissed or unsupported: typing still works
    return () => controller.abort();
  }, [challengeId]);

  if (!challenge) {
    return (
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void send(phoneInput);
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-phone`}>شمارهٔ موبایل</Label>
          <Input
            id={`${id}-phone`}
            type="tel"
            inputMode="tel"
            dir="ltr"
            className="h-11 tabular-nums"
            value={phoneInput}
            onChange={(e) => setPhoneInput(e.target.value)}
            placeholder="0912 345 6789"
            autoComplete="tel"
            maxLength={20}
            aria-invalid={error ? true : undefined}
            disabled={busy}
            autoFocus={autoFocus}
            required
          />
        </div>
        <FormError message={error} />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" className="h-11 flex-1" disabled={busy}>
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {requestLabel}
          </Button>
          {onCancel ? (
            <Button type="button" variant="ghost" className="h-11" onClick={onCancel} disabled={busy}>
              انصراف
            </Button>
          ) : null}
        </div>
      </form>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit(code);
      }}
    >
      <p className="text-sm leading-7" role="status">
        کد ۶ رقمی به <bdi dir="ltr">{formatMobile(challenge.phone)}</bdi> فرستاده شد.{" "}
        <button
          type="button"
          className="font-medium text-primary underline-offset-4 hover:underline"
          onClick={() => {
            setChallenge(null);
            setError(null);
          }}
        >
          ویرایش شماره
        </button>
      </p>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-code`}>کد تأیید</Label>
        <Input
          ref={codeRef}
          id={`${id}-code`}
          dir="ltr"
          inputMode="numeric"
          autoComplete="one-time-code"
          className="h-12 text-center font-mono text-xl tracking-[0.5em] tabular-nums"
          value={code}
          onChange={(e) => onCodeInput(e.target.value)}
          maxLength={CODE_LENGTH * 2}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-timer`}
          disabled={busy || expired}
          autoFocus
          required
        />
        <div id={`${id}-timer`} className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            {expired ? (
              "کد منقضی شد."
            ) : (
              <>
                اعتبار کد: <span className="tabular-nums">{clock(validFor)}</span>
              </>
            )}
          </span>
          <button
            type="button"
            className="font-medium text-primary underline-offset-4 hover:underline disabled:pointer-events-none disabled:text-muted-foreground"
            disabled={busy || resendIn > 0}
            onClick={() => void send(challenge.phone)}
          >
            {resendIn > 0 ? (
              <>
                ارسال دوباره تا <span className="tabular-nums">{toFaDigits(resendIn)}</span> ثانیه
              </>
            ) : (
              "ارسال دوبارهٔ کد"
            )}
          </button>
        </div>
      </div>
      <FormError message={error} />
      <Button type="submit" className="h-11 w-full" disabled={busy || expired}>
        {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {verifyLabel}
      </Button>
    </form>
  );
}
