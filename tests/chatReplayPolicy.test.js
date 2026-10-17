import assert from "node:assert/strict";
import test from "node:test";

import {
  isReplayableChatMessage,
  looksLikeNativeErrorText,
} from "../utils/chatReplayPolicy.js";
import { boundRuntimeChatMessages } from "../utils/chatStoragePolicy.js";

// The exact text found in the Apple Intelligence report logs.
const LEAKED_CONTEXT_ERROR =
  "UnexpectedException: Exceeded model context window size (at ExpoModulesCore/ConcurrentFunctionDefinition.swift:90)";

test("native bridge error text is recognised", () => {
  assert.equal(looksLikeNativeErrorText(LEAKED_CONTEXT_ERROR), true);
  assert.equal(
    looksLikeNativeErrorText("Boom (at ExpoModulesCore/SomeModule.swift:12)"),
    true
  );
  assert.equal(looksLikeNativeErrorText("UnexpectedException: nope"), true);
  assert.equal(
    looksLikeNativeErrorText("Error: Exceeded model context window size"),
    true
  );
});

test("ordinary chat text is not mistaken for a native error", () => {
  assert.equal(looksLikeNativeErrorText("冰箱里有：鸡蛋、牛奶"), false);
  assert.equal(
    looksLikeNativeErrorText("I checked your fridge and found 19 items."),
    false
  );
  assert.equal(looksLikeNativeErrorText(""), false);
  assert.equal(looksLikeNativeErrorText(null), false);
  assert.equal(looksLikeNativeErrorText(undefined), false);
  assert.equal(looksLikeNativeErrorText(42), false);
});

test("error notices are never replayed to a model", () => {
  assert.equal(
    isReplayableChatMessage({
      id: "assistant-error-1",
      role: "assistant",
      isError: true,
      content: [{ type: "output_text", text: "Pantrio AI could not complete that request." }],
    }),
    false
  );
});

test("legacy error notices persisted as plain assistant turns are skipped", () => {
  // Older builds stored the raw native error as an ordinary assistant message.
  assert.equal(
    isReplayableChatMessage({
      role: "assistant",
      content: [{ type: "output_text", text: LEAKED_CONTEXT_ERROR }],
    }),
    false
  );
  assert.equal(
    isReplayableChatMessage({ role: "assistant", text: LEAKED_CONTEXT_ERROR }),
    false
  );
});

test("real conversation content stays replayable", () => {
  assert.equal(
    isReplayableChatMessage({
      role: "assistant",
      content: [{ type: "output_text", text: "冰箱里有鸡蛋和牛奶。" }],
    }),
    true
  );
  assert.equal(
    isReplayableChatMessage({ role: "assistant", text: "Done." }),
    true
  );
  assert.equal(
    isReplayableChatMessage({ role: "user", text: "冰箱里有什么" }),
    true
  );
  assert.equal(
    isReplayableChatMessage({ type: "recipe_cards", text: "Found 3 recipes." }),
    true
  );
});

test("malformed entries are dropped rather than sent", () => {
  assert.equal(isReplayableChatMessage(null), false);
  assert.equal(isReplayableChatMessage(undefined), false);
  assert.equal(isReplayableChatMessage("assistant"), false);
});

test("a sanitized notice stays out of model context", () => {
  const [notice] = boundRuntimeChatMessages([
    {
      role: "assistant",
      isError: true,
      errorCode: "UPSTREAM_UNAVAILABLE",
      content: [
        {
          type: "output_text",
          text: "Pantrio AI is temporarily unavailable. Please try again.",
        },
      ],
    },
  ]);

  assert.equal(notice.isError, true);
  assert.equal(isReplayableChatMessage(notice), false);
});
