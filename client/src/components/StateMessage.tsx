import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { cn } from "@/lib/utils";

/** Consistent empty / error / invalid-input state. */
export function StateMessage({
  icon: Icon,
  title,
  description,
  action,
  tone = "default",
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  tone?: "default" | "error";
  className?: string;
}) {
  return (
    <Empty
      className={cn("rounded-xl border bg-card px-4 py-10", className)}
      role={tone === "error" ? "alert" : undefined}
    >
      <EmptyHeader>
        <EmptyMedia variant="icon" className={tone === "error" ? "bg-destructive/10 text-destructive" : undefined}>
          <Icon aria-hidden />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        {description ? <EmptyDescription className="leading-7">{description}</EmptyDescription> : null}
      </EmptyHeader>
      {action ? <EmptyContent className="flex-row flex-wrap justify-center">{action}</EmptyContent> : null}
    </Empty>
  );
}
