import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { html, jsonLd, raw } from "./html";

describe("html templates", () => {
  test("escape interpolated text, in content and in attributes", () => {
    const name = `<img src=x onerror="alert(1)">&'`;
    assert.equal(
      html`<a title="${name}">${name}</a>`.value,
      `<a title="&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;&#39;">&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;&#39;</a>`,
    );
  });

  test("nest templates and lists without escaping twice, and skip empty values", () => {
    const items = ["a<b", "c"].map((x) => html`<li>${x}</li>`);
    // prettier-ignore
    assert.equal(html`<ul>${items}${false}${null}${undefined}${0}</ul>`.value, "<ul><li>a&lt;b</li><li>c</li>0</ul>");
    assert.equal(html`${raw("<b>trusted</b>")}`.value, "<b>trusted</b>");
  });

  test("a JSON-LD block can't be closed by its data", () => {
    const data = { name: "</script><script>alert(1)</script>" };
    const block = jsonLd(data).value;
    assert.equal(block.match(/<\/script>/g)?.length, 1);
    assert.deepEqual(JSON.parse(block.replace(/^<script[^>]*>|<\/script>$/g, "")), data);
  });
});
