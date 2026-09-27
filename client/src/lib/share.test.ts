import { describe, expect, it, vi } from "vitest";
import { shareLink } from "./share";

const data = { title: "t", text: "x", url: "https://parvazyab.example/search?from=THR&to=MHD" };
const abort = () => Object.assign(new Error("dismissed"), { name: "AbortError" });

describe("shareLink", () => {
  it("uses the share sheet when available", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    expect(await shareLink(data, { share })).toBe("shared");
    expect(share).toHaveBeenCalledWith(data);
  });

  it("treats a dismissed share sheet as cancelled, without copying", async () => {
    const writeClipboard = vi.fn();
    expect(await shareLink(data, { share: () => Promise.reject(abort()), writeClipboard })).toBe("cancelled");
    expect(writeClipboard).not.toHaveBeenCalled();
  });

  it("copies the link when sharing is unavailable or refused", async () => {
    const writeClipboard = vi.fn().mockResolvedValue(undefined);
    expect(await shareLink(data, { writeClipboard })).toBe("copied");
    expect(writeClipboard).toHaveBeenCalledWith(data.url);
    const refused = { share: () => Promise.reject(new Error("NotAllowed")), writeClipboard };
    expect(await shareLink(data, refused)).toBe("copied");
    expect(await shareLink(data, { share: vi.fn(), canShare: () => false, writeClipboard })).toBe("copied");
  });

  it("falls back to legacy copy, then reports failure", async () => {
    const blocked = () => Promise.reject(new Error("denied"));
    expect(await shareLink(data, { writeClipboard: blocked, legacyCopy: () => true })).toBe("copied");
    expect(await shareLink(data, { writeClipboard: blocked, legacyCopy: () => false })).toBe("failed");
    expect(await shareLink(data, {})).toBe("failed");
  });
});
