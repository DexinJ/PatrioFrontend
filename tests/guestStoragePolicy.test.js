import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  GUEST_OWNER_PREFIX,
  buildGuestStorageOwnerId,
  isAccountStorageOwner,
  isGuestStorageOwner,
} = require("../api/guestStoragePolicy.cjs");

test("a guest owner is recognisable and never mistaken for an account", () => {
  assert.equal(isGuestStorageOwner("guest:9f1c"), true);
  assert.equal(isGuestStorageOwner("  guest:9f1c  "), true);
  assert.equal(isGuestStorageOwner("firebase-uid"), false);
  assert.equal(isGuestStorageOwner(""), false);
  assert.equal(isGuestStorageOwner(null), false);
  assert.equal(isGuestStorageOwner(undefined), false);
});

test("guest ids are namespaced under a reserved prefix", () => {
  const owner = buildGuestStorageOwnerId("0b1c2d3e");
  assert.equal(owner, `${GUEST_OWNER_PREFIX}0b1c2d3e`);
  assert.equal(isGuestStorageOwner(owner), true);
  assert.throws(() => buildGuestStorageOwnerId(""), TypeError);
  assert.throws(() => buildGuestStorageOwnerId(null), TypeError);
  assert.throws(() => buildGuestStorageOwnerId(undefined), TypeError);
});

test("account-only operations can refuse a guest owner", () => {
  assert.equal(isAccountStorageOwner("firebase-uid"), true);
  assert.equal(isAccountStorageOwner("guest:9f1c"), false);
  assert.equal(isAccountStorageOwner(""), false);
  assert.equal(isAccountStorageOwner(null), false);
});

test("a realistic Firebase uid can never be read as a guest owner", () => {
  // The guards in storageKeys.js only fire for guest owners, so this is the
  // property that makes the change inert for every signed-in account.
  for (const uid of [
    "kJ8sQ2mNpR7vT4wXyZ1aB3cD5eF",
    "0b1c2d3e4f5a6b7c8d9e0f1a2b3c",
    "abc123",
  ]) {
    assert.equal(isGuestStorageOwner(uid), false, uid);
    assert.equal(isAccountStorageOwner(uid), true, uid);
  }
});

test("the legacy purge policy alone does not protect guests", () => {
  const { shouldClearLegacyOwnedData } = require("../api/legacyPurgePolicy.cjs");
  // Documents why storageKeys.js needs an explicit early return rather than
  // relying on this predicate: an ownerless legacy value is cleared for
  // whoever asks, including a guest.
  assert.equal(shouldClearLegacyOwnedData(null, "guest:9f1c"), true);
  assert.equal(shouldClearLegacyOwnedData("someone-else", "guest:9f1c"), false);
});
