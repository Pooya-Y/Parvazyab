import { skip } from "../test/use-test-database";
import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  TestClient,
  closeDatabase,
  createAccount,
  createListing,
  resetDatabase,
  signIn,
  startServer,
  type TestServer,
} from "../test/harness";
import { AppDataSource, flightListings } from "../database/dataSource";
import { addDaysToDateKey, tehranTodayKey } from "../domain/time";
import { parseCsv } from "../lib/csv";
import { listingsCsv, parseTehranDateTime } from "../services/listingImport";
import { gregorianToJalaliKey } from "../domain/jalali";

interface Report {
  error?: string;
  committed: boolean;
  counts: { create: number; update: number; unchanged: number; error: number };
  rows: { ref: number; action: string; errors: string[]; id?: string }[];
}

const HEADER =
  "origin,destination,airline,flight_no,depart,arrive,stops,cabin,fare_type,price_toman,booking_url,active";
const day = (offset: number) => addDaysToDateKey(tehranTodayKey(), offset);
const csv = (...lines: string[]) => [HEADER, ...lines].join("\r\n");
const persianDigits = (s: string) => s.replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);

describe("CSV import and export", { skip }, () => {
  let server: TestServer;
  let agency: Awaited<ReturnType<typeof createAccount>>;
  let client: TestClient;

  before(async () => {
    await resetDatabase();
    server = await startServer();
    agency = await createAccount({ role: "agency", email: "bulk@example.com" });
    client = new TestClient(server.url);
    await signIn(client, agency.email);
  });

  after(async () => {
    await server?.close();
    await closeDatabase();
  });

  beforeEach(async () => {
    await AppDataSource.query(`DELETE FROM flight_listings`);
  });

  const upload = (body: string, query = "") =>
    client.post<Report>(`/api/dashboard/listings/import${query}`, body, { "Content-Type": "text/csv" });

  test("previews every row without writing anything", async () => {
    const file = csv(
      `THR,MHD,ماهان ایر,W5-1071,${day(5)} 08:30,${day(5)} 10:00,0,economy,scheduled,2450000,https://agency.example/1,true`,
      // A Jalali date in Persian digits, separators and Persian enum words are all fine.
      `THR,KIH,کیش ایر,Y9-7012,${persianDigits(gregorianToJalaliKey(day(5)))} ۱۴:۱۰,${day(5)} 16:05,۰,اکونومی,چارتری,"۳٬۱۰۰٬۰۰۰",https://agency.example/2,بله`,
      `XXX,MHD,ماهان ایر,W5-1,${day(5)} 08:30,${day(5)} 10:00,0,economy,scheduled,2450000,https://agency.example/3,true`,
      `THR,MHD,ماهان ایر,W5-2,tomorrow,${day(5)} 10:00,0,economy,scheduled,2450000,https://agency.example/4,true`,
      `THR,MHD,ماهان ایر,W5-3,${day(-2)} 08:30,${day(-2)} 10:00,0,economy,scheduled,2450000,https://agency.example/5,true`,
      `THR,MHD,ماهان ایر,W5-1071,${day(5)} 08:30,${day(5)} 10:00,0,economy,scheduled,2400000,https://agency.example/6,true`,
      `THR,MHD,ماهان ایر,W5-4,${day(5)} 08:30,${day(5)} 07:00,0,economy,scheduled,2450000,javascript:alert(1),true`,
      // Several problems in one row are all reported at once.
      `TBZ,THR,ایران ایر,IR-5,${day(5)} 07:00,${day(5)} 08:20,0,first,scheduled,2100000,ftp://agency.example,true`,
    );
    const res = await upload(file);
    assert.equal(res.status, 200);
    assert.equal(res.body.committed, false);
    const byLine = Object.fromEntries(res.body.rows.map((r) => [r.ref, r]));
    assert.equal(byLine[2].action, "create");
    assert.equal(byLine[3].action, "create", JSON.stringify(byLine[3].errors));
    assert.deepEqual(byLine[4].errors, ["origin: UNKNOWN_AIRPORT"]);
    assert.deepEqual(byLine[5].errors, ["depart: INVALID_DATETIME"]);
    assert.deepEqual(byLine[6].errors, ["depart: DEPARTURE_IN_PAST"]);
    assert.deepEqual(byLine[7].errors, ["flight_no: DUPLICATE_ROW"], "the same flight twice in one file");
    assert.deepEqual(byLine[8].errors, ["booking_url: INVALID_BOOKING_URL"]);
    assert.deepEqual(byLine[9].errors, ["cabin: INVALID_CABIN", "booking_url: INVALID_BOOKING_URL"]);
    assert.deepEqual(res.body.counts, { create: 2, update: 0, unchanged: 0, error: 6 });
    assert.equal(await flightListings().count(), 0, "a preview writes nothing");
  });

  test("commits all or nothing, unless told to skip bad rows", async () => {
    const file = csv(
      `THR,MHD,ماهان ایر,W5-1071,${day(5)} 08:30,${day(5)} 10:00,0,economy,scheduled,"2,450,000",https://agency.example/1,true`,
      `THR,KIH,کیش ایر,Y9-7012,${day(6)} 14:10,${day(6)} 16:05,0,business,charter,5100000,https://agency.example/2,false`,
      `XXX,MHD,ماهان ایر,W5-1,${day(5)} 08:30,${day(5)} 10:00,0,economy,scheduled,2450000,https://agency.example/3,true`,
    );
    const refused = await upload(file, "?commit=true");
    assert.equal(refused.status, 422);
    assert.equal(refused.body.error, "IMPORT_HAS_ERRORS");
    assert.equal(await flightListings().count(), 0);

    const done = await upload(file, "?commit=true&skipInvalid=true");
    assert.equal(done.status, 200);
    assert.equal(done.body.committed, true);
    assert.deepEqual(done.body.counts, { create: 2, update: 0, unchanged: 0, error: 1 });
    assert.ok(
      done.body.rows.filter((r) => r.action === "create").every((r) => r.id),
      "new ids are reported",
    );

    const saved = await flightListings().find({ where: { accountId: agency.id }, order: { departAt: "ASC" } });
    assert.equal(saved.length, 2);
    assert.equal(saved[0].priceToman, 2_450_000);
    assert.equal(saved[0].departAt.getTime(), parseTehranDateTime(`${day(5)} 08:30`));
    assert.equal(saved[0].durationMin, 90);
    assert.equal(saved[1].cabin, "business");
    assert.equal(saved[1].fareType, "charter");
    assert.equal(saved[1].isActive, false);

    const search = await new TestClient(server.url).get<{ flights: { flightNo: string }[] }>(
      `/api/search?originCode=THR&destinationCode=MHD&date=${day(5)}`,
    );
    assert.deepEqual(
      search.body.flights.map((f) => f.flightNo),
      ["W5-1071"],
      "imported listings are searchable right away",
    );
  });

  test("export, edit, import: updates in place, never duplicates", async () => {
    await createListing(agency.id, { flightNo: "W5-101", priceToman: 2_450_000 });
    await createListing(agency.id, { flightNo: "=HYPERLINK(1)", airline: "@evil", priceToman: 1_900_000 });

    const exported = await client.get("/api/dashboard/listings/export.csv");
    assert.equal(exported.status, 200);
    assert.match(exported.headers.get("content-type") ?? "", /^text\/csv; charset=utf-8/);
    assert.match(
      exported.headers.get("content-disposition") ?? "",
      /^attachment; filename="parvazyab-listings-\d{4}-\d{2}-\d{2}\.csv"$/,
    );
    // fetch strips the BOM while decoding, so check the bytes the endpoint sends.
    assert.ok((await listingsCsv(agency.id)).startsWith("\ufeff"), "BOM for Excel");
    const rows = parseCsv(exported.text).map((r) => r.cells);
    assert.deepEqual(rows[0], HEADER.split(","));
    assert.match(rows[1][4], /^14\d\d-\d\d-\d\d \d\d:\d\d$/, "dates are exported in the Jalali calendar");
    const risky = rows.find((r) => r[3].includes("HYPERLINK"));
    assert.equal(risky?.[3], "'=HYPERLINK(1)", "formula-looking cells are defused");
    assert.equal(risky?.[2], "'@evil");

    // Importing the export unchanged: nothing to do.
    const safeRows = rows
      .filter((r) => r !== risky)
      .map((r) => r.map((c) => (/[",]/.test(c) ? `"${c}"` : c)).join(","));
    const same = await upload(safeRows.join("\r\n"));
    assert.deepEqual(same.body.counts, { create: 0, update: 0, unchanged: 1, error: 0 });

    // Change the price in the "spreadsheet".
    const edited = safeRows.map((line, i) => (i === 0 ? line : line.replace(",2450000,", ",2300000,")));
    const committed = await upload(edited.join("\r\n"), "?commit=true");
    assert.deepEqual(committed.body.counts, { create: 0, update: 1, unchanged: 0, error: 0 });
    const listings = await flightListings().find({ where: { accountId: agency.id, flightNo: "W5-101" } });
    assert.equal(listings.length, 1);
    assert.equal(listings[0].priceToman, 2_300_000);
  });

  test("another agency's identical flight is theirs, not a match", async () => {
    const other = await createAccount({ role: "agency", email: "rival@example.com" });
    const departAt = new Date(parseTehranDateTime(`${day(5)} 08:30`)!);
    await createListing(other.id, { flightNo: "W5-1071", departAt });
    const res = await upload(
      csv(
        `THR,MHD,ماهان ایر,W5-1071,${day(5)} 08:30,${day(5)} 10:00,0,economy,scheduled,2450000,https://a.example,true`,
      ),
    );
    assert.equal(res.body.rows[0].action, "create");
  });

  test("the template imports cleanly", async () => {
    const template = await client.get("/api/dashboard/listings/template.csv");
    assert.equal(template.status, 200);
    const res = await upload(template.text);
    assert.deepEqual(res.body.counts, { create: 2, update: 0, unchanged: 0, error: 0 });
  });

  test("reports problems with the file itself", async () => {
    const missing = await upload("origin,destination\nTHR,MHD");
    assert.equal(missing.status, 400);
    assert.equal(missing.body.error, "CSV_MISSING_COLUMNS");
    assert.deepEqual((missing.body as unknown as { details: string[] }).details, [
      "airline",
      "flight_no",
      "depart",
      "arrive",
      "price_toman",
      "booking_url",
    ]);

    const malformed = await upload(`${HEADER}\r\n"THR,MHD`);
    assert.equal(malformed.body.error, "CSV_MALFORMED");
    assert.equal((await upload(HEADER)).body.error, "CSV_EMPTY");

    const tooMany = await upload(csv(...Array.from({ length: 2001 }, (_, i) => `THR,MHD,x,W5-${i},,,,,,,,`)));
    assert.equal(tooMany.status, 413);
    assert.equal(tooMany.body.error, "TOO_MANY_ROWS");

    const json = await client.post("/api/dashboard/listings/import", { rows: [] });
    assert.equal(json.status, 415);
  });

  test("only for agencies", async () => {
    const traveller = await createAccount();
    const c = new TestClient(server.url);
    await signIn(c, traveller.email);
    assert.equal((await c.get("/api/dashboard/listings/export.csv")).status, 403);
    assert.equal((await c.post("/api/dashboard/listings/import", HEADER, { "Content-Type": "text/csv" })).status, 403);
  });
});
