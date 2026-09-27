import { useId, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { Flag, Loader2 } from "lucide-react";
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
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { REPORT_REASONS } from "@/lib/listing-reports";
import { formatPrice, toEnDigits } from "@/lib/persian";
import type { FlightOffer, ReportReason } from "@/lib/types";
import { cn } from "@/lib/utils";

/** "۲٬۹۰۰٬۰۰۰" or "2,900,000" → 2900000; anything else → null. */
function parsePrice(text: string): number | null {
  const digits = toEnDigits(text).replace(/[^\d]/g, "");
  const value = digits ? Number(digits) : NaN;
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function ReportForm({ offer, onDone }: { offer: FlightOffer; onDone: () => void }) {
  const id = useId();
  const [reason, setReason] = useState<ReportReason>("price_mismatch");
  const [price, setPrice] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (reason === "other" && note.trim().length < 3) {
      setError("برای «دلیل دیگر» چند کلمه توضیح بنویسید.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.reportListing(offer.listingId, {
        reason,
        observedPrice: reason === "price_mismatch" ? parsePrice(price) : null,
        note: note.trim(),
      });
      toast.success("گزارش شما ثبت شد؛ ممنون", { description: "بعد از بررسی، نتیجه را در اعلان‌هایتان می‌بینید." });
      onDone();
    } catch (err) {
      setError(errorMessage(err, "گزارش ثبت نشد. دوباره تلاش کنید."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-semibold">چه مشکلی دیدید؟</legend>
        {REPORT_REASONS.map((r) => (
          <label
            key={r.value}
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 text-sm transition-colors hover:bg-accent",
              "has-[:checked]:border-primary has-[:checked]:bg-primary/[0.04] has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50",
            )}
          >
            <input
              type="radio"
              name={`${id}-reason`}
              value={r.value}
              checked={reason === r.value}
              onChange={() => setReason(r.value)}
              className="size-4 accent-primary"
            />
            {r.label}
          </label>
        ))}
      </fieldset>

      {reason === "price_mismatch" ? (
        <div className="space-y-1.5">
          <label htmlFor={`${id}-price`} className="text-sm font-medium">
            قیمت در سایت آژانس (تومان)
          </label>
          <Input
            id={`${id}-price`}
            inputMode="numeric"
            dir="ltr"
            className="tabular-nums"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            maxLength={20}
            aria-describedby={`${id}-price-hint`}
          />
          <p id={`${id}-price-hint`} className="text-xs text-muted-foreground">
            اختیاری. قیمت اینجا: {formatPrice(offer.priceToman)}
          </p>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <label htmlFor={`${id}-note`} className="text-sm font-medium">
          توضیح {reason === "other" ? null : <span className="font-normal text-muted-foreground">(اختیاری)</span>}
        </label>
        <textarea
          id={`${id}-note`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          rows={3}
          className="w-full resize-y rounded-md border bg-transparent px-3 py-2 text-sm leading-7 outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          placeholder="مثلاً: در سایت آژانس ظرفیت این پرواز تمام شده است."
        />
      </div>

      <FormError message={error} />
      <DialogFooter>
        <Button type="submit" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
          ثبت گزارش
        </Button>
        <Button type="button" variant="outline" onClick={onDone} disabled={busy}>
          انصراف
        </Button>
      </DialogFooter>
    </form>
  );
}

/**
 * "This offer doesn't match the agency's site": a traveller's report for the
 * administrators, who can take the offer down. Signing in comes first.
 */
export function ReportOfferButton({ offer }: { offer: FlightOffer }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);

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
        variant="ghost"
        size="sm"
        className="text-muted-foreground"
        onClick={onClick}
        aria-label={`گزارش مشکل در پیشنهاد ${offer.agencyName}`}
      >
        <Flag aria-hidden />
        <span className="hidden sm:inline">گزارش</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>گزارش پیشنهاد «{offer.agencyName}»</DialogTitle>
            <DialogDescription className="leading-7">
              اگر این پیشنهاد با سایت آژانس نمی‌خواند، خبرمان کنید. مدیر سایت بررسی می‌کند و در صورت لزوم آن را از نتایج
              برمی‌دارد.
            </DialogDescription>
          </DialogHeader>
          {/* The content unmounts once the dialog has closed, so each opening starts with a fresh form. */}
          <ReportForm offer={offer} onDone={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}
