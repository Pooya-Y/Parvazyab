import { describe, expect, it } from "vitest";
import { columnLabel, describeRowError } from "./import-errors";

describe("describeRowError", () => {
  it("names the column in Persian and explains the problem", () => {
    expect(describeRowError("depart: INVALID_DATETIME")).toMatch(/^زمان حرکت: تاریخ و ساعت را/);
    expect(describeRowError("flight_no: DUPLICATE_ROW")).toBe(
      "شماره پرواز: همین پرواز در ردیف دیگری از فایل هم آمده است.",
    );
  });

  it("keeps unknown fields and codes readable rather than dropping them", () => {
    expect(describeRowError("priceToman: OUT_OF_RANGE")).toBe("priceToman: خارج از محدودهٔ مجاز است.");
    expect(describeRowError("SOMETHING_NEW")).toBe("SOMETHING_NEW");
  });

  it("labels columns", () => {
    expect(columnLabel("booking_url")).toBe("لینک خرید");
    expect(columnLabel("extra")).toBe("extra");
  });
});
