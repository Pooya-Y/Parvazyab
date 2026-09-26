import { Link } from "react-router";
import { formatRelativeTime } from "@/lib/persian";
import type { AppNotification } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Notification links are in-app paths; anything else is dropped rather than followed. */
const inAppPath = (link: string | null) => (link && link.startsWith("/") && !link.startsWith("//") ? link : null);

function Row({ item, now, onOpen }: { item: AppNotification; now: number; onOpen: (item: AppNotification) => void }) {
  const content = (
    <>
      <span
        className={cn("mt-2 size-2 shrink-0 rounded-full", item.read ? "bg-transparent" : "bg-primary")}
        aria-hidden
      />
      <span className="min-w-0 flex-1">
        <span className={cn("block text-sm leading-6", !item.read && "font-semibold")}>
          {item.title}
          {item.read ? null : <span className="sr-only"> (خوانده‌نشده)</span>}
        </span>
        <span className="block text-sm leading-6 text-muted-foreground">{item.body}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          <time dateTime={new Date(item.createdAt).toISOString()}>{formatRelativeTime(item.createdAt, now)}</time>
        </span>
      </span>
    </>
  );
  const className =
    "flex w-full gap-3 px-4 py-3 text-start transition-colors hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:outline-none";
  const path = inAppPath(item.link);
  return (
    <li>
      {path ? (
        <Link to={path} className={className} onClick={() => onOpen(item)}>
          {content}
        </Link>
      ) : (
        <button type="button" className={className} onClick={() => onOpen(item)}>
          {content}
        </button>
      )}
    </li>
  );
}

/** Newest first; opening one marks it read (the parent does the marking). */
export function NotificationList({
  items,
  now,
  onOpen,
  className,
}: {
  items: AppNotification[];
  now: number;
  onOpen: (item: AppNotification) => void;
  className?: string;
}) {
  return (
    <ul className={cn("divide-y", className)}>
      {items.map((item) => (
        <Row key={item.id} item={item} now={now} onOpen={onOpen} />
      ))}
    </ul>
  );
}
