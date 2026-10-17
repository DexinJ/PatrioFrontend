// api/guestStoragePolicy.cjs
// Pure helpers for device-local guest data. Kept in CommonJS so the unit tests
// can require them directly and so non-UI modules can use them without pulling
// in AsyncStorage. Same pattern as legacyPurgePolicy.cjs and
// termsAcceptancePolicy.cjs.

// A guest owner is a device, not an account. The prefix is reserved so a guest
// id can never be mistaken for a Firebase uid, and so account-only flows can
// refuse one by inspection instead of by remembering to check a separate flag.
const GUEST_OWNER_PREFIX = "guest:";

function normalizeOwner(value) {
  const owner = String(value || "").trim();
  return owner || null;
}

function isGuestStorageOwner(value) {
  const owner = normalizeOwner(value);
  return owner !== null && owner.startsWith(GUEST_OWNER_PREFIX);
}

function buildGuestStorageOwnerId(deviceId) {
  const id = normalizeOwner(deviceId);
  if (!id) {
    throw new TypeError("A device id is required for a guest storage owner.");
  }
  return `${GUEST_OWNER_PREFIX}${id}`;
}

// Firebase uids are alphanumeric, so they can never satisfy the guest prefix.
// This predicate exists so account-only operations can fail closed rather than
// relying on each caller to remember the check.
function isAccountStorageOwner(value) {
  const owner = normalizeOwner(value);
  return owner !== null && !isGuestStorageOwner(owner);
}

module.exports = {
  GUEST_OWNER_PREFIX,
  buildGuestStorageOwnerId,
  isAccountStorageOwner,
  isGuestStorageOwner,
};
