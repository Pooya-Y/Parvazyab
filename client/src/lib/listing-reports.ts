import type { ReportReason } from "./types";

/** What a traveller can report about an agency's offer, in the order the form lists it. */
export const REPORT_REASONS: { value: ReportReason; label: string; short: string }[] = [
  { value: "price_mismatch", label: "قیمت با سایت آژانس فرق دارد", short: "قیمت متفاوت" },
  { value: "unavailable", label: "این پرواز در سایت آژانس نیست یا پر شده", short: "ناموجود" },
  { value: "wrong_details", label: "ساعت، ایرلاین یا مسیر درست نیست", short: "اطلاعات نادرست" },
  { value: "broken_link", label: "لینک خرید کار نمی‌کند", short: "لینک خراب" },
  { value: "other", label: "دلیل دیگر", short: "دیگر" },
];

const BY_VALUE = new Map(REPORT_REASONS.map((r) => [r.value, r]));

export const reportReasonLabel = (reason: ReportReason) => BY_VALUE.get(reason)?.label ?? reason;
export const reportReasonShort = (reason: ReportReason) => BY_VALUE.get(reason)?.short ?? reason;
