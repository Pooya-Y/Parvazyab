import type { ComponentType } from "react";
import { RotateCcw, WifiOff } from "lucide-react";
import { StateMessage } from "@/components/StateMessage";
import { Button } from "@/components/ui/button";
import { airportShortCity } from "@/domain/airports";
import { errorMessage } from "@/lib/errors";

export function RouteLabel({ from, to }: { from: string; to: string }) {
  return (
    <>
      {airportShortCity(from)} <span className="text-muted-foreground">به</span> {airportShortCity(to)}
    </>
  );
}

export function LoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <StateMessage
      tone="error"
      icon={WifiOff}
      title="اطلاعات دریافت نشد"
      description={errorMessage(error)}
      action={
        <Button variant="outline" onClick={onRetry}>
          <RotateCcw />
          تلاش دوباره
        </Button>
      }
    />
  );
}

export function StatBox({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="size-3.5" aria-hidden />
        {label}
      </div>
      <p className="mt-1.5 truncate text-lg font-bold tabular-nums sm:text-xl">{value}</p>
    </div>
  );
}
