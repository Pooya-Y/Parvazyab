import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";

// Configure before the config module is first loaded (each test file is its own process).
process.env.SMS_TRANSPORT = "kavenegar";
process.env.KAVENEGAR_API_KEY = "secret-key/with?chars";
process.env.KAVENEGAR_TEMPLATE = "parvazyab-otp";
process.env.APP_URL = "https://parvazyab.example";

type SmsModule = typeof import("./sms");

describe("Kavenegar SMS transport", () => {
  let sms: SmsModule;
  const realFetch = globalThis.fetch;
  let calls: { url: string; init?: RequestInit }[] = [];
  let reply: { status: number; body: unknown } = { status: 200, body: { return: { status: 200 } } };

  before(async () => {
    sms = await import("./sms.js");
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify(reply.body), { status: reply.status });
    }) as typeof fetch;
  });

  after(() => {
    globalThis.fetch = realFetch;
  });

  test("sends the code through the verify/lookup template", async () => {
    calls = [];
    await sms.sendOtpSms({ to: "+989121234567", code: "042917", text: sms.otpText("042917") });
    assert.equal(calls.length, 1);
    assert.equal(
      calls[0].url,
      "https://api.kavenegar.com/v1/secret-key%2Fwith%3Fchars/verify/lookup.json",
      "the key is path-encoded",
    );
    assert.equal(calls[0].init?.method, "POST");
    const form = new URLSearchParams(String(calls[0].init?.body));
    assert.equal(form.get("receptor"), "09121234567");
    assert.equal(form.get("token"), "042917");
    assert.equal(form.get("template"), "parvazyab-otp");
  });

  test("fails loudly on a rejected send, without leaking the key", async () => {
    reply = { status: 200, body: { return: { status: 418, message: "invalid template" } } };
    await assert.rejects(
      sms.sendOtpSms({ to: "+989121234567", code: "111111", text: "" }),
      (err: Error) => /status 418/.test(err.message) && !err.message.includes("secret-key"),
    );
    reply = { status: 502, body: "bad gateway" };
    await assert.rejects(sms.sendOtpSms({ to: "+989121234567", code: "111111", text: "" }), /HTTP 502/);
  });

  test("the text ends with the WebOTP line for the app's host", () => {
    assert.ok(sms.otpText("123456").endsWith("@parvazyab.example #123456"));
  });
});
