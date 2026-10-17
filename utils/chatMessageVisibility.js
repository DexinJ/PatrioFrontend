// utils/chatMessageVisibility.js
// Decides which structured chat items (recipe cards, confirmation cards) belong
// to the turn that is currently streaming. Those items stay hidden until the
// stream settles, so the assistant's intro text lands above its cards instead
// of the cards popping in first and then being shoved down by the text.
//
// Kept React-free (like utils/chatMessageOrder.js) so it is unit-testable.

const STRUCTURED_MESSAGE_TYPES = new Set(["recipe_cards", "ui_action"]);

/**
 * Index of the newest user-authored message, or -1 when the transcript has no
 * user entry. Every turn appends its user message first and its structured
 * items after it, so everything past this index belongs to the in-flight turn.
 */
export function lastUserMessageIndex(messages) {
  const list = Array.isArray(messages) ? messages : [];
  for (let index = list.length - 1; index >= 0; index -= 1) {
    if (list[index]?.role === "user") return index;
  }
  return -1;
}

/**
 * A structured message belongs to the in-flight turn when it sits after the
 * newest user message. Once a newer user message is appended, the boundary
 * moves forward and the older card is no longer considered in flight.
 */
export function isInFlightStructuredMessage(message, index, lastUserIndex) {
  if (!STRUCTURED_MESSAGE_TYPES.has(message?.type)) return false;
  return index > lastUserIndex;
}
