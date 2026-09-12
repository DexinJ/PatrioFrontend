// utils/recipeCards.js
// Pure helpers that turn a recommendRecipes payload into the small recipe
// objects the chat history stores and the chat list renders as cards.
// Keeping this module free of React/i18n imports makes it unit-testable.

const MAX_RECIPE_CARDS = 4;
const MAX_STRING_LENGTH = 300;
const MAX_INGREDIENT_LENGTH = 160;
const MAX_INSTRUCTION_LENGTH = MAX_STRING_LENGTH;
const MAX_MISSING_INGREDIENTS = 30;
const MAX_USED_INGREDIENTS = 20;
const MAX_INSTRUCTIONS = 12;
const MAX_MISSING_PREVIEW_ITEMS = 3;

// Pantry staples are real "missing" ingredients but are rarely the reason a
// user cannot cook a recipe, so they are demoted in the card preview.
const STAPLE_TERMS = new Set([
  "water",
  "salt",
  "pepper",
  "black pepper",
  "oil",
  "olive oil",
  "vegetable oil",
  "cooking spray",
  "sugar",
]);

function clipText(value, maxLength = MAX_STRING_LENGTH) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function clipList(value, maxItems, maxLength = MAX_INGREDIENT_LENGTH) {
  if (!Array.isArray(value)) return [];
  const output = [];
  const seen = new Set();
  for (const entry of value) {
    const text = clipText(typeof entry === "string" ? entry : entry?.name, maxLength);
    if (!text) continue;
    const key = text.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(text);
    if (output.length >= maxItems) break;
  }
  return output;
}

/**
 * Addable shopping-list items, kept as objects. `clipList` would flatten them
 * to strings, which is why this has its own normalizer.
 */
function normalizeMissingItems(value, maxItems) {
  const output = [];
  for (const entry of Array.isArray(value) ? value : []) {
    const name = clipText(entry?.name, MAX_INGREDIENT_LENGTH);
    if (!name) continue;
    output.push({
      name,
      quantity: clipText(entry?.quantity, 40) || "1",
    });
    if (output.length >= maxItems) break;
  }
  return output;
}

function httpUrl(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.href
      : "";
  } catch {
    return "";
  }
}

function normalizeMissingToken(value) {
  return clipText(String(value || ""), 120)
    .toLocaleLowerCase()
    .replace(/[^a-z0-9\s]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isStapleIngredient(value) {
  const token = normalizeMissingToken(value);
  if (!token) return false;
  return [...STAPLE_TERMS].some((term) =>
    token.includes(normalizeMissingToken(term))
  );
}

/**
 * Orders missing ingredients so the card preview favors the items that are
 * actually important (proteins, produce, recipe-defining ingredients) over
 * pantry staples such as salt, pepper, oil, and water.
 */
export function prioritizeMissingIngredients(missing) {
  const items = clipList(missing, MAX_MISSING_INGREDIENTS);
  return [
    ...items.filter((item) => !isStapleIngredient(item)),
    ...items.filter((item) => isStapleIngredient(item)),
  ];
}

/**
 * Returns the compact "missing" preview used on a recipe card. When the
 * recipe is missing more than `maxVisible` items the preview shows the most
 * important few and reports how many were hidden ("...").
 */
export function visibleMissingIngredients(
  missing,
  { maxVisible = MAX_MISSING_PREVIEW_ITEMS } = {}
) {
  const ordered = prioritizeMissingIngredients(missing);
  const limit = Math.max(
    1,
    Math.min(MAX_MISSING_PREVIEW_ITEMS, Math.trunc(maxVisible) || 1)
  );
  if (ordered.length <= limit) {
    return { items: ordered, hiddenCount: 0 };
  }
  return { items: ordered.slice(0, limit), hiddenCount: ordered.length - limit };
}

export function normalizeRecipeCard(recipe) {
  const source = recipe && typeof recipe === "object" ? recipe : {};
  const title = clipText(source.title, 180);
  const url = httpUrl(source.url);
  if (!title || !url) return null;

  const caloriesPerServing = Number.isFinite(source.caloriesPerServing)
    ? source.caloriesPerServing
    : null;
  const totalMinutes = Number.isFinite(source.totalMinutes)
    ? source.totalMinutes
    : null;
  const servings = Number.isFinite(source.servings) ? source.servings : null;

  return {
    title,
    url,
    source: clipText(source.source, 120),
    caloriesPerServing,
    totalMinutes,
    servings,
    nutritionConfidence:
      source.nutritionConfidence === "ai_estimated" ||
      source.nutritionConfidence === "publisher_provided"
        ? source.nutritionConfidence
        : "unknown",
    timeConfidence:
      source.timeConfidence === "ai_estimated" ||
      source.timeConfidence === "publisher_provided"
        ? source.timeConfidence
        : "unknown",
    usedIngredients: clipList(source.usedIngredients, MAX_USED_INGREDIENTS),
    missingIngredients: clipList(
      source.missingIngredients,
      MAX_MISSING_INGREDIENTS
    ),
    // Structured, addable form of the same items. Kept so the card's
    // shopping-list button survives a reload.
    missingItems: normalizeMissingItems(
      source.missingItems,
      MAX_MISSING_INGREDIENTS
    ),
    instructions: clipList(
      source.instructions,
      MAX_INSTRUCTIONS,
      MAX_INSTRUCTION_LENGTH
    ),
    whyRecommended: clipText(source.whyRecommended, 240),
  };
}

/**
 * Bounds and cleans an array of recipes (from a WebSocket tool event or the
 * REST endpoint) for storage as a chat `recipe_cards` message.
 */
export function normalizeRecipeCards(value) {
  const recipes = Array.isArray(value) ? value : [];
  const output = [];
  for (const recipe of recipes) {
    const normalized = normalizeRecipeCard(recipe);
    if (!normalized) continue;
    output.push(normalized);
    if (output.length >= MAX_RECIPE_CARDS) break;
  }
  return output;
}
