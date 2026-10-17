import assert from "node:assert/strict";
import test from "node:test";
import {
  emailChangeValidationError,
  isValidEmailAddress,
  needsEmailVerification,
  shouldPromptEmailVerification,
  suggestEmailCorrection,
} from "../utils/emailVerificationPolicy.js";

const passwordUser = (overrides = {}) => ({
  providerData: [{ providerId: "password" }],
  email: "sam@example.com",
  emailVerified: false,
  ...overrides,
});

test("only unverified password accounts need verification", () => {
  assert.equal(needsEmailVerification(passwordUser()), true);
  assert.equal(
    needsEmailVerification(passwordUser({ emailVerified: true })),
    false
  );
  assert.equal(needsEmailVerification(passwordUser({ email: "" })), false);
  assert.equal(
    needsEmailVerification({
      providerData: [{ providerId: "google.com" }],
      email: "a@b.com",
      emailVerified: false,
    }),
    false
  );
  assert.equal(
    needsEmailVerification({
      providerData: [{ providerId: "apple.com" }],
      email: "a@b.com",
      emailVerified: false,
    }),
    false
  );
  assert.equal(needsEmailVerification(null), false);
});

test("snooze suppresses the prompt until it expires", () => {
  const user = passwordUser();
  const now = 1_000_000;
  assert.equal(
    shouldPromptEmailVerification({ user, snoozedUntilMs: null, now }),
    true
  );
  assert.equal(
    shouldPromptEmailVerification({ user, snoozedUntilMs: now + 5_000, now }),
    false
  );
  assert.equal(
    shouldPromptEmailVerification({ user, snoozedUntilMs: now - 1, now }),
    true
  );
  assert.equal(
    shouldPromptEmailVerification({
      user: passwordUser({ emailVerified: true }),
      now,
    }),
    false
  );
});

test("domain suggestions preserve the local part", () => {
  assert.equal(suggestEmailCorrection("Sam@Gmial.com"), "Sam@gmail.com");
  assert.equal(suggestEmailCorrection("sam@gmial.com"), "sam@gmail.com");
  assert.equal(suggestEmailCorrection("sam@example.com"), null);
  assert.equal(suggestEmailCorrection("gmial.com"), null);
  assert.equal(suggestEmailCorrection(""), null);
});

test("email change validation rejects empty, malformed, and unchanged values", () => {
  assert.equal(emailChangeValidationError("", "a@b.com"), "EMPTY");
  assert.equal(emailChangeValidationError("nope", "a@b.com"), "INVALID");
  assert.equal(emailChangeValidationError("A@B.com", "a@b.com"), "UNCHANGED");
  assert.equal(emailChangeValidationError("c@d.com", "a@b.com"), null);
});

test("address validation accepts ordinary addresses only", () => {
  assert.equal(isValidEmailAddress("sam@example.com"), true);
  assert.equal(isValidEmailAddress(" nope "), false);
});
