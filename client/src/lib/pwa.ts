/**
 * Installable-app plumbing: the service worker (production builds only; in
 * development it would fight Vite's hot reload) and Chrome's install prompt,
 * which fires once and has to be kept until the user asks to install.
 */

/** Chrome's `beforeinstallprompt` event, not in the DOM typings. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

export function subscribeInstallPrompt(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const canInstall = () => deferredPrompt !== null;

/** Shows the browser's install dialog; resolves to whether the user accepted. */
export async function promptInstall(): Promise<boolean> {
  const event = deferredPrompt;
  if (!event) return false;
  // The event can only be used once.
  deferredPrompt = null;
  emit();
  await event.prompt();
  return (await event.userChoice).outcome === "accepted";
}

export function initPwa(): void {
  window.addEventListener("beforeinstallprompt", (event) => {
    // Keep the browser's mini-infobar quiet; the app offers installing where it fits.
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    emit();
  });
  if (import.meta.env.PROD && "serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    });
  }
}
