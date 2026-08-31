// utils/expiryPredictor.js
// Purpose: infer expiresAt when user doesn't provide one, based on tags.
// Pure utilities; GlobalContext can call predictExpiresAtIso(...)

const norm = (s) => String(s || "").trim().toLowerCase();

function dateOnlyToEndOfDayIso(value) {
  const match = String(value || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day, 23, 59, 59, 999);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date.toISOString();
}

export function addDaysIso(baseIso, days) {
  const base = new Date(baseIso);
  if (Number.isNaN(base.getTime())) return null;
  const normalizedDays = Number(days || 0);
  if (!Number.isFinite(normalizedDays)) return null;
  const expiration = new Date(
    base.getFullYear(),
    base.getMonth(),
    base.getDate() + Math.round(normalizedDays),
    23,
    59,
    59,
    999
  );
  return Number.isNaN(expiration.getTime()) ? null : expiration.toISOString();
}

export function toIsoOrNull(input) {
  if (input === null || input === undefined || input === "") return null;

  if (typeof input === "string") {
    const calendarDate = dateOnlyToEndOfDayIso(input);
    if (calendarDate) return calendarDate;
    const d = new Date(input);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? null : input.toISOString();
  }

  if (typeof input === "number") {
    const d = new Date(input);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  return null;
}

/**
 * pickTagLabel(tagIds, tagById, type)
 * - tagById is Map(tagId -> tagObject)
 * - returns the *label* (e.g. "Fridge") for the first tag matching `type`
 */
export function pickTagLabel(tagIds, tagById, type) {
  const ids = Array.isArray(tagIds) ? tagIds : [];
  for (const id of ids) {
    const t = tagById?.get?.(id);
    if (t?.type === type) return t.label || "";
  }
  return "";
}

// Heuristic defaults (tune anytime)
export function estimateShelfLifeDays({ storage, urgency, foodType, state }) {
  const s = norm(storage);
  const f = norm(foodType);
  const st = norm(state);

  let baseDays = 10;

  if (s === "freezer") {
    if (f === "meat" || f === "seafood") baseDays = 180;
    else if (f === "prepared") baseDays = 90;
    else baseDays = 120;
  } else if (s === "pantry") {
    if (f === "produce") baseDays = st === "cut" ? 3 : 7;
    else if (f === "bakery") baseDays = 5;
    else if (f === "dairy" || f === "meat" || f === "seafood" || f === "prepared") baseDays = 3;
    else if (f === "condiments") baseDays = st === "opened" ? 60 : 180;
    else if (f === "snacks" || f === "beverages") baseDays = 120;
    else baseDays = 60;
  } else {
    // Default: Fridge
    if (f === "prepared" || st === "cooked") baseDays = 4;
    else if ((f === "meat" || f === "seafood") && st === "raw") baseDays = 2;
    else if (f === "meat" || f === "seafood") baseDays = 3;
    else if (f === "dairy") baseDays = st === "opened" ? 7 : 10;
    else if (f === "produce") baseDays = st === "cut" ? 3 : 7;
    else if (f === "bakery") baseDays = 5;
    else if (f === "condiments") baseDays = st === "opened" ? 60 : 120;
    else if (f === "snacks" || f === "beverages") baseDays = 30;
    else baseDays = 10;
  }

  // Safety caps
  if (s !== "freezer" && (f === "prepared" || st === "cooked")) {
    baseDays = Math.min(baseDays, 4);
  }
  if (s !== "freezer" && (f === "meat" || f === "seafood") && st === "raw") {
    baseDays = Math.min(baseDays, 2);
  }

  // urgency currently unused, but left here so you can incorporate it later
  void urgency;

  return baseDays;
}

/**
 * predictExpiresAtIso({ createdAtIso, tagIds, tagById })
 * Uses tags (storage/urgency/food_type/state) to estimate shelf life and returns expiresAt ISO.
 */
export function predictExpiresAtIso({ createdAtIso, tagIds, tagById }) {
  const storage = pickTagLabel(tagIds, tagById, "storage");
  const urgency = pickTagLabel(tagIds, tagById, "urgency");
  const foodType = pickTagLabel(tagIds, tagById, "food_type");
  const state = pickTagLabel(tagIds, tagById, "state");

  const days = estimateShelfLifeDays({ storage, urgency, foodType, state });
  return addDaysIso(createdAtIso, days);
}

// Maximum shelf life the app accepts from AI day estimates or absolute
// dates (matches the manual item form's cap).
export const MAX_SHELF_LIFE_DAYS = 36_500;

/**
 * normalizeShelfLifeDays(value)
 * Accepts an AI "days until expiry" estimate and returns a sane integer,
 * or null when missing/out of range. Rejects 0, negatives, non-numeric
 * values, and estimates beyond the app-wide cap.
 */
export function normalizeShelfLifeDays(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return null;
  if (n < 1 || n > MAX_SHELF_LIFE_DAYS) return null;
  return n;
}

/**
 * isPlausibleExpiresAtIso(value, now?)
 * Guards against hallucinated absolute dates (e.g. 1960) before they are
 * stored: the date must parse, not be in the past, and not be absurdly far
 * in the future.
 */
export function isPlausibleExpiresAtIso(value, now = new Date()) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return false;
  const nowMs = now.getTime();
  if (Number.isNaN(nowMs)) return false;
  const diffMs = d.getTime() - nowMs;
  return diffMs >= 0 && diffMs <= MAX_SHELF_LIFE_DAYS * 86_400_000;
}
