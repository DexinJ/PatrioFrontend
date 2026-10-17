import assert from "node:assert/strict";
import test from "node:test";

import {
  missingItemsStatus,
  normalizeShoppingItemName,
  planShoppingListAdditions,
  shoppingItemsForRecipe,
} from "../utils/recipeShoppingList.js";

const RECIPE = {
  title: "Beef Stew",
  missingIngredients: ["2 cups beef broth", "3 carrots", "salt"],
  missingItems: [
    { name: "beef broth", quantity: "2 cups" },
    { name: "carrots", quantity: "3" },
    { name: "salt", quantity: "1" },
  ],
};

test("names compare case-insensitively with collapsed whitespace", () => {
  assert.equal(
    normalizeShoppingItemName("  Beef   Broth "),
    normalizeShoppingItemName("beef broth")
  );
});

test("items already on the list are skipped, not duplicated", () => {
  const { additions, skipped } = planShoppingListAdditions(
    [{ name: "Beef Broth" }, { name: "carrots" }],
    [
      { name: "beef broth", quantity: "2 cups" },
      { name: "carrots", quantity: "3" },
      { name: "salt", quantity: "1" },
    ]
  );

  assert.deepEqual(additions, [{ name: "salt", quantity: "1" }]);
  assert.deepEqual(skipped, ["beef broth", "carrots"]);
});

test("duplicates inside the incoming batch collapse to one row", () => {
  const { additions } = planShoppingListAdditions([], [
    { name: "carrots", quantity: "3" },
    { name: "Carrots", quantity: "3" },
  ]);
  assert.equal(additions.length, 1);
});

test("an add that is entirely skipped returns nothing to add", () => {
  const { additions, skipped } = planShoppingListAdditions(
    [{ name: "beef broth" }],
    [{ name: "beef broth" }]
  );
  assert.deepEqual(additions, []);
  assert.deepEqual(skipped, ["beef broth"]);
});

test("recipe items carry name and quantity, and category when inferable", () => {
  assert.deepEqual(shoppingItemsForRecipe(RECIPE), [
    { name: "beef broth", quantity: "2 cups" },
    { name: "carrots", quantity: "3" },
    { name: "salt", quantity: "1" },
  ]);

  assert.deepEqual(
    shoppingItemsForRecipe(RECIPE, { inferFoodType: () => "Produce" })[1],
    {
      name: "carrots",
      quantity: "3",
      categories: {
        storage: "Pantry",
        urgency: "Use soon",
        food_type: "Produce",
      },
    }
  );
});

test("a card without structured items produces no button and no additions", () => {
  const legacy = {
    title: "Old Card",
    missingIngredients: ["2 cups beef broth"],
  };
  assert.deepEqual(shoppingItemsForRecipe(legacy), []);
  const status = missingItemsStatus(legacy, []);
  assert.equal(status.hasItems, false);
  assert.equal(status.allPresent, false);
});

test("status tracks what is left to add as the list changes", () => {
  const empty = missingItemsStatus(RECIPE, []);
  assert.deepEqual(empty, {
    hasItems: true,
    total: 3,
    present: 0,
    absent: 3,
    allPresent: false,
  });

  const partial = missingItemsStatus(RECIPE, [{ name: "Carrots" }]);
  assert.equal(partial.present, 1);
  assert.equal(partial.absent, 2);
  assert.equal(partial.allPresent, false);

  const complete = missingItemsStatus(RECIPE, [
    { name: "beef broth" },
    { name: "CARROTS" },
    { name: " salt " },
  ]);
  assert.equal(complete.allPresent, true);
  assert.equal(complete.absent, 0);

  // Removing an item flips the button back to addable.
  const removed = missingItemsStatus(RECIPE, [
    { name: "beef broth" },
    { name: "carrots" },
  ]);
  assert.equal(removed.allPresent, false);
  assert.equal(removed.absent, 1);
});

test("malformed entries are ignored rather than added", () => {
  const recipe = {
    missingItems: [
      { name: "", quantity: "1" },
      { quantity: "1" },
      null,
      { name: "  ok  ", quantity: "" },
    ],
  };
  assert.deepEqual(shoppingItemsForRecipe(recipe), [
    { name: "ok", quantity: "1" },
  ]);
});

test("numeric payload fields are coerced, not dropped", () => {
  assert.deepEqual(
    shoppingItemsForRecipe({
      missingItems: [
        { name: "carrots", quantity: 3 },
        { name: 5, quantity: "3" },
      ],
    }),
    [
      { name: "carrots", quantity: "3" },
      { name: "5", quantity: "3" },
    ]
  );
});

test("unicode forms of the same name count as one item", () => {
  assert.equal(
    normalizeShoppingItemName("Caf\u00e9"),
    normalizeShoppingItemName("Cafe\u0301")
  );

  const { additions, skipped } = planShoppingListAdditions(
    [{ name: "Cafe\u0301" }],
    [{ name: "Caf\u00e9" }]
  );
  assert.deepEqual(additions, []);
  assert.deepEqual(skipped, ["Caf\u00e9"]);
});

test("a repeat inside one batch collapses without being called a list duplicate", () => {
  const { additions, skipped } = planShoppingListAdditions([], [
    { name: "carrots", quantity: "3" },
    { name: "Carrots", quantity: "5" },
  ]);
  // The first one is added, the repeat is neither added nor reported as
  // already-on-the-list.
  assert.deepEqual(additions, [{ name: "carrots", quantity: "3" }]);
  assert.deepEqual(skipped, []);
});

test("items already on the list are still reported separately from batch repeats", () => {
  const { additions, skipped } = planShoppingListAdditions(
    [{ name: "carrots" }],
    [
      { name: "carrots", quantity: "3" },
      { name: "carrots", quantity: "3" },
      { name: "salt", quantity: "1" },
    ]
  );
  assert.deepEqual(additions, [{ name: "salt", quantity: "1" }]);
  assert.deepEqual(skipped, ["carrots", "carrots"]);
});
