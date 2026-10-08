// How much text the Apple Foundation Models path may send in one request.
//
// The limit is expressed in tokens, not characters, and it depends on which
// model answers: Apple documents 4K tokens for the on-device model and 32K for
// Private Cloud Compute.
//
// The previous guard was a flat 28,000 characters, which is roughly 7,000
// tokens — comfortably past the on-device window. That is what produced
// "Exceeded model context window size" in the Apple Intelligence report.
//
// This app's primary locale is Chinese, where one character is about one
// token, so characters are counted as tokens. That over-counts English and is
// deliberately conservative: underestimating a prompt is what breaks a turn,
// while over-counting only trims a long conversation early.

export const APPLE_CONTEXT_TOKENS = Object.freeze({
  private_cloud_compute: 32_768,
  on_device: 4_096,
});

// When the active engine cannot be determined, assume the smallest window
// rather than let an oversized prompt reach the model.
export const APPLE_CONTEXT_FALLBACK_TOKENS = 4_096;

// Instructions, the tool guide, tool results, the reply, and Private Cloud
// Compute's reasoning text all share the same window, so only part of it is
// available to the conversation itself.
const RESPONSE_RESERVE_RATIO = 0.35;
const MIN_INPUT_TOKENS = 512;

/**
 * The character budget for one Apple request, derived from the engine the
 * native module reports for the next session.
 */
export function appleInputBudgetChars(availability) {
  const engine = String(availability?.engine || "").trim();
  const contextTokens =
    APPLE_CONTEXT_TOKENS[engine] ?? APPLE_CONTEXT_FALLBACK_TOKENS;

  return Math.max(
    MIN_INPUT_TOKENS,
    Math.floor(contextTokens * (1 - RESPONSE_RESERVE_RATIO))
  );
}

/**
 * True when instructions plus prompt fit the budget.
 */
export function applePromptFits(instructions, prompt, budgetChars) {
  const head = instructions ?? "";
  const body = prompt ?? "";
  const length = head ? head.length + 2 + body.length : body.length;
  return length <= budgetChars;
}
