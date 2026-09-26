import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyFilters,
  restrictOffers,
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
    fareType: "scheduled",
    priceToman: 2_000_000,
    bookingUrl: "https://example.com",
    isActive: true,
    agencyName: "آژانس الف",
    ...overrides,
  };
}

test("groups offers for the same flight and keeps the cheapest first", () => {
  const cards = groupOffersByFlight([
    listing({ priceToman: 2_700_000, agencyName: "گران", accountId: "agency-expensive" }),
    listing({ priceToman: 2_450_000, agencyName: "ارزان", accountId: "agency-cheap" }),
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

test("agency count is distinct agencies, not offers", () => {
  const [card] = groupOffersByFlight([
    listing({ accountId: "a1", priceToman: 2_000_000 }),
    listing({ accountId: "a1", priceToman: 5_000_000, cabin: "business" }),
    listing({ accountId: "a2", priceToman: 2_100_000 }),
  ]);
  assert.equal(card.offers.length, 3);
  assert.equal(card.agencyCount, 2);
  assert.ok(card.offers.every((o) => o.listingId && o.agencyId));
});

test("restrictOffers narrows offers and recomputes the price summary", () => {
  const [card] = groupOffersByFlight([
    listing({ accountId: "a1", priceToman: 2_000_000 }),
    listing({ accountId: "a1", priceToman: 5_200_000, cabin: "business" }),
    listing({ accountId: "a2", priceToman: 4_900_000, cabin: "business" }),
  ]);
  assert.equal(card.cabin, "economy");
  const business = restrictOffers(card, (o) => o.cabin === "business");
  assert.ok(business);
  assert.equal(business.id, card.id, "identity is unchanged");
  assert.equal(business.cabin, "business");
  assert.equal(business.bestPriceToman, 4_900_000);
  assert.deepEqual(business.priceRange, { min: 4_900_000, max: 5_200_000 });
  assert.equal(business.agencyCount, 2);
  assert.equal(restrictOffers(card, () => false), null);
  assert.equal(restrictOffers(card, () => true), card);
});

test("cabin filter works per offer and feeds the price filter", () => {
  const cards = groupOffersByFlight([
    listing({ flightNo: "MIXED", priceToman: 2_000_000 }),
    listing({ flightNo: "MIXED", priceToman: 6_000_000, cabin: "business", accountId: "a2" }),
    listing({ flightNo: "ECON", priceToman: 1_500_000 }),
  ]);
  const business = applyFilters(cards, { cabin: "business" });
  assert.deepEqual(
    business.map((c) => [c.flightNo, c.bestPriceToman]),
    [["MIXED", 6_000_000]],
  );
  // Without the cabin filter the mixed flight is priced by its economy offer.
  assert.deepEqual(
    applyFilters(cards, { maxPriceToman: 2_000_000 }).map((c) => c.flightNo),
    ["MIXED", "ECON"],
  );
  assert.equal(applyFilters(cards, { cabin: "business", maxPriceToman: 5_000_000 }).length, 0);
});

test("arrival window filters on Tehran arrival time", () => {
  const cards = groupOffersByFlight([
    listing({ flightNo: "LATE-ARR", departAt: tehran(21), durationMin: 180 }), // lands 00:00
    listing({ flightNo: "DAY-ARR", departAt: tehran(9), durationMin: 90 }), // lands 10:30
  ]);
  assert.deepEqual(
    applyFilters(cards, { arriveWindow: { fromHour: 0, toHour: 5 } }).map((c) => c.flightNo),
    ["LATE-ARR"],
  );
  assert.deepEqual(
    applyFilters(cards, { arriveWindow: { fromHour: 6, toHour: 11 } }).map((c) => c.flightNo),
    ["DAY-ARR"],
  );
});

test("fare type filter keeps only charter or scheduled offers", () => {
  const cards = groupOffersByFlight([
    listing({ flightNo: "BOTH", priceToman: 1_800_000, fareType: "charter", accountId: "a1" }),
    listing({ flightNo: "BOTH", priceToman: 2_300_000, accountId: "a2" }),
    listing({ flightNo: "SCHED", priceToman: 2_000_000 }),
  ]);
  const scheduled = applyFilters(cards, { fareType: "scheduled" });
  assert.deepEqual(
    scheduled.map((c) => [c.flightNo, c.bestPriceToman]),
    [
      ["BOTH", 2_300_000],
      ["SCHED", 2_000_000],
    ],
  );
  const charter = applyFilters(cards, { fareType: "charter", cabin: "economy" });
  assert.deepEqual(
    charter.map((c) => [c.flightNo, c.offers.map((o) => o.fareType)]),
    [["BOTH", ["charter"]]],
  );
});
