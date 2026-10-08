// api/reasoningPolicy.js
//
// Explicit `reasoning_effort` for BYO (bring-your-own-key) providers.
//
// BYO requests always run at "none". The user's key pays for these calls, so
// there is no reasoning budget to spend, and on the GPT-5.6 generation the
// field is *required* whenever function tools are attached: omitting it lets
// the model default to "medium" and the API rejects the request. Sending
// "none" explicitly is what keeps tool calling working.
//
// The field cannot be sent unconditionally, because the model name is typed by
// the user (the Settings placeholder is literally `gpt-4o-mini`):
//   * gpt-4o / gpt-4o-mini reject `reasoning_effort` entirely.
//   * gpt-6-astra accepts the field but returns HTTP 400 for "none".
// Both cases would turn a working provider into a broken one, so the field is
// gated on the models known to accept it.
//
// Keep REASONING_EFFORT_MODELS in sync with CHAT_REASONING_EFFORT_MODELS in
// mobileSearcherBackend/src/config/policy.js.

export const REASONING_EFFORT_MODELS = Object.freeze([
  "gpt-5.6-terra",
  "gpt-5.6-luna",
]);

const REASONING_EFFORT_MODEL_SET = new Set(REASONING_EFFORT_MODELS);

/**
 * True when the model accepts an explicit `reasoning_effort`. Exact match
 * only: a prefix rule would let gpt-6-astra (which rejects "none") through.
 */
export function supportsReasoningEffort(model) {
  if (typeof model !== "string") return false;
  return REASONING_EFFORT_MODEL_SET.has(model.trim().toLowerCase());
}

/** The explicit effort for a BYO request, or undefined when the field must be
 * omitted. */
export function reasoningEffortFor(model) {
  return supportsReasoningEffort(model) ? "none" : undefined;
}

/** Returns `body` with an explicit `reasoning_effort`, or unchanged. */
export function withReasoningEffort(body, model) {
  if (!body || typeof body !== "object") return body;
  const effort = reasoningEffortFor(model);
  return effort ? { ...body, reasoning_effort: effort } : body;
}

/** Returns a copy of `body` without `reasoning_effort`. */
export function withoutReasoningEffort(body) {
  if (!body || typeof body !== "object") return body;
  const next = { ...body };
  delete next.reasoning_effort;
  return next;
}

/**
 * Did the provider reject the request because of `reasoning_effort`? Used to
 * retry once without the field, so a custom base URL that rejects unknown body
 * keys is never made worse by this change.
 */
export function isReasoningEffortRejection(status, payload) {
  if (status !== 400) return false;
  if (!payload || typeof payload !== "object") return false;
  try {
    return JSON.stringify(payload).toLowerCase().includes("reasoning_effort");
  } catch {
    return false;
  }
}

/**
 * Sends one request, retrying once with `reasoning_effort` removed if the
 * provider rejected it. `send(body)` must resolve to `{ ok, status, data }`
 * and must not throw for HTTP failures.
 */
export async function sendWithReasoningFallback({ body, model, send }) {
  const attempt = await send(withReasoningEffort(body, model));
  if (attempt?.ok) return attempt;
  if (!isReasoningEffortRejection(attempt?.status, attempt?.data)) {
    return attempt;
  }
  return send(withoutReasoningEffort(body));
}
