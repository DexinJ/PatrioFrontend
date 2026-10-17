import assert from "node:assert/strict";
import test from "node:test";

import {
  APPLE_CONTEXT_FALLBACK_TOKENS,
  appleInputBudgetChars,
  applePromptFits,
} from "../api/appleContextBudget.js";

test("Private Cloud Compute gets a far larger budget than the on-device model", () => {
  const onDevice = appleInputBudgetChars({ engine: "on_device" });
  const privateCloud = appleInputBudgetChars({
    engine: "private_cloud_compute",
  });

  assert.ok(privateCloud > onDevice * 5, "PCC window is 8x the on-device one");
  // Part of each window is reserved for the reply, tool results, and PCC's
  // reasoning text, so the budget is below the raw context size.
  assert.ok(privateCloud < 32_768);
  assert.ok(onDevice < 4_096);
});

test("the old character cap could not have been safe on-device", () => {
  // Regression guard: a flat 28,000-character limit is what produced
  // "Exceeded model context window size" in the Apple Intelligence report.
  const legacyCap = 28_000;

  assert.ok(appleInputBudgetChars({ engine: "on_device" }) < legacyCap);
});

test("an unknown or missing engine falls back to the smallest window", () => {
  const expected = appleInputBudgetChars({ engine: "on_device" });

  assert.equal(appleInputBudgetChars(undefined), expected);
  assert.equal(appleInputBudgetChars(null), expected);
  assert.equal(appleInputBudgetChars({}), expected);
  assert.equal(appleInputBudgetChars({ engine: "something_new" }), expected);
  assert.equal(
    appleInputBudgetChars({ engine: "on_device" }),
    Math.floor(APPLE_CONTEXT_FALLBACK_TOKENS * 0.65)
  );
});

test("the budget never collapses to zero", () => {
  for (const engine of ["on_device", "private_cloud_compute", "unknown"]) {
    assert.ok(appleInputBudgetChars({ engine }) >= 512);
  }
});

test("prompt fitting counts instructions and prompt together", () => {
  assert.equal(applePromptFits("a".repeat(50), "b".repeat(48), 100), true);
  assert.equal(applePromptFits("a".repeat(50), "b".repeat(49), 100), false);
  assert.equal(applePromptFits("", "", 0), true);
  assert.equal(applePromptFits(undefined, undefined, 4), true);
});
