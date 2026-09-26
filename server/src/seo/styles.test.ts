import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { DARK_TOKENS, LIGHT_TOKENS } from "./styles";

/** `--name: value;` pairs of one top-level rule in the web client's stylesheet. */
function tokens(css: string, selector: string): Map<string, string> {
  const block = new RegExp(`^${selector.replace(".", "\\.")}\\s*\\{([^}]*)\\}`, "m").exec(css);
  assert.ok(block, `${selector} not found in index.css`);
  return new Map([...block[1].matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

describe("route page styles", () => {
  test("use the web client's colour tokens, light and dark", () => {
    const css = readFileSync(path.join(__dirname, "../../../client/src/index.css"), "utf8");
    for (const [selector, ours] of [
      [":root", LIGHT_TOKENS],
      [".dark", DARK_TOKENS],
    ] as const) {
      const theirs = tokens(css, selector);
      for (const [name, value] of Object.entries(ours)) {
        assert.equal(value, theirs.get(name), `--${name} under ${selector}`);
      }
    }
  });
});
