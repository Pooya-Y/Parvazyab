import type { Flight } from "@/lib/types";

/**
 * "Why this option?" text, built from the reasons the server attached while
 * ranking (each derived from the flight's attributes vs. the result set).
 */
export function explainFlight(flight: Pick<Flight, "reasons">): string {
  const reasons = flight.reasons ?? [];
  if (reasons.length === 0) return "ترکیب متعادلی از قیمت، مدت پرواز و تعداد توقف دارد.";
  return `${reasons
    .slice(0, 3)
    .map((r) => r.text)
    .join("؛ ")}.`;
}
