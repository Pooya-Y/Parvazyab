import { describe, expect, it } from "vitest";
import { MAX_RECENT, parseStored, withSearch, withoutSearch, type RecentSearch } from "./recent-searches";

const s = (from: string, to: string, extra: Partial<RecentSearch> = {}): RecentSearch => ({
  from,
  to,
  at: 1,
  ...extra,
});

describe("recent searches", () => {
  it("puts the latest first and de-duplicates by route and dates", () => {
    let list: RecentSearch[] = [];
    list = withSearch(list, s("THR", "MHD", { at: 1 }));
    list = withSearch(list, s("THR", "KIH", { at: 2 }));
    list = withSearch(list, s("THR", "MHD", { at: 3 }));
    expect(list.map((e) => `${e.to}@${e.at}`)).toEqual(["MHD@3", "KIH@2"]);
    // A different date is a different search.
    list = withSearch(list, s("THR", "MHD", { date: "2030-01-02", at: 4 }));
    expect(list).toHaveLength(3);
  });

  it(`keeps at most ${MAX_RECENT}`, () => {
    const codes = ["MHD", "KIH", "SYZ", "IFN", "TBZ", "AWZ", "BND", "KER"];
    const list = codes.reduce<RecentSearch[]>((acc, to, i) => withSearch(acc, s("THR", to, { at: i })), []);
    expect(list).toHaveLength(MAX_RECENT);
    expect(list[0].to).toBe("KER");
  });

  it("removes one entry", () => {
    const list = [s("THR", "MHD"), s("THR", "KIH")];
    expect(withoutSearch(list, s("THR", "MHD")).map((e) => e.to)).toEqual(["KIH"]);
  });

  it("drops anything invalid read back from storage", () => {
    expect(parseStored(null)).toEqual([]);
    expect(parseStored("not json")).toEqual([]);
    expect(parseStored('{"a":1}')).toEqual([]);
    const raw = JSON.stringify([
      { from: "THR", to: "MHD", at: 1, date: "2030-02-31", ret: "x" },
      { from: "THR", to: "THR", at: 2 },
      { from: "ZZZ", to: "MHD", at: 3 },
      { from: "THR", to: "KIH" },
      "junk",
    ]);
    expect(parseStored(raw)).toEqual([{ from: "THR", to: "MHD", at: 1, date: undefined, ret: undefined }]);
  });
});
