import assert from "node:assert/strict";
import test from "node:test";
import {
  attemptAuthEmailSend,
  reportAuthEmailSendFailure,
  setAuthEmailSendReporter,
} from "../utils/authEmailSend.js";

test("a resolved send reports success", async () => {
  const result = await attemptAuthEmailSend({
    scope: "resend-verify",
    send: async () => {},
  });
  assert.deepEqual(result, { ok: true, code: null, messageKey: null });
});

test("a rejected send returns its code and mapped key", async () => {
  const error = Object.assign(new Error("nope"), {
    code: "auth/too-many-requests",
  });
  const result = await attemptAuthEmailSend({
    scope: "resend-verify",
    send: async () => {
      throw error;
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "auth/too-many-requests");
  assert.equal(result.messageKey, "auth.errorTooManyRequests");
});

test("an unknown code falls back to the generic send key", async () => {
  const error = Object.assign(new Error("nope"), { code: "auth/never-seen" });
  const result = await attemptAuthEmailSend({
    scope: "email-change",
    send: async () => {
      throw error;
    },
  });
  assert.equal(result.code, "auth/never-seen");
  assert.equal(result.messageKey, "auth.errorEmailSendFailed");
});

test("a rejection with no code still yields a usable key", async () => {
  const result = await attemptAuthEmailSend({
    scope: "sign-up-verify",
    send: async () => {
      throw new Error("boom");
    },
  });
  assert.equal(result.code, null);
  assert.equal(result.messageKey, "auth.errorEmailSendFailed");
});

test("the reporter receives the error, scope, and code", async () => {
  const seen = [];
  setAuthEmailSendReporter((error, context) =>
    seen.push([error.message, context])
  );
  const error = Object.assign(new Error("boom"), {
    code: "auth/internal-error",
  });
  await attemptAuthEmailSend({
    scope: "password-reset",
    send: async () => {
      throw error;
    },
  });
  setAuthEmailSendReporter(null);
  assert.deepEqual(seen, [
    ["boom", { scope: "password-reset", code: "auth/internal-error" }],
  ]);
});

test("a throwing reporter cannot escape the wrapper", async () => {
  setAuthEmailSendReporter(() => {
    throw new Error("reporter exploded");
  });
  const result = await attemptAuthEmailSend({
    scope: "resend-verify",
    send: async () => {
      throw new Error("boom");
    },
  });
  reportAuthEmailSendFailure(
    Object.assign(new Error("boom"), { code: "auth/internal-error" }),
    { scope: "email-change" }
  );
  setAuthEmailSendReporter(null);
  assert.equal(result.ok, false);
});

test("the direct reporter entry point normalizes a missing code", () => {
  const seen = [];
  setAuthEmailSendReporter((error, context) => seen.push(context));
  reportAuthEmailSendFailure(new Error("boom"), { scope: "email-change" });
  setAuthEmailSendReporter(null);
  assert.deepEqual(seen, [{ scope: "email-change", code: null }]);
});
