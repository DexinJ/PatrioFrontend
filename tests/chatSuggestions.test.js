import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

import {
  CHAT_SUGGESTIONS,
  CHAT_SUGGESTION_ACTION_PHOTO,
  CHAT_SUGGESTION_ACTION_TEXT,
  MEAL_BUCKETS,
  hasExpiredItems,
  mealForDate,
} from "../utils/chatSuggestions.js";

const require = createRequire(import.meta.url);
const en = require("../locales/en.json");
const zh = require("../locales/zh.json");
// The icon set the chips render with. A name that is not in here is drawn as a
// missing-glyph question mark on device, with no error anywhere.
const ioniconsGlyphs = require("@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json");

function resolveKey(catalog, key) {
  return key.split(".").reduce((node, part) => node?.[part], catalog);
}

test("suggestion ids are unique", () => {
  const ids = CHAT_SUGGESTIONS.map((suggestion) => suggestion.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("every suggestion label and prompt exists in every locale", () => {
  for (const suggestion of CHAT_SUGGESTIONS) {
    for (const key of [suggestion.labelKey, suggestion.promptKey].filter(Boolean)) {
      for (const [locale, catalog] of Object.entries({ en, zh })) {
        const value = resolveKey(catalog, key);
        assert.equal(typeof value, "string", `${locale} missing ${key}`);
        assert.ok(value.trim().length > 0, `${locale} blank ${key}`);
      }
    }
  }
});

test("text suggestions carry a prompt and the photo suggestion does not", () => {
  for (const suggestion of CHAT_SUGGESTIONS) {
    if (suggestion.action === CHAT_SUGGESTION_ACTION_TEXT) {
      assert.ok(suggestion.promptKey, `${suggestion.id} needs a prompt`);
    } else {
      assert.equal(suggestion.action, CHAT_SUGGESTION_ACTION_PHOTO);
      assert.equal(suggestion.promptKey, null);
    }
  }
});

test("exactly one suggestion opens the camera", () => {
  const photo = CHAT_SUGGESTIONS.filter(
    (suggestion) => suggestion.action === CHAT_SUGGESTION_ACTION_PHOTO
  );
  assert.equal(photo.length, 1);
});

test("every suggestion icon exists in the Ionicons set", () => {
  for (const suggestion of CHAT_SUGGESTIONS) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(ioniconsGlyphs, suggestion.icon),
      `Ionicons has no "${suggestion.icon}" - it renders as a question mark on device`
    );
  }
});

test("meal buckets tile every hour of the day", () => {
  const seen = new Set();
  for (let hour = 0; hour < 24; hour += 1) {
    const meal = mealForDate(new Date(2026, 0, 1, hour, 30));
    assert.ok(
      MEAL_BUCKETS.some((bucket) => bucket.id === meal),
      `hour ${hour} produced "${meal}"`
    );
    seen.add(meal);
  }
  assert.deepEqual([...seen].sort(), ["breakfast", "dinner", "lunch"]);
});

test("the meal changes at the bucket edges", () => {
  const mealAt = (hour) => mealForDate(new Date(2026, 0, 1, hour, 0));
  assert.equal(mealAt(4), "dinner");
  assert.equal(mealAt(5), "breakfast");
  assert.equal(mealAt(10), "breakfast");
  assert.equal(mealAt(11), "lunch");
  assert.equal(mealAt(16), "lunch");
  assert.equal(mealAt(17), "dinner");
  assert.equal(mealAt(23), "dinner");
});

test("only an expired item reveals the restock prompt", () => {
  assert.equal(hasExpiredItems(undefined), false);
  assert.equal(hasExpiredItems([]), false);
  assert.equal(hasExpiredItems([{ expired: "ok" }]), false);
  assert.equal(hasExpiredItems([{ expired: "almost" }]), false);
  assert.equal(hasExpiredItems([{ expired: "ok" }, { expired: "expired" }]), true);
});

test("every bucket has a meal name in every locale", () => {
  for (const [locale, catalog] of Object.entries({ en, zh })) {
    for (const bucket of MEAL_BUCKETS) {
      const value = resolveKey(catalog, `chat.suggestions.meals.${bucket.id}`);
      assert.equal(typeof value, "string", `${locale} missing meals.${bucket.id}`);
      assert.ok(value.trim().length > 0, `${locale} blank meals.${bucket.id}`);
    }
  }
});

test("the cook prompt keeps its placeholder", () => {
  for (const [locale, catalog] of Object.entries({ en, zh })) {
    for (const key of ["chat.suggestions.cookLabel", "chat.suggestions.cookPrompt"]) {
      assert.match(
        resolveKey(catalog, key),
        /\{\{meal\}\}/,
        `${locale} ${key} would print the placeholder literally`
      );
    }
  }
});
