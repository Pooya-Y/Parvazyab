import { describe, expect, it } from "vitest";
import { airportDistinctName } from "@/domain/airports";
import {
  CLEARED_FILTERS,
  activeFilterCount,
  activeLeg,
  isRoundTrip,
  legFilters,
  legPatch,
  parseSearchState,
  toApiParams,
  toSearchParams,
} from "./search-state";

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

  it("round-trips cabin and arrival window", () => {
    const { state } = parse("from=IKA&to=IST&cabin=business&arrive=evening&time=early");
    expect(state).toMatchObject({ cabin: "business", arrive: "evening", time: "early" });
    expect(parseSearchState(toSearchParams(state)).state).toEqual(state);
    expect(toApiParams(state)).toMatchObject({
      cabin: "business",
      departFromHour: 0,
      departToHour: 5,
      arriveFromHour: 18,
      arriveToHour: 23,
    });
    expect(activeFilterCount(state)).toBe(3);
    expect(parse("from=IKA&to=IST&cabin=first&arrive=noon").state).toMatchObject({ cabin: undefined, arrive: undefined });
  });

  it("CLEARED_FILTERS resets every filter when merged into URL state", () => {
    const { state } = parse(
      "from=THR&to=MHD&sort=cheapest&stops=0&airlines=a,b&maxPrice=9&cabin=economy&time=morning&arrive=early",
    );
    const cleared = { ...state, ...CLEARED_FILTERS };
    expect(activeFilterCount(cleared)).toBe(0);
    expect(toSearchParams(cleared).toString()).toBe("from=THR&to=MHD&sort=cheapest");
  });

  it("round-trips the fare type as `fare`", () => {
    const { state } = parse("from=THR&to=MHD&fare=charter");
    expect(state.fareType).toBe("charter");
    expect(toSearchParams(state).get("fare")).toBe("charter");
    expect(toApiParams(state).fareType).toBe("charter");
    expect(parse("from=THR&to=MHD&fare=vip").state.fareType).toBeUndefined();
  });
});

describe("round trips", () => {
  const rt = "from=THR&to=MHD&date=2030-01-02&ret=2030-01-06";

  it("needs a valid return date on or after the outbound date", () => {
    expect(isRoundTrip(parse(rt).state)).toBe(true);
    expect(isRoundTrip(parse("from=THR&to=MHD&ret=2030-01-06").state)).toBe(false);
    expect(isRoundTrip(parse("from=THR&to=MHD&date=2030-01-06&ret=2030-01-02").state)).toBe(false);
    expect(isRoundTrip(parse("from=THR&to=MHD&date=2030-01-06&ret=2030-02-30").state)).toBe(false);
    expect(isRoundTrip(parse("from=THR&to=MHD&date=2030-01-06&ret=2030-01-06").state)).toBe(true);
  });

  it("ignores round-trip params on one-way searches", () => {
    const { state } = parse("from=THR&to=MHD&date=2030-01-02&ob=x&rb=y&leg=ret&rtime=early");
    for (const key of ["ret", "outboundId", "returnId", "leg", "returnTime"] as const) expect(state[key]).toBeUndefined();
    expect(toSearchParams(state).toString()).toBe("from=THR&to=MHD&date=2030-01-02");
  });

  it("derives the active leg from the selections", () => {
    expect(activeLeg(parse(rt).state)).toBe("out");
    expect(activeLeg(parse(`${rt}&ob=W5`).state)).toBe("ret");
    expect(activeLeg(parse(`${rt}&ob=W5&leg=out`).state)).toBe("out");
    expect(activeLeg(parse("from=THR&to=MHD&leg=ret").state)).toBe("out");
  });

  it("the return leg searches the route backwards on the return date", () => {
    const { state } = parse(`${rt}&time=early&rtime=evening&cabin=business`);
    expect(toApiParams(state, "out")).toMatchObject({
      originCode: "THR",
      destinationCode: "MHD",
      date: "2030-01-02",
      departFromHour: 0,
      cabin: "business",
    });
    expect(toApiParams(state, "ret")).toMatchObject({
      originCode: "MHD",
      destinationCode: "THR",
      date: "2030-01-06",
      departFromHour: 18,
      cabin: "business",
    });
    expect(legFilters(state, "ret").time).toBe("evening");
  });

  it("maps time-window changes onto the leg being edited", () => {
    expect(legPatch("out", { time: "morning" })).toEqual({ time: "morning" });
    expect(legPatch("ret", { time: "morning", cabin: "economy" })).toEqual({ returnTime: "morning", cabin: "economy" });
    const cleared = legPatch("ret", CLEARED_FILTERS);
    expect(cleared).toMatchObject({ returnTime: undefined, returnArrive: undefined, airlines: [] });
    expect("time" in cleared).toBe(false);
  });

  it("round-trips every round-trip param", () => {
    const { state } = parse(`${rt}&ob=A__1__2&rb=B__3__4&leg=out&rtime=early&rarrive=evening`);
    expect(parseSearchState(toSearchParams(state)).state).toEqual(state);
    expect(activeFilterCount(legFilters(state, "ret"))).toBe(2);
    expect(activeFilterCount(legFilters(state, "out"))).toBe(0);
  });
});

describe("airport names", () => {
  it("disambiguates airports that share a city", () => {
    expect(airportDistinctName("THR")).toBe("مهرآباد");
    expect(airportDistinctName("IKA")).toBe("امام خمینی");
    expect(airportDistinctName("MHD")).toBe("مشهد");
  });
});
