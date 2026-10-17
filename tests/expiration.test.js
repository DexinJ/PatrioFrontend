import assert from "node:assert/strict";
import test from "node:test";
import { parseDateInputToIso } from "../utils/dateInput.js";
import { getExpiryMeta } from "../utils/expiration.js";
import {
  addDaysIso,
  isPlausibleExpiresAtIso,
  normalizeShelfLifeDays,
  toIsoOrNull,
} from "../utils/expiryPredictor.js";

test("calendar expiration dates remain valid through the selected local day", () => {
  const iso = parseDateInputToIso("2026-08-10");
  const expiration = new Date(iso);
  assert.equal(expiration.getHours(), 23);
  assert.equal(expiration.getMinutes(), 59);

  const noon = new Date(2026, 7, 10, 12, 0, 0);
  const meta = getExpiryMeta("2026-08-10", 2, undefined, noon);
  assert.equal(meta.expired, false);
  assert.equal(meta.daysUntil, 0);
  assert.equal(meta.daysUntilExpire, 0);
  assert.equal(meta.expiresAtMs, new Date(meta.expiresAtIso).getTime());
});

test("date-only normalization and predictions use local end-of-day semantics", () => {
  const normalized = new Date(toIsoOrNull("2026-08-10"));
  assert.equal(normalized.getHours(), 23);
  assert.equal(normalized.getMinutes(), 59);

  const predicted = new Date(addDaysIso(new Date(2026, 7, 10, 8).toISOString(), 2));
  assert.equal(predicted.getDate(), 12);
  assert.equal(predicted.getHours(), 23);
  assert.equal(predicted.getMinutes(), 59);
});

test("AI shelf-life day estimates are normalized and bounded", () => {
  assert.equal(normalizeShelfLifeDays(7), 7);
  assert.equal(normalizeShelfLifeDays("7"), 7);
  assert.equal(normalizeShelfLifeDays(7.4), 7);
  assert.equal(normalizeShelfLifeDays(0), null);
  assert.equal(normalizeShelfLifeDays(-3), null);
  assert.equal(normalizeShelfLifeDays("soon"), null);
  assert.equal(normalizeShelfLifeDays(36501), null);
});

test("absurd past and far-future AI dates are treated as implausible", () => {
  const now = new Date("2026-08-26T12:00:00.000Z");
  assert.equal(isPlausibleExpiresAtIso("1960-01-01T00:00:00.000Z", now), false);
  assert.equal(isPlausibleExpiresAtIso("1999-12-31T00:00:00.000Z", now), false);
  assert.equal(
    isPlausibleExpiresAtIso("2026-08-26T23:59:59.999Z", now),
    true
  );
  assert.equal(isPlausibleExpiresAtIso("2026-08-27T00:00:00.000Z", now), true);
  assert.equal(isPlausibleExpiresAtIso("9999-01-01T00:00:00.000Z", now), false);
  assert.equal(isPlausibleExpiresAtIso("not a date", now), false);
});
