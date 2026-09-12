const objectSchema = (properties, required = []) => ({
  type: "object",
  properties,
  ...(required.length ? { required } : {}),
  additionalProperties: false,
});

const stringArray = (maxItems) => ({
  type: "array",
  items: { type: "string" },
  maxItems,
});

export const RECOMMEND_RECIPES_TOOL = {
  type: "function",
  function: {
    name: "recommendRecipes",
    description:
      "Find and rank real recipes using the user's trusted fridge inventory and saved recipe preferences. Search fresh on every request and never avoid a recipe because it was shown before. Use for recipe ideas, meal ideas, and 'what can I cook?' requests. Call once. A follow-up after a previous recipe answer is a NEW request: pass only constraints from the latest user message. If the user names an ingredient to use (or a single fridge item is selected), only return recipes that contain it. Include only constraints stated for this meal; the app supplies saved defaults and fridge items separately.",
    parameters: objectSchema({
      dishQuery: {
        type: ["string", "null"],
        description:
          "The dish the user named, written in the user's own language exactly as they said it (for example 'tomato egg stir fry', '番茄炒蛋'). Set this whenever the user names a dish. Never translate it and never duplicate it into mustUseIngredients. Null when the user listed ingredients instead of naming a dish.",
      },
      preferredCuisines: {
        ...stringArray(5),
        description: "Cuisines requested for this meal.",
      },
      energyPreference: {
        type: "string",
        enum: ["any", "light", "balanced", "hearty"],
      },
      maxCaloriesPerServing: {
        type: ["integer", "null"],
        minimum: 100,
        maximum: 2500,
      },
      maxPrepMinutes: {
        type: ["integer", "null"],
        minimum: 5,
        maximum: 480,
      },
      mealType: {
        type: ["string", "null"],
        enum: ["breakfast", "lunch", "dinner", "snack", "dessert"],
        description: "Requested meal type for this meal.",
      },
      skillLevel: {
        type: ["string", "null"],
        enum: ["beginner", "intermediate", "advanced"],
        description:
          "Cooking skill level requested. Only pass it when the user states a skill or difficulty; never invent one.",
      },
      cookingMethod: {
        type: ["string", "null"],
        enum: [
          "air_fryer",
          "instant_pot",
          "one_pot",
          "sheet_pan",
          "grill",
          "stovetop",
          "oven",
        ],
        description:
          "Cooking method the user asked for (e.g. air fryer, Instant Pot, one pot, sheet pan). Only pass it when the user states a method; never invent one.",
      },
      maxIngredients: {
        type: ["integer", "null"],
        minimum: 3,
        maximum: 30,
        description:
          "Maximum number of ingredients the user is willing to use. Only pass it when the user states a count.",
      },
      dietaryPatterns: stringArray(8),
      mustUseIngredients: stringArray(20),
      excludedIngredients: stringArray(20),
      servings: { type: "integer", minimum: 1, maximum: 12 },
      resultCount: { type: "integer", minimum: 1, maximum: 4 },
    }),
  },
};

export const PROPOSE_RECIPE_PREFERENCE_UPDATE_TOOL = {
  type: "function",
  function: {
    name: "proposeRecipePreferenceUpdate",
    description:
      "Show a confirmation card for saving persistent recipe preferences. Use when the user asks to remember/save/always/usually prefer something, or clearly states a durable allergy or dietary pattern. This does not save by itself. Never use it for a one-meal constraint such as 'no peanuts tonight'.",
    parameters: objectSchema(
      {
        operation: {
          type: "string",
          enum: ["merge", "remove", "replace"],
          description:
            "Use merge to add preferences (default), remove to delete named list values, and replace only when the user explicitly asks to replace or clear a field.",
        },
        patch: objectSchema({
          preferredCuisines: stringArray(20),
          dislikedCuisines: stringArray(20),
          allergens: stringArray(20),
          dietaryPatterns: stringArray(20),
          excludedIngredients: stringArray(30),
          dislikedIngredients: stringArray(30),
          preferredEnergy: {
            type: "string",
            enum: ["any", "light", "balanced", "hearty"],
          },
          maxCaloriesPerServing: {
            type: ["integer", "null"],
            minimum: 100,
            maximum: 2500,
          },
          maxPrepMinutes: {
            type: ["integer", "null"],
            minimum: 5,
            maximum: 480,
          },
          defaultServings: { type: "integer", minimum: 1, maximum: 12 },
        }),
        summary: { type: "string", maxLength: 160 },
      },
      ["patch"]
    ),
  },
};

const RECIPE_LANGUAGE =
  /\b(recipe|recipes|meal ideas?|dish ideas?|what (?:can|should) i (?:cook|make|eat)|what to (?:cook|make|eat)|breakfast ideas?|lunch ideas?|dinner ideas?|snack ideas?|(?:suggest|recommend|find|want|feel like|craving)\b.{0,40}\b(?:food|meal|dish|recipe|breakfast|lunch|dinner)|something (?:light|healthy|quick|hearty)(?: to eat)?|(?:under|below|less than) \d{2,4} calories|low[- ]calorie)\b/i;
const PERSISTENT_PREFERENCE_LANGUAGE =
  /\b(remember|save (?:that|my)|always|usually|set my (?:recipe|food|meal)|my (?:recipe|food|meal) preferences?)\b/i;

const MEAL_REQUEST_TERMS = {
  en: [
    "breakfast",
    "brunch",
    "lunch",
    "dinner",
    "supper",
    "snack",
    "dessert",
    "meal",
    "recipe",
    "recipes",
    "dish",
    "dishes",
  ],
  zh: [
    "早餐",
    "午饭",
    "午餐",
    "晚饭",
    "晚餐",
    "甜点",
    "点心",
    "零食",
    "食谱",
    "菜",
  ],
};

const RECIPE_VARIATION_TERMS = {
  en: [
    "more",
    "another",
    "other",
    "else",
    "different",
    "new ideas",
    "next",
  ],
  zh: ["更多", "别的", "其他", "其他的", "换", "再", "新"],
};

function assistantResponseText(message) {
  if (!message) return "";
  if (typeof message?.content === "string") return message.content;
  if (Array.isArray(message?.content)) {
    return message.content
      .map((part) => part?.text || "")
      .join(" ")
      .trim();
  }
  // Structured chat messages (for example recipe cards) carry their short
  // conversational placeholder in a top-level text field.
  if (typeof message?.text === "string") return message.text;
  return "";
}

export function inferChatIntent({
  text,
  imageUri,
  intent,
  history = [],
  language = "en",
} = {}) {
  if (intent === "recipe_recommendation") return intent;
  if (intent === "chat") return intent;
  if (String(imageUri || "").trim()) return "chat";

  const message = String(text || "").trim();
  if (!message || PERSISTENT_PREFERENCE_LANGUAGE.test(message)) return "chat";
  if (RECIPE_LANGUAGE.test(message)) return "recipe_recommendation";

  const normalized = message.toLowerCase();
  const isChinese = String(language || "").toLowerCase().startsWith("zh");
  const mealTerms = isChinese
    ? MEAL_REQUEST_TERMS.zh
    : MEAL_REQUEST_TERMS.en;
  if (mealTerms.some((term) => normalized.includes(term))) {
    return "recipe_recommendation";
  }

  // Variation follow-ups ("more", "something else", "换一个") only count when
  // the previous assistant turn was a recipe answer, so ordinary chat is not
  // hijacked.
  const priorAssistant = [...(Array.isArray(history) ? history : [])]
    .reverse()
    .find((entry) => entry?.role === "assistant");
  const priorText = assistantResponseText(priorAssistant).toLowerCase();
  const wasRecipeAnswer =
    /recipe|recommend|suggest|idea|推荐|食谱|做法/i.test(priorText);
  if (!wasRecipeAnswer) return "chat";
  const variationTerms = isChinese
    ? RECIPE_VARIATION_TERMS.zh
    : RECIPE_VARIATION_TERMS.en;
  return variationTerms.some((term) => normalized.includes(term))
    ? "recipe_recommendation"
    : "chat";
}

export function buildRecipeContext({
  fridgeItems,
  settings,
  selectedIngredients = [],
  language = "en",
} = {}) {
  return {
    inventory: (Array.isArray(fridgeItems) ? fridgeItems : [])
      .slice(0, 100)
      .map((item) => ({
        name: String(item?.name || "").trim().slice(0, 120),
        quantity: String(item?.quantity || "").trim().slice(0, 80),
      }))
      .filter(({ name }) => name),
    selectedIngredients: (Array.isArray(selectedIngredients)
      ? selectedIngredients
      : [])
      .map((item) => String(item?.name ?? item ?? "").trim().slice(0, 80))
      .filter(Boolean)
      .slice(0, 30),
    preferences: settings?.recipePreferences || {},
    // The language the user set in the app. The backend searches for the dish
    // in this language and returns the results adapted to it.
    language,
  };
}

// Read-only fridge reader, offered in recipe mode so the model can see what the
// user actually has before it asks for recommendations. Defined here rather
// than imported from gpt.js, which imports this module.
export const GET_FRIDGE_CONTENTS_TOOL = {
  type: "function",
  function: {
    name: "getFridgeContents",
    description: "Read-only: get all fridge items.",
    parameters: objectSchema({}),
  },
};

/**
 * Same forced two-call sequence as the backend: the fridge read happens on the
 * first step, the recommendation on the second.
 */
export function customRecipeToolPolicy(intent, step = 0) {
  if (intent !== "recipe_recommendation") {
    return null;
  }
  if (step <= 0) {
    return {
      tools: [GET_FRIDGE_CONTENTS_TOOL],
      tool_choice: {
        type: "function",
        function: { name: "getFridgeContents" },
      },
      parallel_tool_calls: false,
    };
  }
  return {
    tools: [RECOMMEND_RECIPES_TOOL],
    tool_choice: {
      type: "function",
      function: { name: "recommendRecipes" },
    },
    parallel_tool_calls: false,
  };
}
