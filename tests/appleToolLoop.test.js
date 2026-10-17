import assert from "node:assert/strict";
import test from "node:test";

import {
  APPLE_TOOL_CALL_EXHAUSTED,
  APPLE_TOOL_CALL_REPEAT,
  APPLE_TOOL_CALL_RUN,
  appleToolCallSignature,
  createAppleToolCallTracker,
} from "../api/appleToolLoop.js";

const call = (name, args) => appleToolCallSignature(name, args);

test("a fresh call is executed", () => {
  const tracker = createAppleToolCallTracker();

  assert.equal(tracker.classify(call("addShoppingItem", '{"name":"黄瓜"}')), APPLE_TOOL_CALL_RUN);
});

test("an identical call is corrected rather than re-executed", () => {
  const tracker = createAppleToolCallTracker({ maxRepeats: 2 });
  const signature = call("addShoppingItem", '{"name":"黄瓜"}');

  assert.equal(tracker.classify(signature), APPLE_TOOL_CALL_RUN);
  assert.equal(tracker.classify(signature), APPLE_TOOL_CALL_REPEAT);
  assert.equal(tracker.classify(signature), APPLE_TOOL_CALL_REPEAT);
  assert.equal(tracker.classify(signature), APPLE_TOOL_CALL_EXHAUSTED);
});

test("changing the arguments counts as a new call", () => {
  const tracker = createAppleToolCallTracker({ maxRepeats: 1 });

  assert.equal(tracker.classify(call("addShoppingItem", '{"name":"黄瓜"}')), APPLE_TOOL_CALL_RUN);
  // This is the shape of the real failure: the model retried with different
  // category values, which must still be allowed to run.
  assert.equal(
    tracker.classify(call("addShoppingItem", '{"name":"黄瓜","categories":{"storage":"Fridge"}}')),
    APPLE_TOOL_CALL_RUN
  );
  assert.equal(
    tracker.classify(call("addShoppingItem", '{"name":"黄瓜","categories":{"storage":"Fridge"}}')),
    APPLE_TOOL_CALL_REPEAT
  );
});

test("switching tools clears the repeat count", () => {
  const tracker = createAppleToolCallTracker({ maxRepeats: 0 });

  assert.equal(tracker.classify(call("getFridgeContents", "{}")), APPLE_TOOL_CALL_RUN);
  assert.equal(tracker.classify(call("getFridgeContents", "{}")), APPLE_TOOL_CALL_EXHAUSTED);
  assert.equal(tracker.classify(call("getShoppingListContents", "{}")), APPLE_TOOL_CALL_RUN);
  assert.equal(tracker.classify(call("getFridgeContents", "{}")), APPLE_TOOL_CALL_RUN);
});

test("signatures are stable against whitespace", () => {
  assert.equal(
    appleToolCallSignature(" addShoppingItem ", ' {"name":"黄瓜"} '),
    appleToolCallSignature("addShoppingItem", '{"name":"黄瓜"}')
  );
  assert.equal(appleToolCallSignature(undefined, undefined), "::");
});
