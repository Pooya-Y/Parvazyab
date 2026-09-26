import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyFilters,
  buildFlightIdentityKey,
  groupOffersByFlight,
  rankFlights,
  sortFlights,
  type Listing,
} from "./flightsCore";
import { TEHRAN_OFFSET_MS } from "../domain/time";

/** Epoch ms for a Tehran wall-clock time on a fixed day. */
const tehran = (hour: number, minute = 0) => Date.UTC(2030, 0, 10, hour, minute) - TEHRAN_OFFSET_MS;

let seq = 0;
function listing(overrides: Partial<Listing>): Listing {
  const departAt = overrides.departAt ?? tehran(8);
  const durationMin = overrides.durationMin ?? 90;
  return {
    id: `l${++seq}`,
    accountId: "a1",
    originCode: "THR",
    originCity: "تهران",
    destinationCode: "MHD",
    destinationCity: "مشهد",
    airline: "ماهان ایر",
    flightNo: "W5-101",
    departAt,
    arriveAt: departAt + durationMin * 60_000,
    durationMin,
    stops: 0,
    cabin: "economy",
    priceToman: 2_000_000,
    bookingUrl: "https://example.com",
    isActive: true,
    agencyName: "آژانس الف",
    ...overrides,
  };
}

test("groups offers for the same flight and keeps the cheapest first", () => {
  const cards = groupOffersByFlight([
    listing({ priceToman: 2_700_000, agencyName: "گران" }),
    listing({ priceToman: 2_450_000, agencyName: "ارزان" }),
    listing({ flightNo: "IR-112", priceToman: 3_000_000 }),
  ]);
  assert.equal(cards.length, 2);
  const w5 = cards.find((c) => c.flightNo === "W5-101")!;
  assert.equal(w5.agencyCount, 2);
  assert.equal(w5.bestPriceToman, 2_450_000);
  assert.deepEqual(w5.priceRange, { min: 2_450_000, max: 2_700_000 });
  assert.equal(w5.offers[0].agencyName, "ارزان");
});

test("identity key distinguishes departure minute", () => {
  const a = listing({ departAt: tehran(8, 0) });
  const b = listing({ departAt: tehran(8, 1) });
  assert.notEqual(buildFlightIdentityKey(a), buildFlightIdentityKey(b));
});

test("hour-window filters use Tehran time regardless of server timezone", () => {
  const cards = groupOffersByFlight([
    listing({ flightNo: "EARLY", departAt: tehran(5, 30) }),
    listing({ flightNo: "NOON", departAt: tehran(12, 0) }),
    listing({ flightNo: "LATE", departAt: tehran(23, 15) }),
  ]);
  const morning = applyFilters(cards, { departWindow: { fromHour: 5, toHour: 11 } });
  assert.deepEqual(
    morning.map((c) => c.flightNo),
    ["EARLY"],
  );
  const overnight = applyFilters(cards, { departWindow: { fromHour: 22, toHour: 5 } });
  assert.deepEqual(overnight.map((c) => c.flightNo).sort(), ["EARLY", "LATE"]);
});

test("stop, price and airline filters", () => {
  const cards = groupOffersByFlight([
    listing({ flightNo: "A", stops: 0, priceToman: 1_000_000 }),
    listing({ flightNo: "B", stops: 1, priceToman: 900_000, airline: "زاگرس" }),
    listing({ flightNo: "C", stops: 2, priceToman: 3_000_000 }),
  ]);
  assert.deepEqual(
    applyFilters(cards, { directOnly: true }).map((c) => c.flightNo),
    ["A"],
  );
  assert.deepEqual(
    applyFilters(cards, { maxStops: 1 }).map((c) => c.flightNo),
    ["A", "B"],
  );
  assert.deepEqual(
    applyFilters(cards, { maxPriceToman: 1_000_000 }).map((c) => c.flightNo),
    ["A", "B"],
  );
  assert.deepEqual(
    applyFilters(cards, { airlines: ["زاگرس"] }).map((c) => c.flightNo),
    ["B"],
  );
  assert.equal(applyFilters(cards, { airlines: [] }).length, 3);
});

test("ranking attaches badges relative to the result set and sorts best-first", () => {
  const cards = groupOffersByFlight([
    listing({ flightNo: "CHEAP_SLOW", stops: 1, durationMin: 480, priceToman: 1_000_000, airline: "زاگرس" }),
    listing({ flightNo: "BALANCED", durationMin: 90, priceToman: 1_200_000 }),
    listing({ flightNo: "PRICEY", durationMin: 95, priceToman: 5_000_000 }),
  ]);
  const ranked = rankFlights(cards);
  assert.equal(ranked[0].flightNo, "BALANCED");
  const cheap = ranked.find((c) => c.flightNo === "CHEAP_SLOW")!;
  assert.ok(cheap.badges!.includes("ارزان‌ترین"));
  assert.ok(!cheap.badges!.includes("مستقیم"));
  const balanced = ranked.find((c) => c.flightNo === "BALANCED")!;
  assert.ok(balanced.badges!.includes("سریع‌ترین"));
  for (const c of ranked) assert.ok(c.score! >= 0 && c.score! <= 1);
  // Scores are non-increasing.
  for (let i = 1; i < ranked.length; i++) assert.ok(ranked[i - 1].score! >= ranked[i].score!);
});

test("price-weighted ranking mode prefers the cheapest flight", () => {
  const cards = groupOffersByFlight([
    listing({ flightNo: "CHEAP", durationMin: 200, priceToman: 1_000_000 }),
    listing({ flightNo: "FAST", durationMin: 60, priceToman: 1_600_000 }),
  ]);
  assert.equal(rankFlights(cards, "price")[0].flightNo, "CHEAP");
  assert.equal(rankFlights(cards, "fastest")[0].flightNo, "FAST");
});

test("sortFlights orders by the requested key", () => {
  const ranked = rankFlights(
    groupOffersByFlight([
      listing({ flightNo: "A", departAt: tehran(14), durationMin: 60, priceToman: 3_000_000 }),
      listing({ flightNo: "B", departAt: tehran(6), durationMin: 120, priceToman: 1_000_000 }),
      listing({ flightNo: "C", departAt: tehran(10), durationMin: 90, priceToman: 2_000_000 }),
    ]),
  );
  const order = (sort: Parameters<typeof sortFlights>[1]) => sortFlights(ranked, sort).map((f) => f.flightNo);
  assert.deepEqual(order("cheapest"), ["B", "C", "A"]);
  assert.deepEqual(order("fastest"), ["A", "C", "B"]);
  assert.deepEqual(order("departure"), ["B", "C", "A"]);
  assert.deepEqual(
    order("best"),
    ranked.map((f) => f.flightNo),
  );
});

test("ranking an empty set is a no-op", () => {
  assert.deepEqual(rankFlights([]), []);
});
