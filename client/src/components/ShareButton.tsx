import { useState } from "react";
import { Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { shareLink } from "@/lib/share";

/** Shares `url` (default: the current page) through the share sheet, or copies it. */
export function ShareButton({
  title,
  text,
  url,
  label = "اشتراک‌گذاری",
  compact = false,
}: {
  title: string;
  text: string;
  url?: string;
  label?: string;
  /** Icon-only (the label stays as the accessible name). */
  compact?: boolean;
}) {
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    setBusy(true);
    const link = url ? new URL(url, window.location.origin).href : window.location.href;
    const outcome = await shareLink({ title, text, url: link });
    setBusy(false);
    if (outcome === "copied") toast.success("پیوند کپی شد", { description: "آن را هر جا خواستید بچسبانید." });
    else if (outcome === "failed") toast.error("کپی پیوند انجام نشد", { description: link });
  };

  return (
    <Button
      type="button"
      variant="outline"
      size={compact ? "icon" : "default"}
      onClick={() => void onClick()}
      disabled={busy}
      aria-label={compact ? label : undefined}
      title={compact ? label : undefined}
    >
      <Share2 aria-hidden />
      {compact ? null : label}
    </Button>
  );
}
