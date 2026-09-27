import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { CsvError, parseCsv, toCsv } from "./csv";

const cells = (text: string) => parseCsv(text).map((r) => r.cells);

describe("parseCsv", () => {
  test("reads plain rows with any line ending, ignoring blank lines and the BOM", () => {
    assert.deepEqual(cells("\ufeffa,b\r\n1,2\n\n3,4\r5,6"), [
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
      ["5", "6"],
    ]);
  });

  test("handles quoted commas, doubled quotes and line breaks inside quotes", () => {
    const rows = parseCsv('name,note\r\n"Sky, Inc.","He said ""hi""\nthen left"\r\nnext,row\r\n');
    assert.deepEqual(
      rows.map((r) => r.cells),
      [
        ["name", "note"],
        ["Sky, Inc.", 'He said "hi"\nthen left'],
        ["next", "row"],
      ],
    );
    assert.deepEqual(
      rows.map((r) => r.line),
      [1, 2, 4],
      "rows report the line they start on",
    );
  });

  test("keeps empty fields, including trailing ones", () => {
    assert.deepEqual(cells("a,,c,\n,,"), [
      ["a", "", "c", ""],
      ["", "", ""],
    ]);
  });

  test("rejects malformed quoting with the line number", () => {
    assert.throws(
      () => parseCsv('a,b\n"open,c\n'),
      (e: CsvError) => e.code === "UNTERMINATED_QUOTE" && e.line === 2,
    );
    assert.throws(
      () => parseCsv('a,b\nx"y,z'),
      (e: CsvError) => e.code === "STRAY_QUOTE" && e.line === 2,
    );
    assert.throws(
      () => parseCsv('"a"b,c'),
      (e: CsvError) => e.code === "STRAY_QUOTE",
    );
  });
});

describe("toCsv", () => {
  test("round-trips through the parser", () => {
    const rows = [
      ["airline", "note", "price"],
      ["ماهان ایر", 'quote " and, comma\nnewline', 2450000],
    ];
    assert.deepEqual(
      cells(toCsv(rows)),
      rows.map((r) => r.map(String)),
    );
  });

  test("starts with a BOM and ends lines with CRLF", () => {
    const csv = toCsv([["a"], ["b"]]);
    assert.ok(csv.startsWith("\ufeff"));
    assert.equal(csv.slice(1), "a\r\nb\r\n");
  });

  test("defuses text a spreadsheet would run as a formula", () => {
    const csv = toCsv([['=HYPERLINK("http://evil")', "+1", "-2", "@SUM(A1)", "\tx", "safe", -5]]);
    assert.deepEqual(cells(csv)[0], ['\'=HYPERLINK("http://evil")', "'+1", "'-2", "'@SUM(A1)", "'\tx", "safe", "-5"]);
  });
});
