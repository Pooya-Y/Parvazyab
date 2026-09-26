import { describe, expect, it } from "vitest";
import { activeFilterCount, parseSearchState, toApiParams, toSearchParams } from "./search-state";

const parse = (qs: string) => parseSearchState(new URLSearchParams(qs));

describe("search URL state", () => {
  it("parses a full search and round-trips it", () => {
    const { state, problem } = parse(
      "from=thr&to=MHD&date=2030-01-02&sort=cheapest&stops=0&airlines=ماهان ایر,زاگرس&maxPrice=3000000&time=morning",
    );
    expect(problem).toBeNull();
    expect(state).toEqual({
      from: "THR",
      to: "MHD",
      date: "2030-01-02",
      sort: "cheapest",
      maxStops: 0,
      airlines: ["ماهان ایر", "زاگرس"],
      maxPrice: 3_000_000,
      time: "morning",
    });
    expect(parseSearchState(toSearchParams(state)).state).toEqual(state);
  });

  it("omits defaults when serializing", () => {
    const { state } = parse("from=THR&to=MHD");
    expect(toSearchParams(state).toString()).toBe("from=THR&to=MHD");
  });

  it("drops invalid filter values instead of failing", () => {
    const { state, problem } = parse("from=THR&to=MHD&date=2030-02-31&sort=random&stops=7&maxPrice=-5&time=noon");
    expect(problem).toBeNull();
    expect(state.date).toBeUndefined();
    expect(state.sort).toBe("best");
    expect(state.maxStops).toBeUndefined();
    expect(state.maxPrice).toBeUndefined();
    expect(state.time).toBeUndefined();
  });

  it("reports route problems", () => {
    expect(parse("from=THR").problem).toBe("missing");
    expect(parse("from=THR&to=XXX").problem).toBe("unknown-airport");
    expect(parse("from=THR&to=thr").problem).toBe("same-airport");
  });

  it("maps to API params including the time window", () => {
    const { state } = parse("from=THR&to=MHD&time=evening&stops=1");
    expect(toApiParams(state)).toMatchObject({
      originCode: "THR",
      destinationCode: "MHD",
      maxStops: 1,
      departFromHour: 18,
      departToHour: 23,
      airlines: undefined,
    });
    expect(activeFilterCount(state)).toBe(2);
  });
});
