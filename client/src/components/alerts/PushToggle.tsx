import { useEffect, useState } from "react";
import { BellRing, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { disablePush, enablePush, pushStatus, type PushStatus } from "@/lib/push";

const DESCRIPTION: Record<Exclude<PushStatus, "unavailable">, string> = {
  unsupported:
    "این مرورگر اعلان سایت را پشتیبانی نمی‌کند. روی آیفون، اول پروازیاب را از منوی اشتراک‌گذاری به صفحهٔ اصلی اضافه کنید.",
  blocked: "اعلان‌های پروازیاب در تنظیمات این مرورگر مسدود شده است؛ برای روشن کردن، از تنظیمات سایت اجازه دهید.",
  off: "کاهش قیمت‌ها را همان لحظه، حتی وقتی پروازیاب باز نیست، روی همین دستگاه ببینید.",
  on: "کاهش قیمت‌ها روی همین دستگاه اعلان می‌شود.",
};

/** Push for this device: shown only when the server offers it; explains every state it can't change. */
export function PushToggle() {
  const [state, setState] = useState<{ status: PushStatus; publicKey: string | null } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    pushStatus().then(
      (next) => active && setState(next),
      () => active && setState({ status: "unsupported", publicKey: null }),
    );
    return () => {
      active = false;
    };
  }, []);

  if (!state || state.status === "unavailable") return null;

  const toggle = async (on: boolean) => {
    if (!state.publicKey) return;
    setBusy(true);
    try {
      const status = on ? await enablePush(state.publicKey) : await disablePush();
      setState({ ...state, status });
      if (on && status === "on") toast.success("اعلان روی این دستگاه روشن شد");
      if (on && status === "blocked") toast.error("مرورگر اجازهٔ اعلان نداد.");
    } catch {
      toast.error("روشن کردن اعلان روی این مرورگر ممکن نشد.");
    } finally {
      setBusy(false);
    }
  };

  const interactive = state.status === "on" || state.status === "off";
  return (
    <div className="mb-4 flex items-start gap-3 rounded-lg border bg-card px-4 py-3">
      <BellRing className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium" id="push-toggle-label">
          اعلان روی این دستگاه
        </p>
        <p className="text-xs leading-6 text-muted-foreground">{DESCRIPTION[state.status]}</p>
      </div>
      {interactive ? (
        busy ? (
          <Loader2 className="mt-1 size-5 animate-spin text-muted-foreground" aria-label="در حال انجام" />
        ) : (
          <Switch
            checked={state.status === "on"}
            onCheckedChange={(on) => void toggle(on)}
            aria-labelledby="push-toggle-label"
            className="mt-1"
          />
        )
      ) : null}
    </div>
  );
}
