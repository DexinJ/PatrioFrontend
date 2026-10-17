import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

import { shouldRevealMenu } from "../utils/tabTutorials.js";

const require = createRequire(import.meta.url);
const en = require("../locales/en.json");
const zh = require("../locales/zh.json");
// The icon set the component renders with. A name that is not in here is drawn
// as a missing-glyph question mark on device, with no error anywhere.
const ioniconsGlyphs = require("@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json");

const source = readFileSync(
  new URL("../components/FridgeAddMenu.js", import.meta.url),
  "utf8"
);

function resolveKey(catalog, key) {
  return key.split(".").reduce((node, part) => node?.[part], catalog);
}

test("the fridge add menu registers both tutorial targets", () => {
  assert.match(source, /"fridge\.addButton"/);
  assert.match(source, /"fridge\.addOptions"/);
});

test("the fridge add menu keeps the reviewed row order", () => {
  const photo = source.indexOf('t("plusMenu.takeAPhoto")');
  const gallery = source.indexOf('t("plusMenu.pickFromGallery")');
  const manual = source.indexOf('t("fridge.addManually")');

  assert.ok(photo >= 0 && gallery >= 0 && manual >= 0);
  assert.ok(photo < gallery, "Take a photo comes before Choose from gallery");
  assert.ok(gallery < manual, "Choose from gallery comes before Add manually");
});

test("the new fridge copy exists in every locale", () => {
  const keys = [
    "fridge.addManually",
    "fridge.takePhotoA11y",
    "fridge.pickPhotoA11y",
    "fridge.photoPrompt",
    "fridge.photoDisplayText",
    "fridge.photoTitle",
    "fridge.photoFailed",
    "tutorial.tabs.fridge.addOptions.title",
    "tutorial.tabs.fridge.addOptions.body",
  ];

  for (const key of keys) {
    for (const [locale, catalog] of Object.entries({ en, zh })) {
      const value = resolveKey(catalog, key);
      assert.equal(typeof value, "string", `${locale} missing ${key}`);
      assert.ok(value.trim().length > 0, `${locale} blank ${key}`);
    }
  }
});

test("the reveal helper covers the fridge add step", () => {
  assert.equal(shouldRevealMenu("fridge", "addOptions"), true);
  assert.equal(shouldRevealMenu("fridge", "addButton"), false);
});

test("every Ionicons name in the fridge add menu exists in the icon set", () => {
  const names = [...source.matchAll(/icon:\s*"([^"]+)"/g)].map((match) => match[1]);

  assert.equal(names.length, 3, "expected one icon per row");
  for (const name of names) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(ioniconsGlyphs, name),
      `Ionicons has no "${name}" - it renders as a question mark on device`
    );
  }
});
