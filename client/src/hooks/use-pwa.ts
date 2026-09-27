import { useSyncExternalStore } from "react";
import { canInstall, promptInstall, subscribeInstallPrompt } from "@/lib/pwa";

/** Whether the browser offered to install the app, and a way to accept. */
export function useInstallPrompt() {
  const available = useSyncExternalStore(subscribeInstallPrompt, canInstall, () => false);
  return { canInstall: available, install: promptInstall };
}

function subscribeOnline(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

/** The browser's idea of connectivity: good enough to tell someone why nothing loads. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}
