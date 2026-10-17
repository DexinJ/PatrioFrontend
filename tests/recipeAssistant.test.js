import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

import babel from "@babel/core";
import transformModulesCommonJs from "@babel/plugin-transform-modules-commonjs";
import transformReactJsx from "@babel/plugin-transform-react-jsx";

import {
  buildRecipeContext,
  customRecipeToolPolicy,
  normalizeRecipeUiAction,
  RECIPE_UI_ACTIONS,
  PROPOSE_RECIPE_PREFERENCE_UPDATE_TOOL,
  RECOMMEND_RECIPES_TOOL,
} from "../api/recipeAssistant.js";
import { buildAppleToolGuide } from "../api/appleToolGuide.js";
import {
  appleInputBudgetChars,
  applePromptFits,
} from "../api/appleContextBudget.js";
import {
  APPLE_TOOL_CALL_EXHAUSTED,
  APPLE_TOOL_CALL_REPEAT,
  APPLE_TOOL_CALL_RUN,
  appleToolCallSignature,
  createAppleToolCallTracker,
} from "../api/appleToolLoop.js";
import { normalizeRecipeCards } from "../utils/recipeCards.js";

function loadDirectAiTools() {
  const source = readFileSync(new URL("../api/gpt.js", import.meta.url), "utf8");
  const { code } = babel.transformSync(source, {
    filename: "gpt.js",
    plugins: [transformReactJsx, transformModulesCommonJs],
  });
  const module = { exports: {} };
  const stubs = new Map([
    ["i18next", { t: (key) => key }],
    [
      "react",
      {
        createContext: () => ({ Provider: "Provider" }),
        useCallback: (value) => value,
        useContext: () => ({}),
        useEffect: () => {},
        useRef: (value) => ({ current: value }),
      },
    ],
    ["react-native", { AppState: {} }],
    ["../auth/firebaseClient", { auth: {} }],
    ["../context/AccountSessionContext", { useAccountSession: () => ({}) }],
    [
      "../context/GlobalContext",
      { ChatActionsContext: {}, GlobalContext: {} },
    ],
    ["./backendConfig", { API_BASE_URL: "", BACKEND_WS_URL: "" }],
    ["./appleToolGuide", { buildAppleToolGuide }],
    ["./backendErrors", { createBackendResponseError: () => new Error() }],
    ["./buildSystemMessage", { buildSystemMessage: () => "" }],
    [
      "./recipeHelperRunner",
      {
        applyPostSearchHelpers: async (payload) => ({
          recipes: payload?.recipes || [],
          extractions: [],
        }),
        buildPreSearchHints: async () => ({}),
      },
    ],
    [
      "./gptTools",
      {
        claimClientOwnedGPTToolCalls: () => [],
        useGPTTools: () => ({}),
      },
    ],
    [
      "../utils/chatMessageOrder",
      {
        insertAssistantAboveActionCard: (previous, message) => [
          ...(Array.isArray(previous) ? previous : []),
          message,
        ],
        insertAssistantAboveStructuredMessage: (previous, message) => [
          ...(Array.isArray(previous) ? previous : []),
          message,
        ],
      },
    ],
    ["../utils/recipeCards", { normalizeRecipeCards }],
    // Error notices are never replayed to a model; the tool inventory below is
    // what these tests assert on, so everything is replayable here.
    ["../utils/chatReplayPolicy", { isReplayableChatMessage: () => true }],
    [
      "./memoryManager",
      {
        addMessage: () => [],
        checkAndSummarize: () => ({}),
        formatConversationMemory: () => "",
      },
    ],
    [
      "./reasoningPolicy",
      {
        // BYO requests pin effort to "none" through this helper; the tool
        // inventory below is what these tests assert on.
        sendWithReasoningFallback: async () => ({ ok: false, status: 0, data: null }),
        withReasoningEffort: (body) => body,
      },
    ],
    [
      "./aiProviderSettings",
      {
        getAiProviderSlotSettings: async () => ({
          apiKey: "",
          model: "",
          baseUrl: "",
        }),
        getCustomAiProviderSettings: () => ({}),
        resolveProviderSlotSelection: () => "custom",
      },
    ],
    ["./aiProviderPolicy", { resolveAiProvider: () => "pantrio" }],
    ["./chatLifecycle", { registerChatCancellation: () => () => {} }],
    [
      "../modules/apple-intelligence/src",
      {
        generateAppleIntelligenceToolTurn: async () => ({}),
        getAppleIntelligenceAvailability: async () => ({
          engine: "private_cloud_compute",
        }),
      },
    ],
    ["./appleContextBudget", { appleInputBudgetChars, applePromptFits }],
    [
      "./appleToolLoop",
      {
        APPLE_TOOL_CALL_EXHAUSTED,
        APPLE_TOOL_CALL_REPEAT,
        APPLE_TOOL_CALL_RUN,
        appleToolCallSignature,
        createAppleToolCallTracker,
      },
    ],
    [
      "./recipeAssistant",
      {
        buildRecipeContext,
        customRecipeToolPolicy,
        normalizeRecipeUiAction,
        PROPOSE_RECIPE_PREFERENCE_UPDATE_TOOL,
        RECOMMEND_RECIPES_TOOL,
      },
    ],
  ]);
  const require = (specifier) => {
    if (stubs.has(specifier)) return stubs.get(specifier);
    throw new Error(`Unexpected test import: ${specifier}`);
  };

  vm.runInNewContext(
    `(function (require, module, exports) { ${code}\n})`,
    { console },
    { filename: "gpt.js" }
  )(require, module, module.exports);
  return module.exports.DIRECT_AI_TOOLS;
}

test("the client no longer classifies text into a recipe intent", () => {
  // Routing is server-owned. The client's only lever is an explicit UI action,
  // which is what kept "设置中餐为喜欢的菜系" from becoming a recipe search.
  assert.deepEqual([...RECIPE_UI_ACTIONS], ["findRecipes"]);
  assert.equal(normalizeRecipeUiAction("findRecipes"), "findRecipes");
  assert.equal(normalizeRecipeUiAction("  findRecipes  "), "findRecipes");
  assert.equal(normalizeRecipeUiAction("recipe_recommendation"), "");
  assert.equal(normalizeRecipeUiAction(""), "");
  assert.equal(normalizeRecipeUiAction(null), "");

  const assistantSource = readFileSync(
    new URL("../api/recipeAssistant.js", import.meta.url),
    "utf8"
  );
  assert.doesNotMatch(assistantSource, /inferChatIntent/);
  assert.doesNotMatch(assistantSource, /MEAL_REQUEST_TERMS/);
  // The single-character 菜 rule is what hijacked 菜系 and 香菜.
  assert.doesNotMatch(assistantSource, /"菜",/);

  const gptSource = readFileSync(
    new URL("../api/gpt.js", import.meta.url),
    "utf8"
  );
  assert.doesNotMatch(gptSource, /inferChatIntent/);
  assert.match(gptSource, /uiAction: normalizedUiAction/);
});

test("frontend recipe context bounds inventory and selected ingredients", () => {
  const preferences = { explicit: { preferredCuisines: ["Thai"] } };
  const inventory = Array.from({ length: 125 }, (_, index) => ({
    name: ` item-${index}-${"n".repeat(150)} `,
    quantity: ` ${"q".repeat(100)} `,
  }));
  const selectedIngredients = Array.from({ length: 40 }, (_, index) => ({
    name: ` selected-${index}-${"s".repeat(100)} `,
  }));

  const context = buildRecipeContext({
    fridgeItems: inventory,
    selectedIngredients,
    settings: { recipePreferences: preferences },
  });

  assert.equal(context.inventory.length, 100);
  assert.equal(context.inventory[0].name.length, 120);
  assert.equal(context.inventory[0].quantity.length, 80);
  assert.equal(context.selectedIngredients.length, 30);
  assert.equal(context.selectedIngredients[0].length, 80);
  assert.strictEqual(context.preferences, preferences);
  assert.deepEqual(
    buildRecipeContext({ fridgeItems: null, selectedIngredients: null }),
    { inventory: [], selectedIngredients: [], preferences: {}, language: "en" }
  );
});

test("custom recipe requests force the fridge read, then the recommendation", () => {
  assert.equal(customRecipeToolPolicy("chat", 0), null);

  const firstRound = customRecipeToolPolicy("recipe_recommendation", 0);
  assert.deepEqual(
    firstRound.tools.map(({ function: tool }) => tool.name),
    ["getFridgeContents"]
  );
  assert.deepEqual(firstRound.tool_choice, {
    type: "function",
    function: { name: "getFridgeContents" },
  });
  assert.equal(firstRound.parallel_tool_calls, false);

  const secondRound = customRecipeToolPolicy("recipe_recommendation", 1);
  assert.deepEqual(
    secondRound.tools.map(({ function: tool }) => tool.name),
    ["recommendRecipes"]
  );
  assert.deepEqual(secondRound.tool_choice, {
    type: "function",
    function: { name: "recommendRecipes" },
  });
});

test("custom-provider tools retain recipe capabilities and recipe-safe descriptions", () => {
  const tools = loadDirectAiTools();
  const names = Array.from(tools, ({ function: tool }) => tool.name);
  const byName = new Map(tools.map(({ function: tool }) => [tool.name, tool]));

  assert.equal(new Set(names).size, names.length);
  assert.deepEqual(names, [
    "addFridgeItem",
    "addShoppingItem",
    "massAddShoppingItems",
    "removeFridgeItem",
    "removeShoppingItem",
    "findInFridge",
    "findInShoppingList",
    "getFridgeContents",
    "getShoppingListContents",
    "streamlineLists",
    "proposeAddAllToFridge",
    "updateFridgeItem",
    "proposeBulkFridgeUpdate",
    "recommendRecipes",
    "proposeRecipePreferenceUpdate",
  ]);
  assert.deepEqual(
    JSON.parse(JSON.stringify(byName.get("recommendRecipes"))),
    RECOMMEND_RECIPES_TOOL.function
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(byName.get("proposeRecipePreferenceUpdate"))),
    PROPOSE_RECIPE_PREFERENCE_UPDATE_TOOL.function
  );
  assert.match(
    byName.get("proposeAddAllToFridge").description,
    /Never use for recipes, recipe ingredients, meal ideas/i
  );
  assert.deepEqual(
    Array.from(
      byName.get("proposeAddAllToFridge").parameters.properties.items.items
        .required
    ),
    ["name", "categories", "expiresInDays"]
  );
  assert.ok(
    byName.get("proposeAddAllToFridge").parameters.properties.items.items
      .properties.expiresInDays
  );
  const expiryFieldHolders = {
    addFridgeItem: byName.get("addFridgeItem").parameters.properties,
    proposeAddAllToFridge: byName.get("proposeAddAllToFridge").parameters
      .properties.items.items.properties,
    updateFridgeItem: byName.get("updateFridgeItem").parameters.properties
      .updates.properties,
    proposeBulkFridgeUpdate: byName.get("proposeBulkFridgeUpdate").parameters
      .properties.changes.items.properties.update.properties,
  };
  for (const [name, properties] of Object.entries(expiryFieldHolders)) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(properties, "expiresAt"),
      false,
      `${name} hides expiresAt`
    );
    assert.equal(
      Object.prototype.hasOwnProperty.call(properties, "expiresInDays"),
      true,
      `${name} exposes expiresInDays`
    );
  }
  assert.match(byName.get("recommendRecipes").description, /Call once/i);
});

test("Apple Intelligence can generate every direct tool advertised by the app", () => {
  const nativeSource = readFileSync(
    new URL(
      "../modules/apple-intelligence/ios/AppleIntelligenceModule.swift",
      import.meta.url
    ),
    "utf8"
  );

  for (const { function: tool } of loadDirectAiTools()) {
    assert.match(nativeSource, new RegExp(`"${tool.name}"`), tool.name);
  }
});

test("the Apple tool guide spells out the category values the tools accept", () => {
  const guide = buildAppleToolGuide(loadDirectAiTools());
  const categoriesLine = guide
    .split("\n")
    .find((line) => line.startsWith("categories = "));

  // The logs showed every add call sending `categories` as an array of
  // free-form labels, because the model only ever saw the parameter name.
  assert.ok(
    categoriesLine,
    "categories is described as an object in the Apple tool guide"
  );

  for (const value of [
    "Fridge",
    "Freezer",
    "Pantry",
    "Expired",
    "Eat first",
    "Use soon",
    "Lasts a while",
    "Long keeper",
    "Produce",
    "Dairy",
    "Meat",
    "Seafood",
    "Prepared",
    "Condiments",
    "Beverages",
    "Snacks",
    "Bakery",
    "Frozen",
    "Opened",
    "Unopened",
    "Raw",
    "Cooked",
    "Cut",
    "Whole",
  ]) {
    assert.ok(
      categoriesLine.includes(value),
      `categories legend is missing "${value}"`
    );
  }
});
