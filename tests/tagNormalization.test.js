import assert from "node:assert/strict";
import test from "node:test";

import { normalizeToPresetTagIds } from "../utils/tags.js";

const TAGS = [
  { id: "t_storage_fridge", type: "storage", key: "fridge", label: "Fridge" },
  { id: "t_storage_freezer", type: "storage", key: "freezer", label: "Freezer" },
  {
    id: "t_urgency_use_soon",
    type: "urgency",
    key: "use_soon",
    label: "Use soon",
  },
  { id: "t_food_dairy", type: "food_type", key: "dairy", label: "Dairy" },
];

const tagById = new Map(TAGS.map((tag) => [tag.id, tag]));

test("typed object categories normalize to preset tag ids in canonical order", () => {
  assert.deepEqual(
    normalizeToPresetTagIds({
      categories: {
        storage: "Fridge",
        urgency: "Use soon",
        food_type: "Dairy",
      },
      tags: TAGS,
      tagById,
    }),
    ["t_storage_fridge", "t_urgency_use_soon", "t_food_dairy"]
  );
});

test("typed object categories skip empty state and dedupe repeated ids", () => {
  assert.deepEqual(
    normalizeToPresetTagIds({
      categories: {
        storage: "Fridge",
        urgency: "",
        food_type: "Dairy",
        state: " ",
      },
      tags: TAGS,
      tagById,
    }),
    ["t_storage_fridge", "t_food_dairy"]
  );
});

test("legacy array, id-list, and comma-string forms keep working", () => {
  assert.deepEqual(
    normalizeToPresetTagIds({
      categories: ["Fridge", "Use soon", "Dairy"],
      tags: TAGS,
      tagById,
    }),
    ["t_storage_fridge", "t_urgency_use_soon", "t_food_dairy"]
  );
  assert.deepEqual(
    normalizeToPresetTagIds({
      categories: ["t_storage_freezer", "t_food_dairy"],
      tags: TAGS,
      tagById,
    }),
    ["t_storage_freezer", "t_food_dairy"]
  );
  assert.deepEqual(
    normalizeToPresetTagIds({
      categories: "Fridge, Use soon",
      tags: TAGS,
      tagById,
    }),
    ["t_storage_fridge", "t_urgency_use_soon"]
  );
});
