import { useId } from "react";
import { cn } from "@/lib/utils";

/** A compact single-choice control built on native radios (keyboard and screen readers for free). */
export function Segmented<T extends string | number>({
  legend,
  options,
  value,
  onChange,
  className,
}: {
  legend: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  const name = useId();
  return (
    <fieldset className={cn("inline-flex rounded-md border bg-muted/40 p-0.5", className)}>
      <legend className="sr-only">{legend}</legend>
      {options.map((o) => (
        <label key={String(o.value)} className="relative">
          <input
            type="radio"
            name={name}
            className="peer sr-only"
            checked={value === o.value}
            onChange={() => onChange(o.value)}
          />
          <span
            className={cn(
              "flex h-8 cursor-pointer items-center rounded-[5px] px-3 text-sm whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground",
              "peer-checked:bg-card peer-checked:font-semibold peer-checked:text-foreground peer-checked:shadow-sm",
              "peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50",
            )}
          >
            {o.label}
          </span>
        </label>
      ))}
    </fieldset>
  );
}
