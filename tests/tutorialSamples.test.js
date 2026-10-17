import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

import { DEFAULT_ALMOST_EXPIRE_DAYS, getExpiryMeta } from "../utils/expiration.js";
import {
  TUTORIAL_CHAT_NOTICE_KEY,
  TUTORIAL_FRIDGE_SAMPLES,
  TUTORIAL_ITEMS_NOTICE_KEY,
  TUTORIAL_SAMPLE_CHAT,
  TUTORIAL_SAMPLE_ID_PREFIX,
  TUTORIAL_SHOPPING_SAMPLES,
  buildTutorialFridgeItems,
  buildTutorialSampleChat,
  buildTutorialShoppingItems,
  isTutorialSampleId,
  shouldShowTabSamples,
} from "../utils/tutorialSamples.js";

const require = createRequire(import.meta.url);
const en = require("../locales/en.json");
const zh = require("../locales/zh.json");

function resolveKey(catalog, key) {
  return key.split(".").reduce((node, part) => node?.[part], catalog);
}

const NOW = new Date("2026-01-10T12:00:00.000Z");
// Stands in for the live preset-tag map: deterministic ids, and `undefined` for
// a label that is not a real preset, so a typo shows up as a missing tag.
const labelToTagId = (label) =>
  Object.values(en.tags)
    .flatMap((section) => Object.values(section))
    .includes(label)
    ? `tag:${label}`
    : undefined;
const t = (key) => key;

test("every sample string exists in every locale", () => {
  const keys = [
    TUTORIAL_ITEMS_NOTICE_KEY,
    TUTORIAL_CHAT_NOTICE_KEY,
    ...TUTORIAL_FRIDGE_SAMPLES.map((sample) => sample.nameKey),
    ...TUTORIAL_SHOPPING_SAMPLES.map((sample) => sample.nameKey),
    ...TUTORIAL_SAMPLE_CHAT.map((message) => message.contentKey),
  ];

  for (const key of keys) {
    for (const [locale, catalog] of Object.entries({ en, zh })) {
      const value = resolveKey(catalog, key);
      assert.equal(typeof value, "string", `${locale} missing ${key}`);
      assert.ok(value.trim().length > 0, `${locale} blank ${key}`);
    }
  }
});

test("sample ids are unique, namespaced, and recognised", () => {
  const ids = [
    ...TUTORIAL_FRIDGE_SAMPLES.map((sample) => sample.id),
    ...TUTORIAL_SHOPPING_SAMPLES.map((sample) => sample.id),
    ...TUTORIAL_SAMPLE_CHAT.map((message) => message.id),
  ];

  assert.equal(new Set(ids).size, ids.length, "sample ids are unique");
  for (const id of ids) {
    assert.ok(id.startsWith(TUTORIAL_SAMPLE_ID_PREFIX), `${id} is namespaced`);
    assert.equal(isTutorialSampleId(id), true, `${id} is recognised`);
  }

  assert.equal(isTutorialSampleId("real-item-1"), false);
  assert.equal(isTutorialSampleId(undefined), false);
});

test("samples show only for the active, empty, matching tab", () => {
  const base = { isActive: true, activeTabKey: "fridge", tabKey: "fridge", itemCount: 0 };
  assert.equal(shouldShowTabSamples(base), true);

  assert.equal(shouldShowTabSamples({ ...base, isActive: false }), false);
  assert.equal(shouldShowTabSamples({ ...base, activeTabKey: "chat" }), false);
  assert.equal(shouldShowTabSamples({ ...base, itemCount: 1 }), false);
  // An unmeasured collection is not an empty one, so samples stay off.
  assert.equal(shouldShowTabSamples({ ...base, itemCount: undefined }), false);
  assert.equal(shouldShowTabSamples({ ...base, itemCount: NaN }), false);
  assert.equal(shouldShowTabSamples({ ...base, itemCount: "2" }), false);
  assert.equal(shouldShowTabSamples({ ...base, tabKey: undefined }), false);
});

test("fridge samples cover one expired, one expiring, and one fresh item", () => {
  const items = buildTutorialFridgeItems({ now: NOW, labelToTagId, t });
  assert.equal(items.length, 3);

  // Pinned to the same clock the samples were built from, so the test does not
  // drift with the real date.
  const metas = items.map((item) =>
    getExpiryMeta(item.expiresAt, DEFAULT_ALMOST_EXPIRE_DAYS, undefined, NOW)
  );
  assert.equal(metas.filter((meta) => meta.expired).length, 1, "one expired");
  assert.equal(
    metas.filter((meta) => !meta.expired && meta.almostExpired).length,
    1,
    "one expiring soon"
  );
  assert.equal(
    metas.filter((meta) => !meta.expired && !meta.almostExpired).length,
    1,
    "one fresh"
  );

  for (const item of items) {
    assert.ok(item.name.trim().length > 0, `${item.id} has a name`);
    assert.equal(isTutorialSampleId(item.id), true);
    assert.equal(item.tagIds.length, 4, `${item.id} carries all four tag types`);
    assert.ok(!Number.isNaN(new Date(item.expiresAt).getTime()));
  }

  // Two storage locations, so the storage pills are not all zero.
  const storages = new Set(
    TUTORIAL_FRIDGE_SAMPLES.map((sample) => sample.tagLabels.storage)
  );
  assert.ok(storages.size > 1, "samples span more than one storage location");
});

test("sample tag labels are real preset labels", () => {
  const sections = { food_type: "foodType" };
  const labelsFor = (section) =>
    Object.values(en.tags[sections[section] || section] || {});

  for (const sample of TUTORIAL_FRIDGE_SAMPLES) {
    for (const [section, label] of Object.entries(sample.tagLabels)) {
      assert.ok(
        labelsFor(section).includes(label),
        `${sample.id} ${section} "${label}" is not a preset label`
      );
    }
  }
  for (const sample of TUTORIAL_SHOPPING_SAMPLES) {
    assert.ok(
      labelsFor("food_type").includes(sample.categoryLabel),
      `${sample.id} category "${sample.categoryLabel}" is not a food type`
    );
  }
});

test("shopping samples span more than one aisle", () => {
  const items = buildTutorialShoppingItems({ now: NOW, labelToTagId, t });
  assert.equal(items.length, 3);

  const categories = new Set(items.map((item) => item.tagIds[0]));
  assert.equal(categories.size, items.length, "each sample is its own aisle");
  for (const item of items) {
    assert.ok(item.name.trim().length > 0, `${item.id} has a name`);
    assert.ok(String(item.quantity).trim().length > 0, `${item.id} has a quantity`);
  }
});

test("the sample conversation is text-only", () => {
  const messages = buildTutorialSampleChat(t);
  assert.equal(messages.length, 2);
  assert.deepEqual(
    messages.map((message) => message.role),
    ["user", "assistant"]
  );

  for (const message of messages) {
    assert.deepEqual(
      Object.keys(message).sort(),
      ["content", "id", "role"],
      "a sample message carries nothing a renderer could turn into an action"
    );
    assert.ok(message.content.length > 0);
  }
});
