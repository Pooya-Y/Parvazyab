/**
 * Escaping HTML templates for the pages and emails the server renders itself.
 * Every interpolated value is escaped unless it is already `Html` (built by
 * `html` or marked with `raw`), so text from the database — agency names, a
 * reviewer's words — can never turn into markup.
 */
const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => ESCAPES[c]);

export class Html {
  constructor(readonly value: string) {}

  toString() {
    return this.value;
  }
}

/** What a template accepts: `false`/`null`/`undefined` render nothing, so `cond && html\`…\`` works. */
export type HtmlValue = Html | string | number | false | null | undefined | readonly HtmlValue[];

function render(value: HtmlValue): string {
  if (value === false || value === null || value === undefined) return "";
  if (value instanceof Html) return value.value;
  if (Array.isArray(value)) return value.map(render).join("");
  return escapeHtml(String(value));
}

export function html(strings: TemplateStringsArray, ...values: HtmlValue[]): Html {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += render(values[i]) + strings[i + 1];
  return new Html(out);
}

/** Markup written in this codebase (icons, stylesheets). Never pass it data. */
export const raw = (markup: string) => new Html(markup);

/** A JSON-LD block. `<` is escaped so no value can close the script element early. */
export const jsonLd = (data: unknown) =>
  raw(`<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`);
