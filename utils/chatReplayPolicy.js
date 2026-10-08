// Chat error notices are for the user, not for the model.
//
// When a request fails, the chat screen appends an assistant message so the
// user can see what went wrong. That message must never be sent back to a
// model: it is not part of the conversation, and native bridge errors carry
// framework names, source file paths, and error text that the assistant is
// explicitly instructed never to reveal.
//
// Earlier builds stored those notices as ordinary assistant messages, so the
// text patterns below also keep already-persisted histories clean without
// rewriting stored chats.

// Native bridge failures surface to JavaScript as a plain Error message, for
// example:
//   "UnexpectedException: Exceeded model context window size
//    (at ExpoModulesCore/ConcurrentFunctionDefinition.swift:90)"
const LEAKED_NATIVE_ERROR_PATTERNS = [
  /\(at [^()\s]*\.swift:\d+\)/,
  /\bUnexpectedException\b/,
  /Exceeded model context window size/i,
];

/**
 * True when a string looks like a native/Expo bridge failure rather than
 * something the app chose to say. Used to keep that text away from both the
 * user and the model.
 */
export function looksLikeNativeErrorText(value) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return false;
  return LEAKED_NATIVE_ERROR_PATTERNS.some((pattern) => pattern.test(text));
}

function messageText(message) {
  if (typeof message?.text === "string") return message.text;
  if (Array.isArray(message?.content)) {
    return message.content
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .join(" ")
      .trim();
  }
  return "";
}

/**
 * False for messages that exist only to show the user an error. Everything
 * else (user turns, real assistant replies, recipe cards) stays replayable.
 */
export function isReplayableChatMessage(message) {
  if (!message || typeof message !== "object") return false;
  if (message.isError === true) return false;
  if (message.role !== "assistant") return true;
  return !looksLikeNativeErrorText(messageText(message));
}
