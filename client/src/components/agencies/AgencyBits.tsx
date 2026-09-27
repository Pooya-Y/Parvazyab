import { BadgeCheck, Star } from "lucide-react";
import { Link } from "react-router";
import { formatRating } from "@/lib/agencies";
import { toFaDigits } from "@/lib/persian";
import type { AgencyRating } from "@/lib/types";
import { cn } from "@/lib/utils";

/** "★ ۴٫۶ (۸)": the number carries the meaning; the star just marks it as a rating. */
export function RatingChip({ rating, className }: { rating: AgencyRating; className?: string }) {
  return (
    <span
      className={cn("inline-flex items-center gap-0.5 text-xs whitespace-nowrap text-muted-foreground", className)}
      aria-label={`امتیاز ${formatRating(rating.average)} از ۵، ${toFaDigits(rating.count)} نظر`}
    >
      <Star className="size-3 fill-current text-amber-500" aria-hidden />
      <span className="font-medium text-foreground tabular-nums" aria-hidden>
        {formatRating(rating.average)}
      </span>
      <span className="tabular-nums" aria-hidden>
        ({toFaDigits(rating.count)})
      </span>
    </span>
  );
}

export function VerifiedMark({ className }: { className?: string }) {
  return (
    <BadgeCheck className={cn("size-4 shrink-0 text-chart-1", className)} aria-label="آژانس تأییدشده" role="img">
      <title>آژانس تأییدشده: مدارک این آژانس بررسی شده است.</title>
    </BadgeCheck>
  );
}

/** An agency's name as it appears beside an offer: linked to its profile, verified mark, rating. */
export function AgencyName({
  name,
  slug,
  verified,
  rating,
}: {
  name: string;
  slug?: string | null;
  verified?: boolean;
  rating?: AgencyRating | null;
}) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      {slug ? (
        <Link
          to={`/agencies/${encodeURIComponent(slug)}`}
          className="truncate underline-offset-4 hover:underline focus-visible:underline"
        >
          {name}
        </Link>
      ) : (
        <span className="truncate">{name}</span>
      )}
      {verified ? <VerifiedMark className="size-3.5" /> : null}
      {rating ? <RatingChip rating={rating} /> : null}
    </span>
  );
}
