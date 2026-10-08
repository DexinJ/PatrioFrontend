// Decides what to do with the tool call the model just produced.
//
// Foundation Models has no native tool loop here — the app executes tools and
// feeds results back itself — so a model that keeps emitting the same call
// would otherwise burn every step and end the turn with no answer. Re-running
// an identical call cannot change its result, so it is answered with a
// correction instead.

export const APPLE_TOOL_CALL_RUN = "run";
export const APPLE_TOOL_CALL_REPEAT = "repeat";
export const APPLE_TOOL_CALL_EXHAUSTED = "exhausted";

/**
 * Tracks consecutive identical tool calls.
 *
 * `classify` returns:
 * - "run"       — a new call; execute it
 * - "repeat"    — the same call again; correct the model instead of re-running
 * - "exhausted" — too many repeats in a row; give up on the turn
 */
export function createAppleToolCallTracker({ maxRepeats = 2 } = {}) {
  const limit = Number.isFinite(maxRepeats) && maxRepeats >= 0 ? maxRepeats : 2;
  let previousSignature = null;
  let repeats = 0;

  return {
    classify(signature) {
      const current = String(signature ?? "");

      if (current === previousSignature) {
        repeats += 1;
        return repeats > limit
          ? APPLE_TOOL_CALL_EXHAUSTED
          : APPLE_TOOL_CALL_REPEAT;
      }

      previousSignature = current;
      repeats = 0;
      return APPLE_TOOL_CALL_RUN;
    },
  };
}

/**
 * Signature for a tool call. Arguments are compared as text so the tracker
 * stays independent of how the model formatted its JSON.
 */
export function appleToolCallSignature(name, argsText) {
  return `${String(name ?? "").trim()}::${String(argsText ?? "").trim()}`;
}
