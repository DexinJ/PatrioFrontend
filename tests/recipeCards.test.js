import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeRecipeCard,
  normalizeRecipeCards,
  prioritizeMissingIngredients,
  visibleMissingIngredients,
} from "../utils/recipeCards.js";

const SAMPLE_RECIPE = {
  title: "  Chicken Stir Fry  ",
  url: "https://example.com/chicken-stir-fry",
  source: "Example Kitchen",
  caloriesPerServing: 420,
  nutritionConfidence: "publisher_provided",
  totalMinutes: 25,
  servings: 2,
  usedIngredients: ["Chicken", "soy sauce", "soy sauce", "Broccoli"],
  missingIngredients: ["2 cups rice", "1 tbsp sesame oil", "salt"],
  missingItems: [
    { name: "rice", quantity: "2 cups" },
    { name: "sesame oil", quantity: "1 tbsp" },
    { name: "salt", quantity: "1" },
  ],
  ingredients: ["Chicken", "soy sauce", "Broccoli", "2 cups rice"],
  // Legacy field: a card that still carries publisher steps must not surface
  // them. Only the authored summary and the step count render.
  instructions: ["Heat the pan.", "Cook the chicken.", "Serve hot."],
  method: ["Sear the chicken, then add the sauce.", "Serve over rice."],
  stepCount: 3,
  whyRecommended: "Uses 3 ingredients from your fridge.",
};

test("normalizeRecipeCard keeps only bounded, trusted card fields", () => {
  const card = normalizeRecipeCard(SAMPLE_RECIPE);
  assert.deepEqual(card, {
    title: "Chicken Stir Fry",
    url: "https://example.com/chicken-stir-fry",
    source: "Example Kitchen",
    caloriesPerServing: 420,
    totalMinutes: 25,
    servings: 2,
    nutritionConfidence: "publisher_provided",
    timeConfidence: "unknown",
    usedIngredients: ["Chicken", "soy sauce", "Broccoli"],
    missingIngredients: ["2 cups rice", "1 tbsp sesame oil", "salt"],
    missingItems: [
      { line: "2 cups rice", name: "rice", quantity: "2 cups" },
      { line: "1 tbsp sesame oil", name: "sesame oil", quantity: "1 tbsp" },
      { line: "salt", name: "salt", quantity: "1" },
    ],
    method: ["Sear the chicken, then add the sauce.", "Serve over rice."],
    stepCount: 3,
    whyRecommended: "Uses 3 ingredients from your fridge.",
    nearMatch: false,
  });
});

test("legacy publisher steps are dropped, never rendered", () => {
  const card = normalizeRecipeCard({
    title: "Old Card",
    url: "https://example.com/old",
    instructions: ["Simmer the sauce for twenty minutes.", "Serve."],
  });
  assert.equal("instructions" in card, false);
  assert.deepEqual(card.method, []);
  assert.equal(card.stepCount, 0);
});

test("method bullets are bounded in count and length", () => {
  const card = normalizeRecipeCard({
    title: "Long",
    url: "https://example.com/long",
    method: ["x".repeat(400), "One", "Two", "Three", "Four"],
    stepCount: 9.7,
  });
  assert.equal(card.method.length, 4);
  assert.equal(card.method[0].length, 160);
  assert.equal(card.stepCount, 9);
});

test("legacy cards without missingItems derive them from missingIngredients", () => {
  const legacy = {
    title: "Chicken Stir Fry",
    url: "https://example.com/chicken-stir-fry",
    missingIngredients: ["2 cups rice", "1 tbsp sesame oil", "salt", "2 cups rice"],
  };
  const card = normalizeRecipeCard(legacy);
  assert.deepEqual(card.missingIngredients, [
    "2 cups rice",
    "1 tbsp sesame oil",
    "salt",
  ]);
  assert.deepEqual(card.missingItems, [
    { line: "2 cups rice", name: "2 cups rice", quantity: "1" },
    { line: "1 tbsp sesame oil", name: "1 tbsp sesame oil", quantity: "1" },
    { line: "salt", name: "salt", quantity: "1" },
  ]);
});

test("explicit missingItems win over the legacy fallback", () => {
  const withMissingItems = {
    title: "Chicken Stir Fry",
    url: "https://example.com/chicken-stir-fry",
    missingIngredients: ["2 cups rice"],
    missingItems: [{ name: "rice", quantity: "2 cups" }],
  };
  assert.deepEqual(normalizeRecipeCard(withMissingItems).missingItems, [
    { line: "2 cups rice", name: "rice", quantity: "2 cups" },
  ]);
});

test("normalizeRecipeCards drops recipes without a title or safe URL", () => {
  const cards = normalizeRecipeCards([
    SAMPLE_RECIPE,
    { title: "No URL", instructions: ["x"] },
    { url: "javascript:alert(1)", title: "Bad scheme" },
    { title: "Pad 1", url: "https://example.com/pad-1" },
    { title: "Pad 2", url: "https://example.com/pad-2" },
    { title: "Pad 3", url: "https://example.com/pad-3" },
    { title: "Pad 4", url: "https://example.com/pad-4" },
    { title: "Pad 5", url: "https://example.com/pad-5" },
    { title: "Pad 6", url: "https://example.com/pad-6" },
    { title: "Pad 7", url: "https://example.com/pad-7" },
  ]);

  assert.equal(cards.length, 4);
  assert.equal(cards[0].title, "Chicken Stir Fry");
  assert.equal(cards.some((card) => card.title === "No URL"), false);
  assert.equal(cards.some((card) => card.title === "Bad scheme"), false);
});

test("near matches survive normalization with their label", () => {
  const [card] = normalizeRecipeCards([
    { ...SAMPLE_RECIPE, nearMatch: true },
  ]);
  assert.equal(card.nearMatch, true);

  const [exact] = normalizeRecipeCards([SAMPLE_RECIPE]);
  assert.equal(exact.nearMatch, false);
});

test("missing preview demotes pantry staples and reports hidden count", () => {
  const missing = [
    "2 cups rice",
    "salt",
    "1 lb chicken",
    "pepper",
    "water",
    "1 cup soy sauce",
  ];
  assert.deepEqual(prioritizeMissingIngredients(missing), [
    "2 cups rice",
    "1 lb chicken",
    "1 cup soy sauce",
    "salt",
    "pepper",
    "water",
  ]);

  assert.deepEqual(visibleMissingIngredients(missing), {
    items: ["2 cups rice", "1 lb chicken", "1 cup soy sauce"],
    hiddenCount: 3,
  });
  assert.deepEqual(visibleMissingIngredients(["salt", "pepper"]), {
    items: ["salt", "pepper"],
    hiddenCount: 0,
  });
});
