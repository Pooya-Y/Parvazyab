/**
 * Airline-name normalization (torob-style "same product, several names"): one
 * airline, several spellings/languages. Agencies type free-text airline names;
 * this canonicalizes them so dedupe + filters match correctly.
 */
const AIRLINE_ALIASES = new Map<string, string>([
  ["mahan air", "ماهان ایر"],
  ["ماهان", "ماهان ایر"],
  ["ماهان‌ایر", "ماهان ایر"],
  ["mahan", "ماهان ایر"],
  ["iran air", "ایران ایر"],
  ["هما", "ایران ایر"],
  ["ایران‌ایر", "ایران ایر"],
  ["qeshm air", "قشم ایر"],
  ["قشم ایر", "قشم ایر"],
  ["قشم‌ایر", "قشم ایر"],
  ["zagros", "زاگرس"],
  ["زاگرس", "زاگرس"],
  ["flydubai", "فلای دبی"],
  ["فلای‌دبی", "فلای دبی"],
  ["فلای دبی", "فلای دبی"],
  ["turkish airlines", "ترکیش ایرلاینز"],
  ["turkish", "ترکیش ایرلاینز"],
  ["ترکیش", "ترکیش ایرلاینز"],
  ["emirates", "امارات"],
  ["امارات", "امارات"],
]);

/** Reliability score in [0,1]; a real system derives it from delay history. */
const AIRLINE_RELIABILITY: Record<string, number> = {
  "ماهان ایر": 0.9,
  "ترکیش ایرلاینز": 0.95,
  "ایران ایر": 0.85,
  "قشم ایر": 0.75,
  زاگرس: 0.7,
  "فلای دبی": 0.88,
  امارات: 0.92,
};

export function resolveCanonicalAirlineName(rawName: string): string {
  const key = String(rawName).trim().toLowerCase();
  return AIRLINE_ALIASES.get(key) ?? rawName.trim();
}

export function getAirlineReliability(canonicalName: string): number {
  return AIRLINE_RELIABILITY[canonicalName] ?? 0.6;
}

/** Distinct known airlines (canonical Persian names) for filter UIs. */
export function allKnownAirlines(): string[] {
  return [...new Set(Object.keys(AIRLINE_RELIABILITY))].sort((a, b) => a.localeCompare(b, "fa"));
}
