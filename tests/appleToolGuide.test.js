import assert from "node:assert/strict";
import test from "node:test";

import { buildAppleToolGuide } from "../api/appleToolGuide.js";

// Mirrors the real categoriesField: required keys are enums, `state` is
// optional, and the same object is shared by several tools.
const categoriesField = {
  type: "object",
  properties: {
    storage: { type: "string", enum: ["Fridge", "Freezer", "Pantry"] },
    urgency: { type: "string", enum: ["Expired", "Eat first", "Use soon"] },
    food_type: { type: "string", enum: ["Produce", "Dairy"] },
    state: { type: "string", enum: ["Opened", "Whole"] },
  },
  required: ["storage", "urgency", "food_type"],
  additionalProperties: false,
};

const proposedItemField = {
  type: "object",
  properties: {
    name: { type: "string" },
    quantity: { type: "string" },
    categories: categoriesField,
    expiresInDays: { type: "integer", minimum: 1 },
  },
  required: ["name", "categories", "expiresInDays"],
  additionalProperties: false,
};

const directTools = [
  {
    type: "function",
    function: {
      name: "addShoppingItem",
      description: "Add an item to the shopping list.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          quantity: { type: "string" },
          categories: categoriesField,
        },
        required: ["name", "categories"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "proposeAddAllToFridge",
      description: "Show one confirmation card for a batch.",
      parameters: {
        type: "object",
        properties: {
          items: { type: "array", minItems: 1, items: proposedItemField },
          title: { type: "string" },
        },
        required: ["items"],
        additionalProperties: false,
      },
    },
  },
];

test("tool lines keep their existing signature format", () => {
  const guide = buildAppleToolGuide(directTools);

  assert.match(
    guide,
    /^addShoppingItem\(name, quantity, categories \[required: name, categories\]\): Add an item to the shopping list\.$/m
  );
});

test("argument shapes spell out required enum values", () => {
  const guide = buildAppleToolGuide(directTools);

  // The exact failure from the logs: the model sent arrays because it never
  // saw that categories is an object with these enumerated keys.
  assert.match(guide, /^Argument shapes:$/m);
  assert.match(
    guide,
    /^categories = \{storage: Fridge\|Freezer\|Pantry, urgency: Expired\|Eat first\|Use soon, food_type: Produce\|Dairy, state\?: Opened\|Whole\}$/m
  );
});

test("a shared shape is described once and referenced by name", () => {
  const guide = buildAppleToolGuide(directTools);
  const categoriesLines = guide
    .split("\n")
    .filter((line) => line.startsWith("categories = "));

  assert.equal(categoriesLines.length, 1);
  // Nested inside `items`, the shape is referenced rather than repeated.
  assert.match(
    guide,
    /^items = array of \{name: string, quantity\?: string, categories, expiresInDays: integer\}$/m
  );
});

test("top-level enums are described, nested ones stay inline", () => {
  const guide = buildAppleToolGuide([
    {
      type: "function",
      function: {
        name: "streamlineLists",
        description: "Normalize list items.",
        parameters: {
          type: "object",
          properties: {
            scope: {
              type: "string",
              enum: ["shopping", "fridge", "both"],
            },
          },
        },
      },
    },
  ]);

  assert.match(guide, /^scope = shopping\|fridge\|both$/m);
  // Only the top-level enum gets a line of its own.
  assert.equal(guide.split("\n").filter((l) => l.startsWith("scope")).length, 1);
});

test("long descriptions are truncated", () => {
  const guide = buildAppleToolGuide(
    [
      {
        type: "function",
        function: {
          name: "verbose",
          description: "x".repeat(500),
          parameters: { type: "object", properties: {} },
        },
      },
    ],
    { descriptionMaxChars: 10 }
  );

  assert.ok(guide.startsWith("verbose(none): xxxxxxxxxx"));
  assert.ok(!guide.includes("x".repeat(11)));
});

test("tools without structured arguments produce no shapes block", () => {
  const guide = buildAppleToolGuide([
    {
      type: "function",
      function: {
        name: "getFridgeContents",
        description: "Read all fridge items.",
        parameters: { type: "object", properties: {} },
      },
    },
  ]);

  assert.equal(guide, "getFridgeContents(none): Read all fridge items.");
  assert.ok(!guide.includes("Argument shapes"));
});

test("nullable types render as a union rather than a stray comma", () => {
  const guide = buildAppleToolGuide([
    {
      type: "function",
      function: {
        name: "setLimits",
        description: "Set optional limits.",
        parameters: {
          type: "object",
          properties: {
            maxCaloriesPerServing: { type: ["integer", "null"] },
            maxPrepMinutes: { type: ["integer", "null"] },
          },
        },
      },
    },
  ]);

  assert.match(guide, /^maxCaloriesPerServing = integer\|null$/m);
  assert.match(guide, /^maxPrepMinutes = integer\|null$/m);
  assert.ok(!guide.includes("integer,null"));
});

test("an empty or missing tool list is handled", () => {
  assert.equal(buildAppleToolGuide([]), "");
  assert.equal(buildAppleToolGuide(undefined), "");
});
