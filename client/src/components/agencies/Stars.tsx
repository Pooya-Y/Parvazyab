import { useId, useState } from "react";
import { Star } from "lucide-react";
import { formatRating } from "@/lib/agencies";
import { toFaDigits } from "@/lib/persian";
import { cn } from "@/lib/utils";

const STARS = [1, 2, 3, 4, 5] as const;
const LABELS = ["", "خیلی بد", "بد", "معمولی", "خوب", "عالی"];

/** A read-only row of stars; in RTL the first star sits on the right, as the eye starts there. */
export function StarRow({ value, className }: { value: number; className?: string }) {
  return (
    <span
      className={cn("inline-flex items-center gap-0.5", className)}
      role="img"
      aria-label={`${Number.isInteger(value) ? toFaDigits(value) : formatRating(value)} از ۵ ستاره`}
    >
      {STARS.map((s) => (
        <Star
          key={s}
          className={cn(
            "size-3.5",
            s <= Math.round(value) ? "fill-amber-500 text-amber-500" : "text-muted-foreground/40",
          )}
          aria-hidden
        />
      ))}
    </span>
  );
}

/**
 * Choosing 1–5 stars. Native radios underneath: arrow keys move between them,
 * screen readers announce "۴ ستاره، خوب", and a hover previews the choice.
 */
export function StarInput({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  const [hover, setHover] = useState(0);
  const name = useId();
  const shown = hover || value;
  return (
    <fieldset className="flex items-center gap-3" disabled={disabled}>
      <legend className="sr-only">امتیاز شما</legend>
      <span className="inline-flex" onMouseLeave={() => setHover(0)}>
        {STARS.map((s) => (
          <label key={s} className="cursor-pointer p-0.5" onMouseEnter={() => setHover(s)}>
            <input
              type="radio"
              name={name}
              value={s}
              checked={value === s}
              onChange={() => onChange(s)}
              className="peer sr-only"
              aria-label={`${toFaDigits(s)} ستاره، ${LABELS[s]}`}
            />
            <Star
              className={cn(
                "size-7 rounded-sm transition-colors peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50",
                s <= shown ? "fill-amber-500 text-amber-500" : "text-muted-foreground/50",
              )}
              aria-hidden
            />
          </label>
        ))}
      </span>
      <span className="text-sm text-muted-foreground" aria-hidden>
        {shown ? LABELS[shown] : "امتیاز بدهید"}
      </span>
    </fieldset>
  );
}
