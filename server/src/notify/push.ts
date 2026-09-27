import webpush from "web-push";
import { config } from "../config/env";

export interface PushMessage {
  title: string;
  body: string;
  /** In-app path the notification opens. */
  link: string | null;
  /** Notifications with the same tag replace each other on the device. */
  tag?: string;
}

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export type PushOutcome = "sent" | "gone" | "failed";

/** Everything "sent" with PUSH_TRANSPORT=memory (tests only). */
export const pushOutbox: { endpoint: string; message: PushMessage }[] = [];
/** Tests: sends to these endpoints fail with the given HTTP status. */
export const pushFailures = new Map<string, number>();

export const pushEnabled = () => config.PUSH_TRANSPORT !== "off";

/** The key browsers subscribe with; null when push is off. */
export const vapidPublicKey = () => (pushEnabled() ? (config.VAPID_PUBLIC_KEY ?? null) : null);

/**
 * The push services of the major browsers. A subscription's endpoint is a URL
 * the server will POST to, so accepting any URL would let a user make the
 * server call internal addresses (SSRF).
 */
const PUSH_SERVICES = [
  /^fcm\.googleapis\.com$/,
  /^android\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /(^|\.)push\.apple\.com$/,
  /\.notify\.windows\.com$/,
];

export function isAllowedPushEndpoint(endpoint: string): boolean {
  if (!URL.canParse(endpoint)) return false;
  const url = new URL(endpoint);
  return (
    url.protocol === "https:" && !url.port && !url.username && PUSH_SERVICES.some((host) => host.test(url.hostname))
  );
}

const gone = (status: number | undefined) => status === 404 || status === 410;

export async function sendPush(target: PushTarget, message: PushMessage): Promise<PushOutcome> {
  switch (config.PUSH_TRANSPORT) {
    case "memory": {
      const status = pushFailures.get(target.endpoint);
      if (status) return gone(status) ? "gone" : "failed";
      pushOutbox.push({ endpoint: target.endpoint, message });
      return "sent";
    }
    case "webpush":
      try {
        await webpush.sendNotification(
          { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
          JSON.stringify(message),
          {
            TTL: 24 * 60 * 60,
            urgency: "normal",
            timeout: 10_000,
            vapidDetails: {
              subject: config.VAPID_SUBJECT,
              publicKey: config.VAPID_PUBLIC_KEY ?? "",
              privateKey: config.VAPID_PRIVATE_KEY ?? "",
            },
          },
        );
        return "sent";
      } catch (err) {
        return gone((err as { statusCode?: number }).statusCode) ? "gone" : "failed";
      }
    default:
      return "failed";
  }
}
