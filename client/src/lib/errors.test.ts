import { describe, expect, it } from "vitest";
import { ApiError, safeExternalUrl } from "./api";
import { errorMessage } from "./errors";

describe("errorMessage", () => {
  it("maps known server codes to Persian", () => {
    expect(errorMessage(new ApiError(401, "INVALID_AUTHENTICATION"))).toBe("ایمیل یا رمز عبور اشتباه است.");
    expect(errorMessage(new ApiError(0, "NETWORK_ERROR"))).toContain("ارتباط با سرور");
  });

  it("prefers specific validation detail codes", () => {
    const err = new ApiError(400, "INVALID_REQUEST", ["bookingUrl: INVALID_BOOKING_URL"]);
    expect(errorMessage(err)).toContain("https://");
  });

  it("never shows raw technical text", () => {
    expect(errorMessage(new ApiError(502, "HTTP_502"))).toBe("مشکلی در سرور پیش آمد. کمی بعد دوباره تلاش کنید.");
    expect(errorMessage(new TypeError("Cannot read properties of undefined"), "fallback")).toBe("fallback");
  });
});

describe("safeExternalUrl", () => {
  it("allows only http(s)", () => {
    expect(safeExternalUrl("https://agency.example/book")).toBe("https://agency.example/book");
    expect(safeExternalUrl("javascript:alert(1)")).toBeUndefined();
    expect(safeExternalUrl("data:text/html,x")).toBeUndefined();
    expect(safeExternalUrl("not a url")).toBeUndefined();
  });
});
