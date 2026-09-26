import { describe, expect, it } from "vitest";
import { base64UrlToBytes } from "./push";

describe("base64UrlToBytes", () => {
  it("decodes URL-safe base64 without padding", () => {
    // "-_" in base64url is "+/" in base64: bytes 0xfb 0xff.
    expect([...base64UrlToBytes("-_8")]).toEqual([0xfb, 0xff]);
    expect(new TextDecoder().decode(base64UrlToBytes("aGVsbG8"))).toBe("hello");
  });

  it("yields the 65-byte uncompressed key a VAPID public key encodes", () => {
    const key = "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM";
    const bytes = base64UrlToBytes(key);
    expect(bytes.length).toBe(65);
    expect(bytes[0]).toBe(0x04);
  });
});
