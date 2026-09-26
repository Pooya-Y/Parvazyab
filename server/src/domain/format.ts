import { airportCity } from "./airports";
import { TEHRAN_OFFSET_MS } from "./time";

/**
 * Persian text for messages the server writes itself (notifications, email).
 * The web client has its own formatters; these cover the few server needs.
 */
const faNumber = new Intl.NumberFormat("fa-IR");
const faDayMonth = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
  timeZone: "UTC",
  weekday: "long",
  day: "numeric",
  month: "long",
});

/** 2150000 → "۲٬۱۵۰٬۰۰۰ تومان" */
export const formatTomanFa = (toman: number) => `${faNumber.format(toman)} تومان`;

/** An instant as its Iran calendar day: "شنبه ۴ مهر". */
export const formatTehranDay = (at: Date) => faDayMonth.format(new Date(at.getTime() + TEHRAN_OFFSET_MS));

/** "تهران (مهرآباد)" → "تهران": message text names cities, not airports. */
export const cityName = (code: string) => airportCity(code).replace(/\s*\(.*\)$/, "");
