import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { addDaysToDateKey, tehranTodayKey, tehranWallClock } from "../domain/time";
import type { FlightCard, FlightOffer } from "./flightsCore";
import { buildGuide, GUIDE_DAYS, type RouteSummary } from "./routeGuides";

// Sunday 27 September 2026, 09:30 in Tehran.
const NOW = Date.UTC(2026, 8, 27, 6, 0);
const TODAY = tehranTodayKey(NOW);
const at = (dayOffset: number, hour: number, minute = 0) => tehranWallClock(dayOffset, hour, minute, NOW).getTime();

function card(o: {
  depart: number;
  airline?: string;
  flightNo?: string;
  price?: number;
  stops?: number;
  duration?: number;
  offers?: Partial<FlightOffer>[];
}): FlightCard {
  const offers = (o.offers ?? [{}])
    .map(
      (x, i): FlightOffer => ({
        listingId: `listing-${i}`,
        agencyId: "a1",
        agencyName: "آژانس یک",
        cabin: "economy",
        fareType: "scheduled",
        priceToman: o.price ?? 2_000_000,
        bookingUrl: "https://agency.example/book",
        agencySlug: "agency-one",
        agencyVerified: true,
        agencyRating: null,
        ...x,
      }),
    )
    .sort((a, b) => a.priceToman - b.priceToman);
  const airline = o.airline ?? "ماهان ایر";
  const flightNo = o.flightNo ?? "W5-101";
  const duration = o.duration ?? 90;
  return {
    id: `${airline}__${flightNo}__${o.depart / 60_000}`,
    airline,
    flightNo,
    originCode: "THR",
    originCity: "تهران (مهرآباد)",
    destinationCode: "MHD",
    destinationCity: "مشهد",
    departAt: o.depart,
    arriveAt: o.depart + duration * 60_000,
    durationMin: duration,
    stops: o.stops ?? 0,
    cabin: offers[0].cabin,
    bestPriceToman: offers[0].priceToman,
    priceRange: { min: offers[0].priceToman, max: offers[offers.length - 1].priceToman },
    agencyCount: new Set(offers.map((x) => x.agencyId)).size,
    offers,
  };
}

const guide = (cards: FlightCard[], directory: RouteSummary[] = []) =>
  buildGuide({ originCode: "THR", destinationCode: "MHD", cards, directory, trend: null, now: NOW });

describe("route guides", () => {
  test("group the window by Tehran calendar day and find the cheapest day", () => {
    const g = guide([
      card({ depart: at(0, 6), price: 1_000_000 }), // departed this morning
      card({ depart: at(0, 23, 30), price: 2_000_000 }),
      card({ depart: at(1, 0, 15), price: 1_900_000 }), // still the 27th in UTC
      card({ depart: at(1, 10), price: 2_200_000, flightNo: "W5-103" }),
      card({ depart: at(3, 8), price: 1_900_000 }),
      card({ depart: at(GUIDE_DAYS, 8), price: 900_000 }), // past the window
    ]);

    assert.equal(g.days.length, GUIDE_DAYS);
    assert.equal(g.days[0].date, TODAY);
    assert.deepEqual(g.days.slice(0, 4), [
      { date: TODAY, minPrice: 2_000_000, flights: 1 },
      { date: addDaysToDateKey(TODAY, 1), minPrice: 1_900_000, flights: 2 },
      { date: addDaysToDateKey(TODAY, 2), minPrice: null, flights: 0 },
      { date: addDaysToDateKey(TODAY, 3), minPrice: 1_900_000, flights: 1 },
    ]);
    // A tie goes to the earlier day.
    assert.deepEqual(g.cheapest, { date: addDaysToDateKey(TODAY, 1), price: 1_900_000 });
    assert.equal(g.flights, 4);
  });

  test("summarise airlines, agencies, departure times and duration", () => {
    const g = guide([
      card({
        depart: at(1, 6, 30),
        offers: [
          { agencyId: "a1", priceToman: 2_000_000 },
          { agencyId: "a1", priceToman: 5_000_000, cabin: "business" },
          { agencyId: "a2", agencyName: "آژانس دو", agencySlug: null, priceToman: 2_100_000, fareType: "charter" },
        ],
      }),
      card({
        depart: at(1, 13),
        flightNo: "W5-105",
        duration: 100,
        offers: [{ agencyId: "a2", agencyName: "آژانس دو", agencySlug: null, priceToman: 2_300_000 }],
      }),
      card({
        depart: at(2, 21),
        airline: "زاگرس",
        flightNo: "IZ-404",
        stops: 1,
        duration: 480,
        offers: [{ agencyId: "a3", agencyName: "آژانس سه", priceToman: 1_800_000 }],
      }),
      card({ depart: at(2, 2), airline: "ایران ایر", flightNo: "IR-201", duration: 95, price: 2_500_000 }),
    ]);

    assert.equal(g.directFlights, 3);
    assert.equal(g.charterFlights, 1);
    // Typical duration comes from direct flights when there are any.
    assert.deepEqual(g.duration, { shortest: 90, typical: 95 });
    assert.deepEqual(g.departures, {
      earliest: 2 * 60,
      latest: 21 * 60,
      parts: { early: 1, morning: 1, afternoon: 1, evening: 1 },
    });
    assert.deepEqual(
      g.airlines.map((a) => [a.name, a.flights, a.minPrice]),
      [
        ["ماهان ایر", 2, 2_000_000],
        ["زاگرس", 1, 1_800_000],
        ["ایران ایر", 1, 2_500_000],
      ],
    );
    // An agency selling one flight in two cabins counts that flight once, at its lowest price.
    assert.deepEqual(
      g.agencies.map((a) => [a.name, a.flights, a.minPrice, a.slug]),
      [
        ["آژانس یک", 2, 2_000_000, "agency-one"],
        ["آژانس دو", 2, 2_100_000, null],
        ["آژانس سه", 1, 1_800_000, "agency-one"],
      ],
    );
  });

  test("this week's cheapest flights come cheapest first, and only from this week", () => {
    const cards = [2.4, 2.1, 2.9, 2.2, 2.6, 2.3, 2.8].map((m, i) =>
      card({ depart: at(i, 22), flightNo: `W5-${i}`, price: m * 1_000_000 }),
    );
    cards.push(card({ depart: at(8, 10), flightNo: "W5-99", price: 1_000_000 }));
    const g = guide(cards);
    assert.deepEqual(
      g.upcoming.map((f) => f.price / 1_000_000),
      [2.1, 2.2, 2.3, 2.4, 2.6, 2.8],
    );
    assert.equal(g.upcoming[0].date, addDaysToDateKey(TODAY, 1));
    assert.equal(g.upcoming[0].agencies, 1);
  });

  test("link the way back and the neighbouring routes", () => {
    const r = (originCode: string, destinationCode: string): RouteSummary => ({
      originCode,
      destinationCode,
      minPrice: 1_000_000,
      flights: 5,
    });
    const g = guide(
      [card({ depart: at(1, 8) })],
      [r("THR", "MHD"), r("MHD", "THR"), r("THR", "KIH"), r("IFN", "MHD"), r("THR", "SYZ"), r("KIH", "SYZ")],
    );
    assert.deepEqual(g.related.reverse, r("MHD", "THR"));
    assert.deepEqual(
      g.related.fromOrigin.map((x) => x.destinationCode),
      ["KIH", "SYZ"],
    );
    assert.deepEqual(
      g.related.toDestination.map((x) => x.originCode),
      ["IFN"],
    );
  });

  test("a route with nothing in the window has no cheapest day, times or duration", () => {
    const g = guide([card({ depart: at(0, 6) })]);
    assert.equal(g.cheapest, null);
    assert.equal(g.departures, null);
    assert.equal(g.duration, null);
    assert.ok(g.days.every((d) => d.minPrice === null && d.flights === 0));
  });
});
