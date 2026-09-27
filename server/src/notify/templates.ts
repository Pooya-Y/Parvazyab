import { config } from "../config/env";
import { TEHRAN_OFFSET_MS } from "../domain/time";
import { escapeHtml } from "../lib/html";

/**
 * Transactional email in Persian. Each message has a plain-text part that reads
 * well on its own and a minimal RTL HTML part: one column, system fonts, inline
 * styles, a single action. Colors are the app's light theme tokens in hex
 * (email clients don't understand oklch).
 */
export interface MailContent {
  subject: string;
  text: string;
  html: string;
}

const COLOR = {
  brand: "#d40924",
  ink: "#1e1311",
  muted: "#695958",
  rule: "#e6dddc",
  page: "#f7f2f1",
} as const;

const FONT = "Vazirmatn, Tahoma, 'Segoe UI', Arial, sans-serif";

export { escapeHtml };

/** An absolute link into the web app. Tokens go in the fragment, which never reaches a server log or Referer. */
export function appLink(path: string, fragment?: Record<string, string>): string {
  const url = new URL(path, config.APP_URL);
  if (fragment) url.hash = new URLSearchParams(fragment).toString();
  return url.toString();
}

/** "۴ مهر ۱۴۰۵، ساعت ۱۳:۳۵" in Iran time, whatever the server's time zone. */
export function formatTehranDateTime(date: Date): string {
  return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    timeZone: "UTC",
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(date.getTime() + TEHRAN_OFFSET_MS));
}

interface Layout {
  /** Shown by inboxes next to the subject. */
  preheader: string;
  heading: string;
  paragraphs: string[];
  action?: { label: string; url: string };
  footnote: string;
  /** A quiet link under the footnote (e.g. unsubscribe). */
  secondary?: { label: string; url: string };
}

function renderText({ heading, paragraphs, action, footnote, secondary }: Layout): string {
  return [
    heading,
    "",
    ...paragraphs.flatMap((p) => [p, ""]),
    ...(action ? [`${action.label}:`, action.url, ""] : []),
    "—",
    footnote,
    ...(secondary ? ["", `${secondary.label}: ${secondary.url}`] : []),
    "",
    "پروازیاب",
  ].join("\n");
}

function renderHtml(subject: string, { preheader, heading, paragraphs, action, footnote, secondary }: Layout): string {
  const cell = `font-family:${FONT};color:${COLOR.ink};text-align:right;`;
  const button = action
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0 16px;">
        <tr><td style="background:${COLOR.brand};border-radius:6px;">
          <a href="${escapeHtml(action.url)}" style="display:inline-block;padding:12px 22px;font-family:${FONT};font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">${escapeHtml(action.label)}</a>
        </td></tr>
      </table>
      <p style="margin:0 0 4px;font-size:13px;line-height:1.8;color:${COLOR.muted};">اگر دکمه کار نکرد، این نشانی را در مرورگر باز کنید:</p>
      <p dir="ltr" style="margin:0 0 8px;font-size:13px;line-height:1.6;text-align:left;word-break:break-all;"><a href="${escapeHtml(action.url)}" style="color:${COLOR.brand};">${escapeHtml(action.url)}</a></p>`
    : "";
  return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${COLOR.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLOR.page};">
  <tr><td align="center" style="padding:24px 12px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid ${COLOR.rule};border-radius:6px;">
      <tr><td dir="rtl" style="padding:24px 24px 12px;${cell}">
        <p style="margin:0 0 20px;font-size:15px;font-weight:800;color:${COLOR.brand};">پروازیاب</p>
        <h1 style="margin:0 0 12px;font-size:20px;line-height:1.6;font-weight:700;">${escapeHtml(heading)}</h1>
        ${paragraphs.map((p) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.9;">${escapeHtml(p)}</p>`).join("\n        ")}
        ${button}
      </td></tr>
      <tr><td dir="rtl" style="padding:14px 24px 20px;border-top:1px solid ${COLOR.rule};${cell}font-size:13px;line-height:1.8;color:${COLOR.muted};">${escapeHtml(footnote)}${
        secondary
          ? `<br><a href="${escapeHtml(secondary.url)}" style="color:${COLOR.muted};">${escapeHtml(secondary.label)}</a>`
          : ""
      }</td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

function compose(subject: string, layout: Layout): MailContent {
  return { subject, text: renderText(layout), html: renderHtml(subject, layout) };
}

const greeting = (name: string) => `${name.trim() || "کاربر"} عزیز،`;

export function verifyEmailMail(name: string, token: string): MailContent {
  return compose("تأیید نشانی ایمیل در پروازیاب", {
    preheader: "یک قدم تا فعال شدن هشدارهای قیمت.",
    heading: "نشانی ایمیل خود را تأیید کنید",
    paragraphs: [
      greeting(name),
      "برای تکمیل ثبت‌نام و دریافت هشدارهای کاهش قیمت، نشانی ایمیل خود را با دکمهٔ زیر تأیید کنید.",
    ],
    action: { label: "تأیید ایمیل", url: appLink("/auth/verify-email", { token }) },
    footnote: "این پیوند تا ۳ روز معتبر است. اگر در پروازیاب ثبت‌نام نکرده‌اید، این ایمیل را نادیده بگیرید.",
  });
}

export function passwordResetMail(name: string, email: string, token: string): MailContent {
  return compose("بازیابی رمز عبور پروازیاب", {
    preheader: "پیوند تعیین رمز عبور تازه، معتبر تا ۳۰ دقیقه.",
    heading: "بازیابی رمز عبور",
    paragraphs: [greeting(name), `درخواستی برای تعیین رمز عبور تازهٔ حساب ${email} دریافت کردیم.`],
    action: { label: "تعیین رمز عبور تازه", url: appLink("/auth/reset", { token }) },
    footnote:
      "این پیوند تا ۳۰ دقیقه و فقط یک بار کار می‌کند. اگر این درخواست را شما نفرستاده‌اید، کاری لازم نیست؛ رمز عبور فعلی تغییری نمی‌کند.",
  });
}

export function passwordChangedMail(name: string, email: string, at: Date): MailContent {
  return compose("رمز عبور حساب پروازیاب شما تغییر کرد", {
    preheader: "اگر این تغییر کار شما نبوده، همین حالا رمز عبور را بازیابی کنید.",
    heading: "رمز عبور شما تغییر کرد",
    paragraphs: [
      greeting(name),
      `رمز عبور حساب ${email} در ${formatTehranDateTime(at)} تغییر کرد و همهٔ نشست‌های دیگر بسته شدند.`,
      "اگر این تغییر کار شما نبوده است، همین حالا رمز عبور را بازیابی کنید.",
    ],
    action: { label: "بازیابی رمز عبور", url: appLink("/auth/forgot") },
    footnote: "این پیام برای امنیت حساب شما فرستاده شده و نیازی به پاسخ ندارد.",
  });
}

/** An in-app notification, mirrored by email. */
export function notificationMail(
  name: string,
  message: { title: string; body: string; link: string | null },
  unsubscribeUrl?: string,
): MailContent {
  return compose(message.title, {
    preheader: message.body,
    heading: message.title,
    paragraphs: [greeting(name), message.body],
    action: message.link ? { label: "دیدن پروازها", url: appLink(message.link) } : undefined,
    footnote:
      "این پیام را چون در پروازیاب هشدار قیمت ساخته‌اید دریافت می‌کنید. هشدارها را در داشبورد، بخش «هشدارهای قیمت» مدیریت کنید.",
    secondary: unsubscribeUrl ? { label: "دیگر برای این هشدار ایمیل نفرست", url: unsubscribeUrl } : undefined,
  });
}
