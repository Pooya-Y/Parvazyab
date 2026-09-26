import { test } from "node:test";
import assert from "node:assert/strict";
import { httpUrl, listingSchema, searchQuerySchema } from "./schemas";

test("search query booleans are parsed, not coerced", () => {
  const base = { originCode: "THR", destinationCode: "MHD" };
  assert.equal(searchQuerySchema.parse({ ...base, directOnly: "false" }).directOnly, false);
  assert.equal(searchQuerySchema.parse({ ...base, directOnly: "true" }).directOnly, true);
  assert.equal(searchQuerySchema.safeParse({ ...base, directOnly: "yes" }).success, false);
});

test("search query normalizes airports and splits airlines", () => {
  const q = searchQuerySchema.parse({
    originCode: " thr ",
    destinationCode: "mhd",
    airlines: "ماهان ایر, زاگرس,,",
    maxStops: "1",
  });
  assert.equal(q.originCode, "THR");
  assert.equal(q.destinationCode, "MHD");
  assert.deepEqual(q.airlines, ["ماهان ایر", "زاگرس"]);
  assert.equal(q.maxStops, 1);
});

test("search query rejects unknown airports, same route and invalid dates", () => {
  assert.equal(searchQuerySchema.safeParse({ originCode: "XXX", destinationCode: "MHD" }).success, false);
  assert.equal(searchQuerySchema.safeParse({ originCode: "THR", destinationCode: "THR" }).success, false);
  assert.equal(
    searchQuerySchema.safeParse({ originCode: "THR", destinationCode: "MHD", date: "2030-02-31" }).success,
    false,
  );
  assert.equal(
    searchQuerySchema.safeParse({ originCode: "THR", destinationCode: "MHD", sort: "random" }).success,
    false,
  );
});

test("booking URLs must be http(s)", () => {
  assert.equal(httpUrl.safeParse("https://agency.example/book?id=1").success, true);
  assert.equal(httpUrl.safeParse("http://agency.example").success, true);
  assert.equal(httpUrl.safeParse("javascript:alert(1)").success, false);
  assert.equal(httpUrl.safeParse("data:text/html,<script>alert(1)</script>").success, false);
  assert.equal(httpUrl.safeParse("not a url").success, false);
});

test("listing schema validates shape", () => {
  const valid = {
    originCode: "THR",
    destinationCode: "MHD",
    airline: "ماهان",
    flightNo: "W5-101",
    departAt: 1_900_000_000_000,
    arriveAt: 1_900_005_400_000,
    stops: 0,
    cabin: "economy",
    priceToman: 2_500_000,
    bookingUrl: "https://agency.example",
    isActive: true,
  };
  assert.equal(listingSchema.safeParse(valid).success, true);
  assert.equal(listingSchema.safeParse({ ...valid, stops: 5 }).success, false);
  assert.equal(listingSchema.safeParse({ ...valid, priceToman: -1 }).success, false);
  assert.equal(listingSchema.safeParse({ ...valid, cabin: "first" }).success, false);
});
