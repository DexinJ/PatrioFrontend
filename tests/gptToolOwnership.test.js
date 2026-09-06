import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

import babel from "@babel/core";
import transformModulesCommonJs from "@babel/plugin-transform-modules-commonjs";
import * as expiryPredictor from "../utils/expiryPredictor.js";
import * as fridgeProposal from "../utils/fridgeProposal.js";
import * as bulkProposal from "../utils/bulkProposal.js";

function loadToolOwnershipHelpers(contextValue = {}) {
  const source = readFileSync(
    new URL("../api/gptTools.js", import.meta.url),
    "utf8"
  );
  const { code } = babel.transformSync(source, {
    filename: "gptTools.js",
    plugins: [transformModulesCommonJs],
  });
  const module = { exports: {} };
  const require = (specifier) => {
    if (specifier === "react") return { useContext: () => contextValue };
    if (specifier === "../context/GlobalContext") {
      return { GlobalContext: {} };
    }
    if (specifier === "../utils/recipePreferences") {
      return { normalizeRecipePreferencePatch: (value) => value || {} };
    }
    if (specifier === "../utils/fridgeProposal") return fridgeProposal;
    if (specifier === "../utils/bulkProposal") return bulkProposal;
    if (specifier === "../utils/expiryPredictor") return expiryPredictor;
    throw new Error(`Unexpected test import: ${specifier}`);
  };
  vm.runInNewContext(
    `(function (require, module, exports) { ${code}\n})`,
    {},
    { filename: "gptTools.js" }
  )(require, module, module.exports);
  return module.exports;
}

test("mixed legacy batches assign only client tools and claim each ID once", () => {
  const { claimClientOwnedGPTToolCalls } = loadToolOwnershipHelpers();
  const claimedIds = new Set();
  const mixed = [
    { id: "server-search", function: { name: "webSearch" } },
    { id: "server-recipes", function: { name: "recommendRecipes" } },
    { id: "client-add", function: { name: "addFridgeItem" } },
  ];

  assert.deepEqual(
    claimClientOwnedGPTToolCalls(mixed, { claimedIds }).map(({ id }) => id),
    ["client-add"]
  );
  assert.deepEqual(
    claimClientOwnedGPTToolCalls(mixed, { claimedIds }).map(({ id }) => id),
    []
  );
  assert.deepEqual(
    claimClientOwnedGPTToolCalls([mixed[1]], {
      toolOwner: "client",
      round: 1,
      claimedIds,
    }).map(({ id }) => id),
    []
  );
});

test("explicit non-client ownership is never executed locally", () => {
  const { claimClientOwnedGPTToolCalls } = loadToolOwnershipHelpers();
  assert.equal(
    claimClientOwnedGPTToolCalls(
      [{ id: "unknown", function: { name: "addFridgeItem" } }],
      { toolOwner: "server" }
    ).length,
    0
  );
});

test("proposal tools acknowledge one confirmation card with semantic results", async () => {
  let messages = [];
  const setMessages = (updater) => {
    messages = typeof updater === "function" ? updater(messages) : updater;
  };
  const { useGPTTools } = loadToolOwnershipHelpers({ setMessages });
  const handlers = useGPTTools();

  const preference = await handlers.proposeRecipePreferenceUpdate({
    patch: { preferredCuisines: ["Thai"] },
    summary: "Prefer Thai recipes",
  });
  assert.equal(preference.ok, true);
  assert.equal(preference.proposalShown, true);
  assert.deepEqual(Array.from(preference.fields), ["preferredCuisines"]);
  assert.equal(messages[0].action.kind, "recipe_preference_update");

  const fridge = await handlers.proposeAddAllToFridge({
    items: [
      {
        name: "milk",
        quantity: "1 carton",
        categories: {
          storage: "Fridge",
          urgency: "Use soon",
          food_type: "Dairy",
        },
        expiresInDays: 7,
      },
    ],
  });
  assert.equal(fridge.ok, true);
  assert.equal(fridge.proposalShown, true);
  assert.equal(fridge.committed, false);
  assert.equal(fridge.itemCount, 1);
  assert.equal(
    fridge.message,
    "The add-to-fridge confirmation card is shown to the user. No items have been added to the fridge yet; the user must tap the card's button to confirm. Tell the user their items are ready to review and ask them to confirm on the card. Never say items were added or that the fridge was updated until the user confirms."
  );
  assert.equal(fridge.actionId, messages[1].action.actionId);
  assert.equal(messages[1].action.kind, "add_all_to_fridge");
  assert.match(messages[1].action.actionId, /^fridge-proposal-/);
  assert.equal(messages[1].id, messages[1].action.actionId);
  assert.equal(messages[1].action.status, "pending");
  assert.equal(messages[1].action.items[0].quantity, "1 carton");
  assert.deepEqual(
    JSON.parse(JSON.stringify(messages[1].action.items[0].categories)),
    {
      storage: "Fridge",
      urgency: "Use soon",
      food_type: "Dairy",
    }
  );
  assert.equal(messages[1].action.items[0].expiresInDays, 7);
});

const PRESET_TAG_SAMPLE = [
  { id: "t_storage_fridge", type: "storage", key: "fridge", label: "Fridge" },
  {
    id: "t_storage_freezer",
    type: "storage",
    key: "freezer",
    label: "Freezer",
  },
  {
    id: "t_urgency_use_soon",
    type: "urgency",
    key: "use_soon",
    label: "Use soon",
  },
  { id: "t_food_dairy", type: "food_type", key: "dairy", label: "Dairy" },
];

function loadHandlerContext({ fridgeItems = [] } = {}) {
  const calls = { editFridge: [], addFridge: [] };
  const messagesRef = { current: [] };
  const context = {
    fridgeItems,
    shoppingListItems: [],
    tags: PRESET_TAG_SAMPLE,
    setMessages(updater) {
      messagesRef.current =
        typeof updater === "function" ? updater(messagesRef.current) : updater;
    },
    addToFridge(name, quantity, tagIds, expiresAt, expiresInDays) {
      calls.addFridge.push({ name, quantity, tagIds, expiresAt, expiresInDays });
      return { id: `new-${calls.addFridge.length}` };
    },
    addToShoppingList() {},
    removeFromFridge() {},
    removeFromShoppingList() {},
    editFridgeItem(id, patch) {
      calls.editFridge.push({ id, patch });
    },
    editShoppingListItem() {},
    inferFoodTypeLabelFromName: () => "Dairy",
    streamlineLists: () => ({
      changed: { shopping: 0, fridge: 0 },
      items: { shopping: [], fridge: [] },
    }),
  };
  return { calls, context, messagesRef };
}

test("single-item edits convert typed categories to tagIds and expiry to whole days", async () => {
  const { calls, context } = loadHandlerContext({
    fridgeItems: [
      {
        id: "item-1",
        name: "Milk",
        quantity: "1",
        tagIds: [],
        expiresAt: null,
      },
    ],
  });
  const { useGPTTools } = loadToolOwnershipHelpers(context);
  const result = await useGPTTools().updateFridgeItem({
    id: "item-1",
    updates: {
      quantity: "2",
      categories: {
        storage: "Freezer",
        urgency: "Use soon",
        food_type: "Dairy",
      },
      expiresInDays: 30,
    },
  });

  assert.equal(result.success, true);
  assert.equal(calls.editFridge.length, 1);
  const patch = calls.editFridge[0].patch;
  assert.equal(patch.categories, undefined);
  assert.deepEqual(Array.from(patch.tagIds), [
    "t_storage_freezer",
    "t_urgency_use_soon",
    "t_food_dairy",
  ]);
  assert.match(patch.expiresAt, /^\d{4}-\d{2}-\d{2}T/);
});

test("single-item edits reject unknown category labels instead of wiping tags", async () => {
  const { calls, context } = loadHandlerContext({
    fridgeItems: [
      { id: "item-1", name: "Milk", quantity: "1", tagIds: [], expiresAt: null },
    ],
  });
  const { useGPTTools } = loadToolOwnershipHelpers(context);
  const result = await useGPTTools().updateFridgeItem({
    id: "item-1",
    updates: {
      categories: {
        storage: "Fridge",
        urgency: "Right now",
        food_type: "Dairy",
      },
    },
  });

  assert.equal(result.success, false);
  assert.match(result.message, /Invalid categories/);
  assert.equal(calls.editFridge.length, 0);
});

test("single-item edits reject legacy absolute expiry dates", async () => {
  const { calls, context } = loadHandlerContext({
    fridgeItems: [
      { id: "item-1", name: "Milk", quantity: "1", tagIds: [], expiresAt: null },
    ],
  });
  const { useGPTTools } = loadToolOwnershipHelpers(context);
  const result = await useGPTTools().updateFridgeItem({
    id: "item-1",
    updates: { expiresAt: "2026-09-10" },
  });

  assert.equal(result.success, false);
  assert.match(result.message, /expiresInDays/);
  assert.equal(calls.editFridge.length, 0);
});

test("bulk proposals carry tagIds and whole-day expiry, not calendar dates", async () => {
  const { context, messagesRef } = loadHandlerContext({
    fridgeItems: [
      {
        id: "item-1",
        name: "Milk",
        quantity: "1",
        tagIds: [],
        expiresAt: null,
      },
      {
        id: "item-2",
        name: "Eggs",
        quantity: "12",
        tagIds: [],
        expiresAt: null,
      },
    ],
  });
  const { useGPTTools } = loadToolOwnershipHelpers(context);
  const result = await useGPTTools().proposeBulkFridgeUpdate({
    title: "Review",
    changes: [
      {
        id: "item-1",
        update: {
          quantity: "2",
          categories: {
            storage: "Freezer",
            urgency: "Use soon",
            food_type: "Dairy",
          },
          expiresInDays: 30,
        },
      },
      { id: "item-2", remove: true },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.changeCount, 2);
  const actionMessage = messagesRef.current.find(
    (message) => message?.type === "ui_action"
  );
  assert.ok(actionMessage);
  assert.equal(actionMessage.action.kind, "bulk_fridge_update");
  const [editChange, removeChange] = actionMessage.action.changes;
  assert.deepEqual(Array.from(editChange.update.tagIds), [
    "t_storage_freezer",
    "t_urgency_use_soon",
    "t_food_dairy",
  ]);
  assert.equal(editChange.update.categories, undefined);
  assert.match(editChange.update.expiresAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.match(editChange.summary, /Freezer, Use soon, Dairy/);
  assert.equal(removeChange.remove, true);
});
