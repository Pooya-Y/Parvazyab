import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { decideAlert } from "./priceAlerts";

const fresh = { targetPrice: null, baselinePrice: 2_000_000, lastNotifiedPrice: null };

describe("decideAlert", () => {
  test("without a target, waits for a 3% drop from the fare when the alert was made", () => {
    assert.deepEqual(decideAlert(fresh, 1_950_000), { notify: false }); // 2.5% lower
    assert.deepEqual(decideAlert(fresh, 1_940_000), { notify: true, reason: "drop" }); // exactly 3%
    assert.deepEqual(decideAlert(fresh, 2_300_000), { notify: false });
  });

  test("after a notification, only a further 2% drop is news", () => {
    const notified = { ...fresh, lastNotifiedPrice: 1_900_000 };
    assert.deepEqual(decideAlert(notified, 1_900_000), { notify: false });
    assert.deepEqual(decideAlert(notified, 1_870_000), { notify: false }); // 1.6% lower
    assert.deepEqual(decideAlert(notified, 1_862_000), { notify: true, reason: "drop" });
    // Bouncing back above and down to the same price again is not news either.
    assert.deepEqual(decideAlert(notified, 1_899_999), { notify: false });
  });

  test("with a target, notifies once it is reached, then only on further drops", () => {
    const target = { targetPrice: 1_500_000, baselinePrice: 2_000_000, lastNotifiedPrice: null };
    assert.deepEqual(decideAlert(target, 1_500_001), { notify: false });
    assert.deepEqual(decideAlert(target, 1_500_000), { notify: true, reason: "target" });
    const reported = { ...target, lastNotifiedPrice: 1_500_000 };
    assert.deepEqual(decideAlert(reported, 1_480_000), { notify: false });
    assert.deepEqual(decideAlert(reported, 1_450_000), { notify: true, reason: "target" });
  });

  test("a target below the baseline never fires on a mere 3% drop", () => {
    const target = { targetPrice: 1_000_000, baselinePrice: 2_000_000, lastNotifiedPrice: null };
    assert.deepEqual(decideAlert(target, 1_800_000), { notify: false });
  });

  test("with nothing flying at creation, the first fare seen becomes the baseline", () => {
    const empty = { targetPrice: null, baselinePrice: null, lastNotifiedPrice: null };
    assert.deepEqual(decideAlert(empty, 2_000_000), { notify: false, baseline: 2_000_000 });
    assert.deepEqual(decideAlert(empty, null), { notify: false });
  });
});
