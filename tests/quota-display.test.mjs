import test from "node:test";
import assert from "node:assert/strict";
import { formatQuotaDuration } from "../lib/quota-display.ts";

test("quota duration preserves seconds and handles empty and large allowances", () => {
  for (const [seconds, expected] of [[0, "0:00"], [-1, "0:00"], [9, "0:09"], [59, "0:59"], [60, "1:00"], [599, "9:59"], [600, "10:00"], [36000, "600:00"]]) {
    assert.equal(formatQuotaDuration(seconds), expected);
  }
});
