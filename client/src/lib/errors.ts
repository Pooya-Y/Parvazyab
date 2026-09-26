import { ApiError } from "./api";

/** Server error codes (and validation detail codes) → Persian, user-facing text. */
const MESSAGES: Record<string, string> = {
  NETWORK_ERROR: "ارتباط با سرور برقرار نشد. اتصال اینترنت خود را بررسی کنید.",
  INTERNAL_SERVER_ERROR: "مشکلی در سرور پیش آمد. کمی بعد دوباره تلاش کنید.",
  RATE_LIMITED: "تعداد درخواست‌ها زیاد بود. چند دقیقه بعد دوباره تلاش کنید.",
  UNAUTHENTICATED: "برای ادامه، ابتدا وارد حساب کاربری شوید.",
  FORBIDDEN: "اجازه انجام این کار را ندارید.",
  NOT_FOUND: "مورد درخواستی پیدا نشد یا حذف شده است.",
  INVALID_AUTHENTICATION: "ایمیل یا رمز عبور اشتباه است.",
  ACCOUNT_ALREADY_EXISTS: "با این ایمیل قبلاً ثبت‌نام شده است. وارد شوید.",
  SAME_ORIGIN_DESTINATION: "مبدا و مقصد نمی‌توانند یکسان باشند.",
  ARRIVAL_BEFORE_DEPARTURE: "زمان رسیدن باید بعد از زمان حرکت باشد.",
  UNKNOWN_AIRPORT: "فرودگاه انتخاب‌شده معتبر نیست.",
  INVALID_DATE: "تاریخ انتخاب‌شده معتبر نیست.",
  INVALID_BOOKING_URL: "لینک رزرو باید با https:// یا http:// شروع شود.",
  CANNOT_CHANGE_ADMIN: "نقش مدیران سیستم قابل تغییر نیست.",
  CANNOT_CHANGE_OWN_ROLE: "نمی‌توانید نقش حساب خودتان را تغییر دهید.",
  INVALID_OR_EXPIRED_TOKEN: "این پیوند منقضی شده یا قبلاً استفاده شده است.",
  RESEND_TOO_SOON: "ایمیل قبلی همین الان فرستاده شد. یک دقیقه بعد دوباره تلاش کنید.",
  EMAIL_ALREADY_VERIFIED: "نشانی ایمیل شما قبلاً تأیید شده است.",
  GUEST_ACCOUNT: "این کار برای حساب مهمان ممکن نیست. یک حساب دائمی بسازید.",
  INVALID_CURRENT_PASSWORD: "رمز عبور فعلی درست نیست.",
  PASSWORD_UNCHANGED: "رمز عبور تازه باید با رمز فعلی فرق داشته باشد.",
  INVALID_REQUEST: "اطلاعات واردشده معتبر نیست.",
};

export function errorCode(err: unknown): string | null {
  return err instanceof ApiError ? err.code : null;
}

export function errorMessage(err: unknown, fallback = "خطایی رخ داد. دوباره تلاش کنید."): string {
  if (!(err instanceof ApiError)) return fallback;
  // Validation errors carry "field: CODE" details — prefer a specific message.
  for (const detail of err.details) {
    const code = detail.split(": ").pop() ?? "";
    if (MESSAGES[code]) return MESSAGES[code];
  }
  return MESSAGES[err.code] ?? (err.status >= 500 ? MESSAGES.INTERNAL_SERVER_ERROR : fallback);
}
