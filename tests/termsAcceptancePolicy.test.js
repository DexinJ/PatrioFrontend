import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  TERMS_ACCEPTANCE_REQUIRED,
  isTermsAcceptanceRequiredError,
  isTermsAcceptanceRequiredResponse,
  termsVersionFromPayload,
} = require("../api/termsAcceptancePolicy.cjs");

test("only the exact 403 code counts as the acceptance gate", () => {
  assert.equal(
    isTermsAcceptanceRequiredResponse(403, { code: TERMS_ACCEPTANCE_REQUIRED }),
    true
  );
  assert.equal(
    isTermsAcceptanceRequiredResponse(403, {
      code: "ACCOUNT_DELETION_IN_PROGRESS",
    }),
    false
  );
  assert.equal(
    isTermsAcceptanceRequiredResponse(401, { code: TERMS_ACCEPTANCE_REQUIRED }),
    false
  );
  assert.equal(isTermsAcceptanceRequiredResponse(403, null), false);
  assert.equal(
    isTermsAcceptanceRequiredResponse(410, { deletionStatus: "complete" }),
    false,
    "a deletion response must never be read as the acceptance gate"
  );
});

test("the version comes from the response and is never invented", () => {
  assert.equal(
    termsVersionFromPayload({ termsVersion: "2026-09-30" }),
    "2026-09-30"
  );
  assert.equal(termsVersionFromPayload({}), null);
  assert.equal(termsVersionFromPayload(undefined), null);
});

test("thrown errors carrying the code are recognised", () => {
  const error = Object.assign(new Error("blocked"), {
    code: TERMS_ACCEPTANCE_REQUIRED,
  });
  assert.equal(isTermsAcceptanceRequiredError(error), true);
  assert.equal(isTermsAcceptanceRequiredError(new Error("other")), false);
  assert.equal(isTermsAcceptanceRequiredError(null), false);
});
