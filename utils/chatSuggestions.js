// Starter prompts for the empty chat state.
//
// `action: "text"` sends the localized prompt as the user's first message.
// `action: "photo"` opens the camera instead, so the assistant can read a
// receipt or a shelf.
//
// Two of the three prompts are state-driven rather than fixed copy: the cook
// prompt names the meal that matches the local time, and the restock prompt is
// offered only when the fridge actually holds an expired item.
//
// `tests/chatSuggestions.test.js` proves every label and prompt exists in both
// `locales/en.json` and `locales/zh.json`, that the meal buckets tile the day,
// and that an expired item is the only thing that reveals the restock prompt.

export const CHAT_SUGGESTION_ACTION_TEXT = "text";
export const CHAT_SUGGESTION_ACTION_PHOTO = "photo";

// Meal buckets for the cook prompt, in local device hours as [from, to). The
// last bucket wraps past midnight so the three tile the whole day: the prompt
// must always name a meal, because a bare "what should I cook?" makes the
// assistant ask a clarifying question instead of returning recipes.
export const MEAL_BUCKETS = [
  { id: "breakfast", from: 5, to: 11 },
  { id: "lunch", from: 11, to: 17 },
  { id: "dinner", from: 17, to: 5 },
];

export function mealForDate(date = new Date()) {
  const hour = date.getHours();
  const bucket = MEAL_BUCKETS.find(({ from, to }) =>
    from < to ? hour >= from && hour < to : hour >= from || hour < to
  );
  return bucket?.id ?? MEAL_BUCKETS[MEAL_BUCKETS.length - 1].id;
}

// The context already marks each item "expired", "almost", or "ok". "almost"
// is not expired yet, so it stays out of the prompt.
export function hasExpiredItems(items) {
  return (Array.isArray(items) ? items : []).some(
    (item) => item?.expired === "expired"
  );
}

export const CHAT_SUGGESTIONS = [
  {
    id: "cook",
    action: CHAT_SUGGESTION_ACTION_TEXT,
    icon: "restaurant-outline",
    labelKey: "chat.suggestions.cookLabel",
    promptKey: "chat.suggestions.cookPrompt",
    meal: true,
  },
  {
    id: "expiredRestock",
    action: CHAT_SUGGESTION_ACTION_TEXT,
    icon: "cart-outline",
    labelKey: "chat.suggestions.expiredRestockLabel",
    promptKey: "chat.suggestions.expiredRestockPrompt",
    expiredRestock: true,
  },
  {
    id: "photo",
    action: CHAT_SUGGESTION_ACTION_PHOTO,
    icon: "camera-outline",
    labelKey: "chat.suggestions.photoLabel",
    promptKey: null,
  },
];
