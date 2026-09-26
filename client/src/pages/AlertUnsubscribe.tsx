import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { CircleCheck, Loader2, MailX } from "lucide-react";
import { AuthFooter, AuthShell } from "@/components/auth/AuthShell";
import { FormError } from "@/components/auth/fields";
import { Button } from "@/components/ui/button";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/errors";

/**
 * From the link in an alert email. It asks before acting, so a mail scanner
 * following the link changes nothing; mail clients use the one-click POST.
 */
export default function AlertUnsubscribePage() {
  const [params] = useSearchParams();
  const alertId = params.get("alert");
  const sig = params.get("sig");
  const [state, setState] = useState<"ready" | "busy" | "done">("ready");
  const [error, setError] = useState<string | null>(null);
  useDocumentTitle("لغو ایمیل‌های هشدار");

  const footer = (
    <AuthFooter>
      <Link to="/dashboard/alerts" className="font-medium text-primary underline-offset-4 hover:underline">
        مدیریت همهٔ هشدارها
      </Link>
    </AuthFooter>
  );

  if (!alertId || !sig) {
    return (
      <AuthShell title="این پیوند کامل نیست">
        <p className="p-6 text-sm leading-7">
          نشانی ناقص کپی شده است. می‌توانید ایمیل هشدارها را از داشبورد، بخش «هشدارهای قیمت» خاموش کنید.
        </p>
        {footer}
      </AuthShell>
    );
  }

  if (state === "done") {
    return (
      <AuthShell title="دیگر ایمیل نمی‌فرستیم">
        <div className="flex items-start gap-3 p-6" role="status">
          <CircleCheck className="mt-1 size-5 shrink-0 text-success" aria-hidden />
          <p className="text-sm leading-7">
            برای این هشدار دیگر ایمیلی فرستاده نمی‌شود. اعلان‌های آن همچنان در پروازیاب نشان داده می‌شوند.
          </p>
        </div>
        {footer}
      </AuthShell>
    );
  }

  const confirm = async () => {
    setState("busy");
    setError(null);
    try {
      await api.alerts.unsubscribe(alertId, sig);
      setState("done");
    } catch (err) {
      setError(errorMessage(err, "انجام نشد. دوباره تلاش کنید."));
      setState("ready");
    }
  };

  return (
    <AuthShell title="لغو ایمیل‌های این هشدار" description="هشدار سر جایش می‌ماند؛ فقط ایمیل‌هایش قطع می‌شود.">
      <div className="space-y-4 p-6">
        <FormError message={error} />
        <Button className="h-11 w-full" onClick={() => void confirm()} disabled={state === "busy"}>
          {state === "busy" ? <Loader2 className="animate-spin" aria-hidden /> : <MailX aria-hidden />}
          دیگر برای این هشدار ایمیل نفرست
        </Button>
      </div>
      {footer}
    </AuthShell>
  );
}
