import { useId, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router";
import { BellPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { FormError } from "@/components/auth/fields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { airportShortCity } from "@/domain/airports";
import { useAuth } from "@/hooks/use-auth";
import { isGuest } from "@/lib/account";
import { alertWindow, AROUND_DAYS, suggestTarget, type AlertScope } from "@/lib/alerts";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { formatDateKey, formatPrice, toEnDigits, toFaDigits } from "@/lib/persian";
import { invalidate } from "@/lib/use-api-query";

/** A native radio row: keyboard, grouping and screen readers for free. */
function Choice({
  name,
  checked,
  onChange,
  children,
  hint,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  children: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 hover:bg-accent/60">
      <input type="radio" name={name} checked={checked} onChange={onChange} className="mt-1 size-4 accent-primary" />
      <span className="text-sm leading-6">
        {children}
        {hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
      </span>
    </label>
  );
}

interface AlertTarget {
  originCode: string;
  destinationCode: string;
  /** The day the user is looking at, if any. */
  date?: string | null;
  cabin?: "economy" | "business";
  /** The lowest fare on screen, to suggest a target. */
  lowestPrice?: number | null;
}

function PriceAlertForm({ target, onDone }: { target: AlertTarget; onDone: () => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [scope, setScope] = useState<AlertScope>(target.date ? "day" : "any");
  const [kind, setKind] = useState<"drop" | "target">("drop");
  const suggested = suggestTarget(target.lowestPrice);
  const [targetInput, setTargetInput] = useState(suggested ? String(suggested) : "");
  const canEmail = user !== null && user.email !== null && user.emailVerifiedAt !== null && !isGuest(user);
  const [email, setEmail] = useState(canEmail);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  const targetPrice = Number(targetInput) || 0;

  const submit = async () => {
    if (kind === "target" && targetPrice < 10_000) {
      setError("سقف قیمت را به تومان وارد کنید.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.alerts.create({
        originCode: target.originCode,
        destinationCode: target.destinationCode,
        ...alertWindow(scope, target.date ?? null),
        cabin: target.cabin,
        targetPrice: kind === "target" ? targetPrice : undefined,
        notifyEmail: email && canEmail,
      });
      invalidate("alerts");
      toast.success("هشدار قیمت ساخته شد", {
        description: "هر ۱۵ دقیقه قیمت‌ها را بررسی می‌کنیم.",
        action: { label: "مدیریت هشدارها", onClick: () => navigate("/dashboard/alerts") },
      });
      onDone();
    } catch (err) {
      setError(errorMessage(err, "هشدار ساخته نشد. دوباره تلاش کنید."));
      setBusy(false);
    }
  };

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <fieldset>
        <legend className="mb-1 text-sm font-medium">کدام روزها؟</legend>
        {target.date ? (
          <>
            <Choice name={`${id}-scope`} checked={scope === "day"} onChange={() => setScope("day")}>
              فقط {formatDateKey(target.date, { weekday: true })}
            </Choice>
            <Choice
              name={`${id}-scope`}
              checked={scope === "around"}
              onChange={() => setScope("around")}
              hint={`${toFaDigits(AROUND_DAYS)} روز قبل و بعد از آن`}
            >
              حدود همین تاریخ
            </Choice>
          </>
        ) : null}
        <Choice
          name={`${id}-scope`}
          checked={scope === "any"}
          onChange={() => setScope("any")}
          hint="ارزان‌ترین پرواز در هر روزی از این بازه"
        >
          هر روزی تا ۳۰ روز آینده
        </Choice>
      </fieldset>

      <fieldset>
        <legend className="mb-1 text-sm font-medium">کی خبرتان کنیم؟</legend>
        <Choice
          name={`${id}-kind`}
          checked={kind === "drop"}
          onChange={() => setKind("drop")}
          hint={
            target.lowestPrice
              ? `کمترین قیمت الان ${formatPrice(target.lowestPrice)} است.`
              : "کمترین قیمت همین حالا مبنای مقایسه می‌شود."
          }
        >
          هر بار که قیمت ۳٪ یا بیشتر پایین آمد
        </Choice>
        <Choice
          name={`${id}-kind`}
          checked={kind === "target"}
          onChange={() => {
            setKind("target");
            // Results may have loaded after the dialog opened: suggest from the fare shown now.
            if (!targetInput && suggested) setTargetInput(String(suggested));
          }}
        >
          وقتی قیمت به سقف دلخواه من رسید
        </Choice>
        {kind === "target" ? (
          <div className="mt-2 ms-9 space-y-1">
            <label htmlFor={`${id}-target`} className="sr-only">
              سقف قیمت به تومان
            </label>
            <div className="flex items-center gap-2">
              <Input
                id={`${id}-target`}
                inputMode="numeric"
                dir="ltr"
                className="h-10 max-w-44 tabular-nums"
                value={targetInput}
                onChange={(e) => setTargetInput(toEnDigits(e.target.value).replace(/\D/g, "").slice(0, 11))}
                aria-describedby={`${id}-target-hint`}
                autoFocus
              />
              <span className="text-sm text-muted-foreground">تومان</span>
            </div>
            <p id={`${id}-target-hint`} className="text-xs text-muted-foreground" aria-live="polite">
              {targetPrice >= 10_000 ? `یعنی ${formatPrice(targetPrice)}` : "مبلغ را به تومان بنویسید."}
            </p>
          </div>
        ) : null}
      </fieldset>

      <label className="flex items-start gap-3 px-2 text-sm leading-6">
        <input
          type="checkbox"
          checked={email && canEmail}
          disabled={!canEmail}
          onChange={(e) => setEmail(e.target.checked)}
          className="mt-1 size-4 accent-primary"
        />
        <span>
          ایمیل هم بفرست
          <span className="block text-xs text-muted-foreground">
            {canEmail ? (
              <bdi dir="ltr">{user?.email}</bdi>
            ) : (
              "برای ایمیل، یک نشانی ایمیل تأییدشده لازم است. اعلان‌ها در پروازیاب نمایش داده می‌شوند."
            )}
          </span>
        </span>
      </label>

      <FormError message={error} />
      <DialogFooter>
        <Button type="submit" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" aria-hidden /> : <BellPlus aria-hidden />}
          ساخت هشدار
        </Button>
      </DialogFooter>
    </form>
  );
}

/**
 * "Tell me when it gets cheaper" for a route. Signed-out visitors are sent to
 * sign in first and come back here.
 */
export function PriceAlertButton({ compact = false, ...target }: AlertTarget & { compact?: boolean }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const route = `${airportShortCity(target.originCode)} به ${airportShortCity(target.destinationCode)}`;

  const onClick = () => {
    if (!user) {
      navigate(`/auth?returnTo=${encodeURIComponent(`${location.pathname}${location.search}`)}`);
      return;
    }
    setOpen(true);
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size={compact ? "icon" : "default"}
        onClick={onClick}
        aria-label={compact ? `هشدار قیمت ${route}` : undefined}
        title={compact ? "هشدار قیمت" : undefined}
      >
        <BellPlus aria-hidden />
        {compact ? null : "هشدار قیمت"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>هشدار قیمت {route}</DialogTitle>
            <DialogDescription>وقتی قیمت پایین بیاید، در پروازیاب خبرتان می‌کنیم.</DialogDescription>
          </DialogHeader>
          {/* The content unmounts when the dialog closes, so every opening starts with a fresh form. */}
          <PriceAlertForm target={target} onDone={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}
