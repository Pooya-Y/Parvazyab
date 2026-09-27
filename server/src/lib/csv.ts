/**
 * CSV per RFC 4180, as spreadsheets write it: quoted fields may hold commas,
 * doubled quotes and line breaks; lines end in CRLF, LF or CR; Excel's UTF-8
 * byte-order mark is ignored.
 */
export class CsvError extends Error {
  constructor(
    readonly code: "UNTERMINATED_QUOTE" | "STRAY_QUOTE",
    readonly line: number,
  ) {
    super(`${code} at line ${line}`);
    this.name = "CsvError";
  }
}

export interface CsvRow {
  /** 1-based line where the row starts, for error messages. */
  line: number;
  cells: string[];
}

export function parseCsv(input: string): CsvRow[] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const rows: CsvRow[] = [];
  let cells: string[] = [];
  let cell = "";
  let quoted = false;
  let line = 1;
  let rowLine = 1;
  let fieldStart = true;

  const endCell = () => {
    cells.push(cell);
    cell = "";
    fieldStart = true;
  };
  const endRow = () => {
    endCell();
    // A blank line is not a row.
    if (!(cells.length === 1 && cells[0] === "")) rows.push({ line: rowLine, cells });
    cells = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          const next = text[i + 1];
          if (next !== undefined && next !== "," && next !== "\n" && next !== "\r")
            throw new CsvError("STRAY_QUOTE", line);
        }
      } else {
        if (ch === "\n" || (ch === "\r" && text[i + 1] !== "\n")) line++;
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      if (!fieldStart) throw new CsvError("STRAY_QUOTE", line);
      quoted = true;
      fieldStart = false;
    } else if (ch === ",") {
      endCell();
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      endRow();
      line++;
      rowLine = line;
    } else {
      cell += ch;
      fieldStart = false;
    }
  }
  if (quoted) throw new CsvError("UNTERMINATED_QUOTE", rowLine);
  if (cell !== "" || cells.length) endRow();
  return rows;
}

/**
 * A cell a spreadsheet would run as a formula (=, +, -, @, or a leading tab or
 * carriage return) gets a leading apostrophe: exported data must never execute
 * when the agency opens the file.
 */
function neutralize(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function field(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "string" ? neutralize(value) : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** CRLF-terminated CSV with a UTF-8 byte-order mark, so Excel reads Persian text correctly. */
export function toCsv(rows: (string | number | boolean | null | undefined)[][]): string {
  return "\ufeff" + rows.map((r) => r.map(field).join(",")).join("\r\n") + "\r\n";
}
