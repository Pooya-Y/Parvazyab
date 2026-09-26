/**
 * Static airport reference data (mirrors server/src/domain/airports.ts; the
 * server validates codes against its own copy). `en` names let users search in
 * Latin script too ("tehran", "mashhad").
 *
 * Tehran Imam Khomeini (IKA) is grouped with international airports: it's
 * Iran's international hub, so it belongs with foreign destinations in pickers.
 */
export interface Airport {
  code: string;
  city: string;
  en: string;
  country: string;
  isInternational: boolean;
}

type Row = [code: string, city: string, en: string, country?: string];

const domestic = (rows: Row[]): Airport[] =>
  rows.map(([code, city, en]) => ({ code, city, en, country: "IR", isInternational: false }));

export const IRAN_AIRPORTS: Airport[] = domestic([
  ["THR", "تهران (مهرآباد)", "Tehran Mehrabad"],
  ["MHD", "مشهد", "Mashhad"],
  ["IFN", "اصفهان", "Isfahan"],
  ["SYZ", "شیراز", "Shiraz"],
  ["TBZ", "تبریز", "Tabriz"],
  ["AWZ", "اهواز", "Ahvaz"],
  ["KIH", "کیش", "Kish"],
  ["BND", "بندرعباس", "Bandar Abbas"],
  ["KER", "کرمان", "Kerman"],
  ["RAS", "رشت", "Rasht"],
  ["ZAH", "زاهدان", "Zahedan"],
  ["AZD", "یزد", "Yazd"],
  ["GBT", "گرگان", "Gorgan"],
  ["SRY", "ساری (دشت ناز)", "Sari"],
  ["OMH", "ارومیه", "Urmia"],
  ["KSH", "کرمانشاه", "Kermanshah"],
  ["HDM", "همدان", "Hamedan"],
  ["ADU", "اردبیل", "Ardabil"],
  ["ABD", "آبادان", "Abadan"],
  ["BUZ", "بوشهر", "Bushehr"],
  ["ACZ", "زابل", "Zabol"],
  ["IIL", "ایلام", "Ilam"],
  ["XBJ", "بجنورد", "Bojnord"],
  ["BXR", "بم", "Bam"],
  ["JYR", "جیرفت", "Jiroft"],
  ["LFM", "لامرد", "Lamerd"],
  ["PGU", "عسلویه", "Asaluyeh"],
  ["CQD", "شهرکرد", "Shahrekord"],
  ["KHY", "خوی", "Khoy"],
  ["AEU", "آبادان بین‌المللی", "Abadan International"],
  ["GSM", "قشم", "Qeshm"],
]);

export const INTERNATIONAL_AIRPORTS: Airport[] = (
  [
    ["IKA", "تهران (امام خمینی)", "Tehran Imam Khomeini", "IR"],
    ["IST", "استانبول", "Istanbul", "TR"],
    ["DXB", "دبی", "Dubai", "AE"],
    ["AUH", "ابوظبی", "Abu Dhabi", "AE"],
    ["DOH", "دوحه", "Doha", "QA"],
    ["BGW", "بغداد", "Baghdad", "IQ"],
    ["NJF", "نجف", "Najaf", "IQ"],
  ] satisfies Row[]
).map(([code, city, en, country]) => ({ code, city, en, country: country ?? "IR", isInternational: true }));

export const ALL_AIRPORTS: Airport[] = [...IRAN_AIRPORTS, ...INTERNATIONAL_AIRPORTS];

const AIRPORT_BY_CODE = new Map(ALL_AIRPORTS.map((a) => [a.code, a]));

export function findAirport(code: string): Airport | undefined {
  return AIRPORT_BY_CODE.get(code);
}

export function isKnownAirport(code: string): boolean {
  return AIRPORT_BY_CODE.has(code);
}

/** City name for a code; falls back to the code itself. */
export function airportCity(code: string): string {
  return AIRPORT_BY_CODE.get(code)?.city ?? code;
}

/** City without the airport qualifier: "تهران (مهرآباد)" → "تهران". */
export function airportShortCity(code: string): string {
  return airportCity(code).replace(/\s*\(.*\)$/, "");
}
