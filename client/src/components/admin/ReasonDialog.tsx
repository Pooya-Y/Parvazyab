import { useId, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface ReasonRequest {
  title: string;
  description: string;
  confirmLabel: string;
  /** Shown to the account concerned, so it should say what to fix. */
  placeholder: string;
  /** Defaults to explaining that the account concerned will see the reason. */
  fieldLabel?: string;
  /** A report is not a sanction: it confirms with a plain button. */
  tone?: "destructive" | "default";
  run: (reason: string) => Promise<void>;
}

/**
 * Confirms a moderation decision and asks why. The reason reaches the affected
 * account (in its notification) and the audit log, so it's worth a sentence.
 */
export function ReasonDialog({ request, onClose }: { request: ReasonRequest | null; onClose: () => void }) {
  // Keep showing the last request while the dialog animates closed, instead of an empty box.
  const [last, setLast] = useState(request);
  if (request && request !== last) setLast(request);
  const shown = request ?? last;
  return (
    <Dialog open={request !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        {shown ? <ReasonForm key={shown.title} request={shown} onClose={onClose} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function ReasonForm({ request, onClose }: { request: ReasonRequest; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const id = useId();

  const confirm = async () => {
    setBusy(true);
    try {
      await request.run(reason.trim());
      onClose();
    } catch {
      // `run` reports its own failure; the dialog stays open to try again.
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void confirm();
      }}
    >
      <DialogHeader>
        <DialogTitle>{request.title}</DialogTitle>
        <DialogDescription>{request.description}</DialogDescription>
      </DialogHeader>
      <label htmlFor={id} className="mt-4 mb-1.5 block text-sm font-medium">
        {request.fieldLabel ?? "دلیل (اختیاری، برای حساب مربوط نمایش داده می‌شود)"}
      </label>
      <textarea
        id={id}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        maxLength={300}
        rows={3}
        placeholder={request.placeholder}
        className="w-full resize-y rounded-md border bg-transparent px-3 py-2 text-sm leading-7 outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        disabled={busy}
        autoFocus
      />
      <DialogFooter className="mt-4">
        <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
          انصراف
        </Button>
        <Button type="submit" variant={request.tone === "default" ? "default" : "destructive"} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {request.confirmLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}
