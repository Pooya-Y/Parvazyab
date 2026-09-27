import { describe, expect, it } from "vitest";
import { tokenFromHash } from "./auth-links";

describe("tokenFromHash", () => {
  const token = "Zq3v_Ow-8mT2c5xYk1pL0aQeRnB7sHdJ4uGfWiE9tVc";

  it("reads the token from the fragment, with or without the #", () => {
    expect(tokenFromHash(`#token=${token}`)).toBe(token);
    expect(tokenFromHash(`token=${token}`)).toBe(token);
    expect(tokenFromHash(`#utm=mail&token=${token}`)).toBe(token);
  });

  it("rejects missing or malformed tokens", () => {
    expect(tokenFromHash("")).toBeNull();
    expect(tokenFromHash("#token=")).toBeNull();
    expect(tokenFromHash("#token=short")).toBeNull();
    expect(tokenFromHash(`#token=${token}<script>`)).toBeNull();
    expect(tokenFromHash(`#token=${"a".repeat(200)}`)).toBeNull();
  });
});
