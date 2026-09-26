import { useState } from "react";
import { Loader2, MailPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useCountdown } from "@/hooks/use-countdown";
import { api } from "@/lib/api";
import { errorCode, errorMessage } from "@/lib/errors";
import { toFaDigits } from "@/lib/persian";

/** The server sends at most one verification email a minute. */
const COOLDOWN_SECONDS = 60;

export function ResendVerificationButton({ size = "sm" }: { size?: "sm" | "default" }) {
  const { refresh } = useAuth();
  const [busy, setBusy] = useState(false);
  const [cooldown, startCooldown] = useCountdown();

  const resend = async () => {
    setBusy(true);
    try {
      await api.account.resendVerification();
      toast.success("پیوند تأیید دوباره فرستاده شد. صندوق ایمیل خود را بررسی کنید.");
      startCooldown(COOLDOWN_SECONDS);
    } catch (err) {
      const code = errorCode(err);
      if (code === "EMAIL_ALREADY_VERIFIED") {
        toast.success(errorMessage(err));
        await refresh();
      } else {
        toast.error(errorMessage(err, "ارسال نشد. دوباره تلاش کنید."));
        if (code === "RESEND_TOO_SOON") startCooldown(COOLDOWN_SECONDS);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button variant="outline" size={size} disabled={busy || cooldown > 0} onClick={() => void resend()}>
      {busy ? <Loader2 className="animate-spin" aria-hidden /> : <MailPlus aria-hidden />}
      {cooldown > 0 ? (
        <span>
          ارسال دوباره تا <span className="tabular-nums">{toFaDigits(cooldown)}</span> ثانیهٔ دیگر
        </span>
      ) : (
        "ارسال دوبارهٔ پیوند"
      )}
    </Button>
  );
}
