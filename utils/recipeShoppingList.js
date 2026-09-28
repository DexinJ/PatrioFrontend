// utils/recipeShoppingList.js
//
// Pure helpers behind the recipe card's "add missing items" button.
//
// The card payload carries structured missing items ({ name, quantity }) that
// the backend produced, so nothing here parses publisher text. What is left is
// the bookkeeping: what can be added, what is already on the list, and whether
// the button should read as done.
//
// Delivered as a separate file: see the integration notes at the bottom for
// the edits that wire it into the card and the shopping-list store.

const MAX_ITEM_NAME_LENGTH = 120;
const MAX_ITEM_QUANTITY_LENGTH = 40;

const DEFAULT_SHOPPING_CATEGORIES = Object.freeze({
  storage: "Pantry",
  urgency: "Use soon",
});

function clip(value, maxLength) {
  // Numbers appear in hand-built or older payloads; coercing keeps the item
  // instead of dropping it.
  const text =
    typeof value === "number" && Number.isFinite(value)
      ? String(value)
      : typeof value === "string"
        ? value
        : "";
  return text.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

/**
 * Names are compared case-insensitively and with whitespace collapsed, so
 * "Beef  Broth" and "beef broth" are the same shopping-list item.
 */
export function normalizeShoppingItemName(value) {
  // NFC folds decomposed accents so "Café" and "Café" are one item.
  return String(value ?? "")
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function existingNameSet(items) {
  const names = new Set();
  for (const item of Array.isArray(items) ? items : []) {
    const name = normalizeShoppingItemName(
      typeof item === "string" ? item : item?.name
    );
    if (name) names.add(name);
  }
  return names;
}

/**
 * Splits incoming items into the ones worth adding and the ones the list
 * already has. Duplicates inside the incoming batch are collapsed too, so a
 * card whose missing items repeat cannot add the same row twice.
 */
export function planShoppingListAdditions(existingItems, incomingItems) {
  const existing = existingNameSet(existingItems);
  const seenInBatch = new Set();
  const additions = [];
  const skipped = [];

  for (const item of Array.isArray(incomingItems) ? incomingItems : []) {
    const source =
      item && typeof item === "object" && !Array.isArray(item) ? item : {};
    const name = clip(
      typeof item === "string" ? item : source.name,
      MAX_ITEM_NAME_LENGTH
    );
    if (!name) continue;
    const key = normalizeShoppingItemName(name);
    if (existing.has(key)) {
      skipped.push(name);
      continue;
    }
    // A repeat inside this batch is the card's own doing, not something the
    // list already had, so it collapses without being reported as skipped.
    if (seenInBatch.has(key)) continue;
    seenInBatch.add(key);
    additions.push({ ...source, name });
  }

  return { additions, skipped };
}

/**
 * The card payload, shaped for the shopping list. `inferFoodType` is optional;
 * when absent the item is added without categories, exactly as a user typing it
 * would be.
 */
export function shoppingItemsForRecipe(recipe, { inferFoodType } = {}) {
  const items = Array.isArray(recipe?.missingItems) ? recipe.missingItems : [];
  const output = [];
  for (const item of items) {
    const name = clip(item?.name, MAX_ITEM_NAME_LENGTH);
    if (!name) continue;
    const quantity = clip(item?.quantity, MAX_ITEM_QUANTITY_LENGTH) || "1";
    const foodType =
      typeof inferFoodType === "function" ? clip(inferFoodType(name), 40) : "";
    output.push(
      foodType
        ? {
            name,
            quantity,
            categories: { ...DEFAULT_SHOPPING_CATEGORIES, food_type: foodType },
          }
        : { name, quantity }
    );
  }
  return output;
}

/**
 * What the button needs to know: how many items it would add, how many are
 * already on the list, and whether it should read as done.
 *
 * Derived on every render rather than stored on the card — the card payload is
 * normalized on persistence and would drop a stored flag, and deriving keeps
 * the state correct when the user edits the shopping list directly.
 */
export function missingItemsStatus(recipe, shoppingListItems) {
  const items = shoppingItemsForRecipe(recipe);
  if (items.length === 0) {
    return { hasItems: false, total: 0, present: 0, absent: 0, allPresent: false };
  }
  const existing = existingNameSet(shoppingListItems);
  let present = 0;
  for (const item of items) {
    if (existing.has(normalizeShoppingItemName(item.name))) present += 1;
  }
  return {
    hasItems: true,
    total: items.length,
    present,
    absent: items.length - present,
    allPresent: present === items.length,
  };
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------
//
// context/GlobalContext.js uses `planShoppingListAdditions` in
// addManyToShoppingList, so names already on the list are skipped for every
// caller rather than only for this button.
// components/RecipeResultCards.js renders RecipeMissingItemsButton in the card
// and in the modal.
// utils/recipeCards.js keeps `missingItems` when a card is normalized for
// storage, so the button survives a reload.
//
// Who fills `missingItems`: the backend splits the publisher lines on the
// pantrio path, and for a custom API key or Apple AI it sends a `missingItems`
// task descriptor instead — api/recipeHelperRunner.js runs that on the user's
// own provider and merges `{ name, quantity }` back into the card.
