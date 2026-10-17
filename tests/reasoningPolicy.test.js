import assert from "node:assert/strict";
import test from "node:test";

import {
  isReasoningEffortRejection,
  reasoningEffortFor,
  sendWithReasoningFallback,
  supportsReasoningEffort,
  withReasoningEffort,
  withoutReasoningEffort,
} from "../api/reasoningPolicy.js";

test("only models that accept reasoning_effort are marked as supporting it", () => {
  assert.equal(supportsReasoningEffort("gpt-5.6-luna"), true);
  assert.equal(supportsReasoningEffort("gpt-5.6-terra"), true);
  assert.equal(supportsReasoningEffort("  GPT-5.6-Luna  "), true);
  // These reject the field entirely.
  assert.equal(supportsReasoningEffort("gpt-4o"), false);
  assert.equal(supportsReasoningEffort("gpt-4o-mini"), false);
  // Astra accepts the field but returns HTTP 400 for "none", so it must not
  // be an exact match here.
  assert.equal(supportsReasoningEffort("gpt-6-astra"), false);
  assert.equal(supportsReasoningEffort(""), false);
  assert.equal(supportsReasoningEffort(undefined), false);
  assert.equal(supportsReasoningEffort(null), false);
  assert.equal(supportsReasoningEffort({ model: "gpt-5.6-luna" }), false);
});

test("the effort field is added for supported models and omitted otherwise", () => {
  const body = { model: "x", messages: [] };

  assert.deepEqual(withReasoningEffort(body, "gpt-5.6-luna"), {
    model: "x",
    messages: [],
    reasoning_effort: "none",
  });
  assert.deepEqual(withReasoningEffort(body, "gpt-4o-mini"), body);

  // Never mutates the caller's body.
  assert.equal(body.reasoning_effort, undefined);
});

test("BYO effort is always none, never a reasoning budget", () => {
  assert.equal(reasoningEffortFor("gpt-5.6-terra"), "none");
  assert.equal(reasoningEffortFor("gpt-5.6-luna"), "none");
  assert.equal(reasoningEffortFor("gpt-4o"), undefined);
  assert.equal(reasoningEffortFor("gpt-6-astra"), undefined);
});

test("only a 400 that names reasoning_effort counts as a rejection", () => {
  assert.equal(
    isReasoningEffortRejection(400, {
      error: { message: "Unsupported parameter: reasoning_effort" },
    }),
    true
  );
  assert.equal(
    isReasoningEffortRejection(400, { error: { message: "Bad request" } }),
    false
  );
  assert.equal(
    isReasoningEffortRejection(401, {
      error: { message: "Unsupported parameter: reasoning_effort" },
    }),
    false
  );
  assert.equal(isReasoningEffortRejection(400, null), false);
  assert.equal(isReasoningEffortRejection(400, "reasoning_effort"), false);
});

test("a rejected request is retried once without the field", async () => {
  const seen = [];
  const send = async (body) => {
    seen.push(body);
    if (seen.length === 1) {
      return {
        ok: false,
        status: 400,
        data: { error: { message: "Unsupported parameter: reasoning_effort" } },
      };
    }
    return { ok: true, status: 200, data: { choices: [] } };
  };

  const attempt = await sendWithReasoningFallback({
    body: { model: "gpt-5.6-luna" },
    model: "gpt-5.6-luna",
    send,
  });

  assert.equal(attempt.ok, true);
  assert.equal(seen.length, 2);
  assert.equal(seen[0].reasoning_effort, "none");
  assert.equal("reasoning_effort" in seen[1], false);
});

test("a successful request is sent once and unrelated failures are not retried", async () => {
  const okSeen = [];
  const ok = await sendWithReasoningFallback({
    body: { model: "gpt-5.6-luna" },
    model: "gpt-5.6-luna",
    send: async (body) => {
      okSeen.push(body);
      return { ok: true, status: 200, data: {} };
    },
  });
  assert.equal(ok.ok, true);
  assert.equal(okSeen.length, 1);
  assert.equal(okSeen[0].reasoning_effort, "none");

  const failSeen = [];
  const failed = await sendWithReasoningFallback({
    body: { model: "gpt-4o-mini" },
    model: "gpt-4o-mini",
    send: async (body) => {
      failSeen.push(body);
      return {
        ok: false,
        status: 429,
        data: { error: { message: "Rate limit reached" } },
      };
    },
  });
  assert.equal(failed.ok, false);
  assert.equal(failSeen.length, 1);
  assert.equal("reasoning_effort" in failSeen[0], false);
});

test("withoutReasoningEffort copies rather than mutates", () => {
  const body = { model: "x", reasoning_effort: "none" };
  assert.deepEqual(withoutReasoningEffort(body), { model: "x" });
  assert.equal(body.reasoning_effort, "none");
});
