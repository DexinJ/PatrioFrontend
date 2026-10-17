import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

// The legacy sweep deletes storage it cannot attribute to an owner, and the
// legacy purge clears ownerless values for whoever asks. A guest is a device,
// not an account, so both paths must bail out before they reach one — otherwise
// opening the app in guest mode could destroy data left by a previously
// signed-in user on the same phone.
const SOURCE = readFileSync(join(process.cwd(), "api/storageKeys.js"), "utf8");

function exportedFunctionSource(name) {
  const start = SOURCE.indexOf(`export async function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist in api/storageKeys.js`);
  const nextExport = SOURCE.indexOf("\nexport ", start + 1);
  return SOURCE.slice(start, nextExport === -1 ? undefined : nextExport);
}

test("legacy migration bails out before touching storage for a guest owner", () => {
  const body = exportedFunctionSource("migrateLegacyAsyncStorageForUser");
  const guard = body.search(/isGuestStorageOwner\(uid\)/);
  const storageAccess = body.search(/withLegacyMigrationLock|AsyncStorage\./);

  assert.notEqual(guard, -1, "the guest guard must exist");
  assert.notEqual(storageAccess, -1, "the body should still do its real work");
  assert.ok(
    guard < storageAccess,
    "the guest guard must run before any storage access, or a guest can " +
      "trigger the ownerless-data sweep"
  );
});

test("legacy purge bails out before touching storage for a guest owner", () => {
  const body = exportedFunctionSource("clearLegacyStorageForUser");
  const guard = body.search(/isGuestStorageOwner\(uid\)/);
  const storageAccess = body.search(/withLegacyMigrationLock|AsyncStorage\./);

  assert.notEqual(guard, -1, "the guest guard must exist");
  assert.notEqual(storageAccess, -1, "the body should still do its real work");
  assert.ok(
    guard < storageAccess,
    "the guard must run before any storage access"
  );
});

test("the guard tests the uid argument directly", () => {
  for (const name of [
    "migrateLegacyAsyncStorageForUser",
    "clearLegacyStorageForUser",
  ]) {
    const body = exportedFunctionSource(name);
    // Testing a normalised local instead would run after normalizeUid had
    // already thrown for an ownerless value, and would not match the raw
    // argument the caller actually passes.
    assert.match(
      body,
      /if \(isGuestStorageOwner\(uid\)\) \{/,
      `${name} must test the uid argument directly`
    );
  }
});
