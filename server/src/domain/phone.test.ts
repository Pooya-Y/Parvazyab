import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { nationalMobile, normalizeIranMobile } from "./phone";

describe("normalizeIranMobile", () => {
  test("accepts the usual ways of writing a mobile number", () => {
    for (const input of [
      "09121234567",
      "9121234567",
      "+989121234567",
      "989121234567",
      "00989121234567",
      "0912 123 4567",
      "0912-123-4567",
      "(0912) 123 4567",
      "۰۹۱۲۱۲۳۴۵۶۷",
      "٠٩١٢١٢٣٤٥٦٧",
      " +98 912 123 4567 ",
    ]) {
      assert.equal(normalizeIranMobile(input), "+989121234567", input);
    }
  });

  test("rejects landlines, short numbers and other countries", () => {
    for (const input of ["02112345678", "0912123456", "091212345678", "+447911123456", "abc", "", "+98 21 1234 5678"]) {
      assert.equal(normalizeIranMobile(input), null, input);
    }
  });

  test("formats for SMS gateways", () => {
    assert.equal(nationalMobile("+989121234567"), "09121234567");
  });
});
