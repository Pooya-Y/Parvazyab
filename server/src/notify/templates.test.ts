import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  appLink,
  escapeHtml,
  formatTehranDateTime,
  notificationMail,
  passwordChangedMail,
  passwordResetMail,
  verifyEmailMail,
} from "./templates";

const TOKEN = "A".repeat(43);

describe("email templates", () => {
  test("puts tokens in the URL fragment, never the query", () => {
    const link = appLink("/auth/reset", { token: TOKEN });
    const url = new URL(link);
    assert.equal(url.pathname, "/auth/reset");
    assert.equal(url.search, "");
    assert.equal(url.hash, `#token=${TOKEN}`);
  });

  test("escapes user-controlled text in the HTML part", () => {
    const mail = verifyEmailMail(`<img src=x onerror="alert(1)">`, TOKEN);
    assert.equal(mail.html.includes("<img"), false);
    assert.ok(mail.html.includes("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"));
    // The text part is plain text: nothing to escape, nothing lost.
    assert.ok(mail.text.includes(`<img src=x onerror="alert(1)">`));
    assert.equal(escapeHtml(`a&b'c`), "a&amp;b&#39;c");
  });

  test("every message is RTL, titled, and carries its link in both parts", () => {
    for (const mail of [
      verifyEmailMail("نگار", TOKEN),
      passwordResetMail("نگار", "negar@example.com", TOKEN),
      passwordChangedMail("نگار", "negar@example.com", new Date("2026-09-26T09:35:00Z")),
    ]) {
      assert.match(mail.html, /<html lang="fa" dir="rtl">/);
      assert.ok(mail.html.includes(`<title>${escapeHtml(mail.subject)}</title>`));
      const [link] = /https?:\/\/\S+/.exec(mail.text) ?? [];
      assert.ok(link, `no link in ${mail.subject}`);
      assert.ok(mail.html.includes(`href="${escapeHtml(link)}"`), `HTML link differs in ${mail.subject}`);
    }
  });

  test("notification mail links into the app and offers to stop", () => {
    const unsubscribe = appLink("/alerts/unsubscribe?alert=a1&sig=s1");
    const mail = notificationMail(
      "نگار",
      { title: "تهران به مشهد: ارزان‌تر شد", body: "کمترین قیمت پایین آمد.", link: "/search?from=THR&to=MHD" },
      unsubscribe,
    );
    assert.equal(mail.subject, "تهران به مشهد: ارزان‌تر شد");
    assert.ok(mail.text.includes(appLink("/search?from=THR&to=MHD")));
    assert.ok(mail.text.includes(unsubscribe));
    assert.ok(mail.html.includes(`href="${escapeHtml(unsubscribe)}"`));
  });

  test("formats times in Iran time with the Persian calendar", () => {
    // 09:35 UTC is 13:05 in Tehran (UTC+03:30).
    assert.equal(formatTehranDateTime(new Date("2026-09-26T09:35:00Z")), "۴ مهر ۱۴۰۵ ساعت ۱۳:۰۵");
  });
});
