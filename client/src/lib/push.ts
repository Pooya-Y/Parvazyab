import { api } from "./api";

/**
 * Browser push for this device. The service worker only exists in production
 * builds, and iOS offers push only to the installed app, so "unsupported" is a
 * normal answer, not an error.
 */
export type PushStatus = "unsupported" | "unavailable" | "blocked" | "off" | "on";

const supported = () =>
  typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!supported()) return null;
  return (await navigator.serviceWorker.getRegistration()) ?? null;
}

/** VAPID keys travel as base64url; the Push API wants the raw bytes. */
export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function pushStatus(): Promise<{ status: PushStatus; publicKey: string | null }> {
  const reg = await registration();
  if (!reg) return { status: "unsupported", publicKey: null };
  const { publicKey } = await api.push.publicKey();
  if (!publicKey) return { status: "unavailable", publicKey: null };
  if (Notification.permission === "denied") return { status: "blocked", publicKey };
  const subscription = await reg.pushManager.getSubscription();
  return { status: subscription ? "on" : "off", publicKey };
}

/** Asks for permission, subscribes this browser and tells the server. */
export async function enablePush(publicKey: string): Promise<PushStatus> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "blocked" : "off";
  const reg = await navigator.serviceWorker.ready;
  const subscription =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(publicKey) }));
  const keys = subscription.toJSON().keys ?? {};
  await api.push.subscribe({
    endpoint: subscription.endpoint,
    keys: { p256dh: keys.p256dh ?? "", auth: keys.auth ?? "" },
  });
  return "on";
}

/**
 * Stops push on this browser: the server forgets it first (while the session
 * still exists), then the browser drops the subscription.
 */
export async function disablePush(): Promise<PushStatus> {
  const reg = await registration();
  const subscription = await reg?.pushManager.getSubscription();
  if (subscription) {
    await api.push.unsubscribe(subscription.endpoint).catch(() => undefined);
    await subscription.unsubscribe();
  }
  return "off";
}
