import { describe, expect, it } from "vitest";
import { mergePages } from "./use-paged-search";
import type { Flight } from "./types";

const flight = (id: string) => ({ id }) as Flight;
const ids = (list: Flight[]) => list.map((f) => f.id);

describe("mergePages", () => {
  it("appends later pages in order", () => {
    expect(ids(mergePages([flight("a"), flight("b")], [flight("c"), flight("d")]))).toEqual(["a", "b", "c", "d"]);
  });

  it("doesn't show a flight twice when results shifted between pages", () => {
    const merged = mergePages([flight("a"), flight("b")], [flight("b"), flight("c"), flight("c"), flight("d")]);
    expect(ids(merged)).toEqual(["a", "b", "c", "d"]);
  });
});
