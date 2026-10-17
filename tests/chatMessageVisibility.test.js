import assert from "node:assert/strict";
import test from "node:test";

import {
  isInFlightStructuredMessage,
  lastUserMessageIndex,
} from "../utils/chatMessageVisibility.js";

test("lastUserMessageIndex finds the newest user entry", () => {
  const messages = [
    { id: "user-1", role: "user" },
    { id: "assistant-1", role: "assistant" },
    { id: "user-2", role: "user" },
    { id: "assistant-2", role: "assistant" },
  ];
  assert.equal(lastUserMessageIndex(messages), 2);
});

test("lastUserMessageIndex returns -1 without a user entry", () => {
  assert.equal(
    lastUserMessageIndex([{ id: "assistant-1", role: "assistant" }]),
    -1
  );
  assert.equal(lastUserMessageIndex([]), -1);
  assert.equal(lastUserMessageIndex(null), -1);
});

test("isInFlightStructuredMessage flags structured items after the boundary", () => {
  const lastUserIndex = 3;
  assert.equal(
    isInFlightStructuredMessage({ type: "recipe_cards" }, 5, lastUserIndex),
    true
  );
  assert.equal(
    isInFlightStructuredMessage({ type: "ui_action" }, 6, lastUserIndex),
    true
  );
});

test("isInFlightStructuredMessage ignores items before the boundary", () => {
  const lastUserIndex = 3;
  assert.equal(
    isInFlightStructuredMessage({ type: "recipe_cards" }, 2, lastUserIndex),
    false
  );
  assert.equal(
    isInFlightStructuredMessage({ type: "ui_action" }, 1, lastUserIndex),
    false
  );
});

test("isInFlightStructuredMessage ignores non-structured messages", () => {
  const lastUserIndex = 3;
  assert.equal(
    isInFlightStructuredMessage({ role: "user" }, 5, lastUserIndex),
    false
  );
  assert.equal(
    isInFlightStructuredMessage({ role: "assistant" }, 5, lastUserIndex),
    false
  );
  assert.equal(isInFlightStructuredMessage(undefined, 5, lastUserIndex), false);
});

test("no user boundary treats every structured item as in flight", () => {
  const lastUserIndex = lastUserMessageIndex([
    { type: "recipe_cards" },
    { role: "assistant" },
  ]);
  assert.equal(lastUserIndex, -1);
  assert.equal(
    isInFlightStructuredMessage({ type: "recipe_cards" }, 0, lastUserIndex),
    true
  );
});

test("only the current turn's card is in flight in a mixed transcript", () => {
  const messages = [
    { id: "user-1", role: "user" },
    { id: "assistant-1", role: "assistant" },
    { id: "recipe-cards-prev", role: "assistant", type: "recipe_cards" },
    { id: "user-2", role: "user" },
    { id: "assistant-2", role: "assistant" },
    { id: "recipe-cards-current", role: "assistant", type: "recipe_cards" },
  ];
  const lastUserIndex = lastUserMessageIndex(messages);

  const inFlight = messages
    .map((message, index) =>
      isInFlightStructuredMessage(message, index, lastUserIndex)
    )
    .flatMap((flag, index) => (flag ? [messages[index].id] : []));

  assert.deepEqual(inFlight, ["recipe-cards-current"]);
});
