import { config } from "../config/env";
import { nationalMobile } from "../domain/phone";

export interface OtpSms {
  /** E.164 */
  to: string;
  code: string;
  text: string;
}

/** Everything "sent" with SMS_TRANSPORT=memory, which only tests may use. */
export const smsOutbox: OtpSms[] = [];

/**
 * The SMS text. The last line is the WebOTP format (`@host #code`), which lets
 * Chrome on Android offer the code to the page that asked for it, and only to
 * that origin.
 */
export function otpText(code: string): string {
  const host = new URL(config.APP_URL).hostname;
  return `کد ورود به پروازیاب: ${code}\nاین کد را به هیچ‌کس ندهید.\n\n@${host} #${code}`;
}

const KAVENEGAR_TIMEOUT_MS = 10_000;

/** Kavenegar's verify/lookup API sends a pre-approved template, filling %token with the code. */
async function sendViaKavenegar(sms: OtpSms): Promise<void> {
  const url = new URL(
    `https://api.kavenegar.com/v1/${encodeURIComponent(config.KAVENEGAR_API_KEY ?? "")}/verify/lookup.json`,
  );
  const form = new URLSearchParams({
    receptor: nationalMobile(sms.to),
    token: sms.code,
    template: config.KAVENEGAR_TEMPLATE,
  });
  const res = await fetch(url, { method: "POST", body: form, signal: AbortSignal.timeout(KAVENEGAR_TIMEOUT_MS) });
  const body = (await res.json().catch(() => null)) as { return?: { status?: number; message?: string } } | null;
  if (!res.ok || body?.return?.status !== 200) {
    // The URL embeds the API key; never let it reach the log.
    throw new Error(`Kavenegar rejected the SMS: HTTP ${res.status}, status ${body?.return?.status ?? "?"}`);
  }
}

export async function sendOtpSms(sms: OtpSms): Promise<void> {
  switch (config.SMS_TRANSPORT) {
    case "memory":
      smsOutbox.push(sms);
      return;
    case "console":
      // A code is a credential: print it only outside production.
      if (config.NODE_ENV === "production") {
        console.info(`SMS not sent (SMS_TRANSPORT=console): sign-in code for ${nationalMobile(sms.to)}`);
      } else {
        console.info(`\n── SMS to ${nationalMobile(sms.to)}\n${sms.text}\n──`);
      }
      return;
    case "kavenegar":
      await sendViaKavenegar(sms);
      return;
  }
}
