/**
 * Row errors from a listing import arrive as "column: CODE" (the CSV column, or
 * the API field). These turn them into Persian a spreadsheet user can act on.
 */
const COLUMN: Record<string, string> = {
  origin: "مبدا",
  destination: "مقصد",
  airline: "ایرلاین",
  flight_no: "شماره پرواز",
  depart: "زمان حرکت",
  arrive: "زمان رسیدن",
  stops: "توقف",
  cabin: "کابین",
  fare_type: "نوع بلیط",
  price_toman: "قیمت",
  booking_url: "لینک خرید",
  active: "فعال",
};

const PROBLEM: Record<string, string> = {
  INVALID_DATETIME: "تاریخ و ساعت را به شکل ۱۴۰۵-۰۷-۰۸ ۰۸:۳۰ بنویسید (شمسی یا میلادی، به وقت ایران).",
  INVALID_NUMBER: "عدد معتبر نیست.",
  INVALID_CABIN: "باید economy (اکونومی) یا business (بیزینس) باشد.",
  INVALID_FARE_TYPE: "باید scheduled (سیستمی) یا charter (چارتری) باشد.",
  INVALID_BOOLEAN: "باید true یا false (بله یا خیر) باشد.",
  UNKNOWN_AIRPORT: "کد فرودگاه شناخته‌شده نیست.",
  SAME_ORIGIN_DESTINATION: "مبدا و مقصد یکی است.",
  ARRIVAL_BEFORE_DEPARTURE: "زمان رسیدن باید بعد از زمان حرکت باشد.",
  DEPARTURE_IN_PAST: "این پرواز انجام شده است.",
  DUPLICATE_ROW: "همین پرواز در ردیف دیگری از فایل هم آمده است.",
  INVALID_BOOKING_URL: "لینک باید با https:// یا http:// شروع شود.",
  REQUIRED: "خالی است.",
  OUT_OF_RANGE: "خارج از محدودهٔ مجاز است.",
  INVALID_VALUE: "مقدار معتبر نیست.",
  INVALID_ROW: "ردیف معتبر نیست.",
};

/** "depart: INVALID_DATETIME" → "زمان حرکت: تاریخ و ساعت را …" */
export function describeRowError(detail: string): string {
  const [field, code] = detail.includes(": ") ? detail.split(": ") : ["", detail];
  const problem = PROBLEM[code] ?? code;
  return field ? `${COLUMN[field] ?? field}: ${problem}` : problem;
}

/** Column names for "these columns are missing" messages. */
export const columnLabel = (column: string) => COLUMN[column] ?? column;
