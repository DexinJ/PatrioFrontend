import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import {
  AUTH_EMAIL_SEND_FAILED_KEY,
  AUTH_ERROR_MESSAGE_KEYS,
  authErrorCodeMessageKey,
  authErrorMessage,
  authErrorMessageKey,
  formatAuthErrorMessage,
} from "../auth/authErrorMessages.js";

const require = createRequire(import.meta.url);
const en = require("../locales/en.json");

function resolveKey(key) {
  return key.split(".").reduce((node, part) => node?.[part], en);
}

test("every mapped error code resolves to a real catalog entry", () => {
  for (const [code, key] of Object.entries(AUTH_ERROR_MESSAGE_KEYS)) {
    assert.equal(typeof resolveKey(key), "string", `${code} -> ${key}`);
  }
});

test("keys referenced through i18next.t exist", () => {
  // The catalog checker matches bare quoted translation calls but never the
  // i18next-prefixed form, because the preceding "." is in its excluded
  // character class. These call sites have no other guard, so a missing key
  // would reach users as raw text.
  for (const key of [
    "auth.changeEmailPasswordRequired",
    "auth.changeEmailNoAccount",
  ]) {
    assert.equal(typeof resolveKey(key), "string", key);
  }
});

test("known codes map and unknown codes do not", () => {
  assert.equal(
    authErrorMessageKey({ code: "auth/requires-recent-login" }),
    "auth.errorRequiresRecentLogin"
  );
  assert.equal(authErrorMessageKey({ code: "auth/made-up" }), null);
  assert.equal(authErrorMessageKey(null), null);
});

test("unmapped errors fall back to the supplied message", () => {
  assert.equal(authErrorMessage({ code: "auth/made-up" }, "custom"), "custom");
});

test("the email-send fallback and code lookup resolve to catalog entries", () => {
  assert.equal(typeof resolveKey(AUTH_EMAIL_SEND_FAILED_KEY), "string");
  assert.equal(
    authErrorCodeMessageKey("auth/quota-exceeded"),
    "auth.errorQuotaExceeded"
  );
  assert.equal(authErrorCodeMessageKey("auth/nope"), AUTH_EMAIL_SEND_FAILED_KEY);
  assert.equal(authErrorCodeMessageKey(null), AUTH_EMAIL_SEND_FAILED_KEY);
});

test("the raw code is appended only for development builds", () => {
  assert.equal(formatAuthErrorMessage("Nope", "auth/internal-error"), "Nope");
  assert.equal(
    formatAuthErrorMessage("Nope", "auth/internal-error", { isDev: true }),
    "Nope (auth/internal-error)"
  );
  assert.equal(formatAuthErrorMessage("Nope", null, { isDev: true }), "Nope");
});
