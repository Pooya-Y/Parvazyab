export interface ShareData {
  title: string;
  text: string;
  url: string;
}

export type ShareOutcome = "shared" | "copied" | "cancelled" | "failed";

interface ShareEnv {
  share?: (data: ShareData) => Promise<void>;
  canShare?: (data: ShareData) => boolean;
  writeClipboard?: (text: string) => Promise<void>;
  /** Last-resort copy through a hidden textarea (older browsers, blocked clipboard API). */
  legacyCopy?: (text: string) => boolean;
}

function legacyCopy(text: string): boolean {
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    area.remove();
  }
}

function browserEnv(): ShareEnv {
  return {
    share: typeof navigator.share === "function" ? (d) => navigator.share(d) : undefined,
    canShare: typeof navigator.canShare === "function" ? (d) => navigator.canShare(d) : undefined,
    writeClipboard: navigator.clipboard ? (t) => navigator.clipboard.writeText(t) : undefined,
    legacyCopy,
  };
}

/**
 * The system share sheet where there is one (phones), otherwise copy the link.
 * A user dismissing the share sheet is "cancelled", not an error.
 */
export async function shareLink(data: ShareData, env: ShareEnv = browserEnv()): Promise<ShareOutcome> {
  if (env.share && (!env.canShare || env.canShare(data))) {
    try {
      await env.share(data);
      return "shared";
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return "cancelled";
      // Some browsers expose share() but refuse it (e.g. no user activation): fall back to copying.
    }
  }
  if (env.writeClipboard) {
    try {
      await env.writeClipboard(data.url);
      return "copied";
    } catch {
      // Permission denied or insecure context: try the legacy path.
    }
  }
  return env.legacyCopy?.(data.url) ? "copied" : "failed";
}
