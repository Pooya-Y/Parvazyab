/**
 * Static reference data for airports/cities. Lives in code rather than a database
 * table: it is stable reference data, so a migration-backed table would add query
 * overhead for no benefit. If it ever needs to be admin-editable, promote it to a
 * table then.
 *
 * Tehran (Imam Khomeini) (IKA) is intentionally placed in the INTERNATIONAL section
 * (requirement #6): IKA is Iran's international hub, so Tehran international
 * departures surface under the foreign-airports group in search/filter UIs.
 */
export interface Airport {
  code: string;
  city: string;
  country: string;
  isInternational: boolean;
}

function make(code: string, city: string, country: string, isInternational: boolean): Airport {
  return { code, city, country, isInternational };
}

/** Domestic (Iran) airports. */
export const IRAN_AIRPORTS: Airport[] = [
  make("THR", "تهران (مهرآباد)", "IR", false),
  make("MHD", "مشهد", "IR", false),
  make("IFN", "اصفهان", "IR", false),
  make("SYZ", "شیراز", "IR", false),
  make("TBZ", "تبریز", "IR", false),
  make("AWZ", "اهواز", "IR", false),
  make("KIH", "کیش", "IR", false),
  make("BND", "بندرعباس", "IR", false),
  make("KER", "کرمان", "IR", false),
  make("RAS", "رشت", "IR", false),
  make("ZAH", "زاهدان", "IR", false),
  make("AZD", "یزد", "IR", false),
  make("GBT", "گرگان", "IR", false),
  make("SRY", "ساری (دشت ناز)", "IR", false),
  make("OMH", "ارومیه", "IR", false),
  make("KSH", "کرمانشاه", "IR", false),
  make("HDM", "همدان", "IR", false),
  make("ADU", "اردبیل", "IR", false),
  make("ABD", "آبادان", "IR", false),
  make("BUZ", "بوشهر", "IR", false),
  make("ACZ", "زابل", "IR", false),
  make("IIL", "ایلام", "IR", false),
  make("XBJ", "بجنورد", "IR", false),
  make("BXR", "بم", "IR", false),
  make("JYR", "جیرفت", "IR", false),
  make("LFM", "لامرد", "IR", false),
  make("PGU", "عسلویه", "IR", false),
  make("CQD", "شهرکرد", "IR", false),
  make("KHY", "خوی", "IR", false),
  make("AEU", "آبادان بین‌المللی", "IR", false),
  make("GSM", "قشم", "IR", false),
];

/**
 * International / foreign airports. Includes Tehran Imam Khomeini (IKA) per
 * requirement #6 — it groups with the foreign section for international departures.
 */
export const INTERNATIONAL_AIRPORTS: Airport[] = [
  make("IKA", "تهران (امام خمینی)", "IR", true),
  make("IST", "استانبول", "TR", true),
  make("DXB", "دبی", "AE", true),
  make("AUH", "ابوظبی", "AE", true),
  make("DOH", "دوحه", "QA", true),
  make("BGW", "بغداد", "IQ", true),
  make("NJF", "نجف", "IQ", true),
];

export const ALL_AIRPORTS: Airport[] = [...IRAN_AIRPORTS, ...INTERNATIONAL_AIRPORTS];

const AIRPORT_BY_CODE = new Map(ALL_AIRPORTS.map((a) => [a.code, a]));

export function findAirport(code: string): Airport | undefined {
  return AIRPORT_BY_CODE.get(code);
}

export function airportCity(code: string): string {
  return AIRPORT_BY_CODE.get(code)?.city ?? code;
}

export function isKnownAirport(code: string): boolean {
  return AIRPORT_BY_CODE.has(code);
}

/** Airports grouped for picker UIs (domestic list + foreign list). */
export function groupedAirports(): {
  domestic: Airport[];
  international: Airport[];
} {
  return { domestic: IRAN_AIRPORTS, international: INTERNATIONAL_AIRPORTS };
}
