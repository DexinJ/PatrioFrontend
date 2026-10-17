import assert from "node:assert/strict";
import test from "node:test";

import {
  applyPostSearchHelpers,
  buildPreSearchHints,
  mergeHelperResults,
  noteHelperVersion,
  parseHelperJson,
  resetHelperManifestCache,
  runHelperTask,
  runHelperTasks,
} from "../api/recipeHelperRunner.js";

function chatResponse(payload) {
  return {
    ok: true,
    json: async () => ({
      choices: [{ message: { content: `\`\`\`json\n${JSON.stringify(payload)}\n\`\`\`` } }],
    }),
  };
}

const customProvider = {
  type: "custom",
  baseUrl: "https://api.example.com/v1",
  apiKey: "user-key",
  model: "user-model",
};

test("helper JSON is parsed through fences and stray prose", () => {
  assert.deepEqual(parseHelperJson('{"a":1}'), { a: 1 });
  assert.deepEqual(parseHelperJson("```json\n{\"a\":1}\n```"), { a: 1 });
  assert.deepEqual(parseHelperJson('Sure!\n{"a":1}\nDone.'), { a: 1 });
  assert.equal(parseHelperJson("not json"), null);
  assert.equal(parseHelperJson(""), null);
  assert.equal(parseHelperJson(null), null);
});

test("a custom provider call goes to the user's endpoint with their model", async () => {
  const calls = [];
  const task = {
    kind: "missingItems",
    id: "missingItems",
    prompt: "structure these",
    input: { language: "en", lines: ["1/2 cup of olive oil"] },
    maxOutputTokens: 500,
  };
  const parsed = await runHelperTask(task, customProvider, {
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return chatResponse({
        items: [{ line: "1/2 cup of olive oil", name: "olive oil", quantity: "1" }],
      });
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.example.com/v1/chat/completions");
  assert.equal(calls[0].options.headers.Authorization, "Bearer user-key");
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.model, "user-model");
  assert.equal(body.messages[0].content, "structure these");
  assert.equal(body.max_completion_tokens, 500);
  assert.equal(parsed.items[0].name, "olive oil");
});

test("provider failures and missing credentials return nothing, never throw", async () => {
  const task = { kind: "missingItems", id: "missingItems", prompt: "p", input: {} };
  assert.equal(
    await runHelperTask(task, { type: "custom" }, { fetchImpl: async () => chatResponse({}) }),
    null
  );
  assert.equal(
    await runHelperTask(task, customProvider, {
      fetchImpl: async () => ({ ok: false, status: 429, json: async () => ({}) }),
    }),
    null
  );
  assert.equal(
    await runHelperTask(task, customProvider, {
      fetchImpl: async () => {
        throw new Error("offline");
      },
    }),
    null
  );
  // Apple on a non-iOS runtime: the native module is unavailable.
  assert.equal(
    await runHelperTask(task, { type: "apple" }, { appleGenerate: () => { throw new Error("nope"); } }),
    null
  );
});

test("apple tasks run through the on-device generator", async () => {
  const prompts = [];
  const task = {
    kind: "missingItems",
    id: "missingItems",
    prompt: "structure these",
    input: { lines: ["1/2 cup of olive oil"] },
  };
  const parsed = await runHelperTask(task, { type: "apple" }, {
    appleGenerate: (instructions, prompt) => {
      prompts.push({ instructions, prompt });
      return '{"items":[{"line":"1/2 cup of olive oil","name":"olive oil","quantity":"1"}]}';
    },
  });
  assert.equal(parsed.items[0].name, "olive oil");
  assert.match(prompts[0].instructions, /ONLY the JSON/);
  assert.match(prompts[0].prompt, /olive oil/);
});

test("a malformed apple answer gets exactly one repair attempt", async () => {
  let calls = 0;
  const task = {
    kind: "missingItems",
    id: "missingItems",
    prompt: "structure these",
    input: { lines: ["1/2 cup of olive oil"] },
  };
  const parsed = await runHelperTask(task, { type: "apple" }, {
    appleGenerate: () => {
      calls += 1;
      return calls === 1
        ? "Sure! The name is olive oil."
        : '{"items":[{"line":"1/2 cup of olive oil","name":"olive oil","quantity":"1"}]}';
    },
  });
  assert.equal(calls, 2);
  assert.equal(parsed.items[0].name, "olive oil");

  // A second bad answer is abandoned: the deterministic result stays.
  let second = 0;
  const stillBad = await runHelperTask(task, { type: "apple" }, {
    appleGenerate: () => {
      second += 1;
      return "still not json";
    },
  });
  assert.equal(second, 2, "the repair is attempted once, not repeatedly");
  assert.equal(stillBad, null);
});

test("only a named dish spends tokens on ingredient variants", async () => {
  resetHelperManifestCache();
  const prompts = [];
  const fetchImpl = async (url, options) => {
    if (url.includes("helper-manifest")) {
      return {
        ok: true,
        json: async () => ({
          version: 1,
          tasks: [
            { kind: "dishAliases", version: 1, prompt: "aliases" },
            { kind: "ingredientVariants", version: 1, prompt: "variants" },
            { kind: "mealIdeas", version: 1, prompt: "ideas" },
          ],
        }),
      };
    }
    const body = JSON.parse(options.body);
    prompts.push(body.messages[0].content);
    if (body.messages[0].content === "ideas") {
      return chatResponse({ ideas: [{ dish: "Soup", query: "soup recipe" }] });
    }
    return chatResponse({});
  };

  // Breadth search: no dish, so no alias or variant work.
  const hints = await buildPreSearchHints(
    { ingredientTerms: ["西红柿"], inventory: ["西红柿"], language: "zh" },
    customProvider,
    { apiBaseUrl: "https://backend.example", token: "t", fetchImpl }
  );
  assert.deepEqual(prompts, ["ideas"]);
  assert.equal(hints.aliases, undefined);
  assert.equal(hints.variantTable, undefined);
  assert.deepEqual(hints.ideas, [{ dish: "Soup", query: "soup recipe" }]);
});

test("a helper version bump invalidates the cached manifest", async () => {
  resetHelperManifestCache();
  let manifestFetches = 0;
  const fetchImpl = async (url) => {
    if (url.includes("helper-manifest")) {
      manifestFetches += 1;
      return {
        ok: true,
        json: async () => ({ version: 1, tasks: [] }),
      };
    }
    return chatResponse({});
  };

  await buildPreSearchHints(
    { dishQuery: "soup" },
    customProvider,
    { apiBaseUrl: "https://backend.example", token: "t", fetchImpl }
  );
  assert.equal(manifestFetches, 1);

  // Same version: the cache is reused.
  await buildPreSearchHints(
    { dishQuery: "soup" },
    customProvider,
    { apiBaseUrl: "https://backend.example", token: "t", fetchImpl }
  );
  assert.equal(manifestFetches, 1);

  // A search response built for a newer prompt version forces a refresh.
  noteHelperVersion(999);
  await buildPreSearchHints(
    { dishQuery: "soup" },
    customProvider,
    { apiBaseUrl: "https://backend.example", token: "t", fetchImpl }
  );
  assert.equal(manifestFetches, 2);
});

test("runs at most the task budget and reuses cached results", async () => {
  let calls = 0;
  const cache = new Map();
  const tasks = Array.from({ length: 9 }, (_, index) => ({
    kind: "missingItems",
    id: `missingItems:${index}`,
    prompt: "p",
    input: { index },
  }));
  const provider = {
    ...customProvider,
  };
  const fetchImpl = async () => {
    calls += 1;
    return chatResponse({ items: [] });
  };
  const first = await runHelperTasks(tasks, provider, { fetchImpl, cache });
  assert.equal(first.results.size, 5);
  assert.equal(calls, 5);

  const second = await runHelperTasks(tasks, provider, { fetchImpl, cache });
  assert.equal(calls, 5, "cached tasks are not re-run");
  assert.equal(second.results.size, 5);
});

test("missing-item output replaces the raw publisher line", () => {
  const recipes = [
    {
      title: "Braised Chicken",
      url: "https://cook.example/bc",
      missingIngredients: ["1/2 cup of olive oil", "2 cloves garlic"],
    },
  ];
  const results = new Map([
    [
      "missingItems",
      {
        parsed: {
          items: [
            { line: "1/2 cup of olive oil", name: "olive oil", quantity: "1" },
            { line: "2 cloves garlic", name: "garlic", quantity: "1" },
          ],
        },
        task: { input: {} },
      },
    ],
  ]);

  const [recipe] = mergeHelperResults(recipes, results);
  assert.deepEqual(recipe.missingItems, [
    { line: "1/2 cup of olive oil", name: "olive oil", quantity: "1" },
    { line: "2 cloves garlic", name: "garlic", quantity: "1" },
  ]);
});

test("translation, estimation and dedupe merges stay bounded and additive", () => {
  const recipes = [
    {
      title: "番茄炒蛋",
      source: "下厨房",
      ingredients: ["番茄 2个", "鸡蛋 3个"],
      caloriesPerServing: null,
      totalMinutes: null,
    },
    {
      title: "番茄炒蛋",
      source: "另一个站",
      ingredients: ["番茄"],
      caloriesPerServing: 300,
      totalMinutes: 20,
    },
  ];
  const translationTask = {
    input: { strings: ["番茄炒蛋", "下厨房", "番茄 2个", "鸡蛋 3个"] },
  };
  const results = new Map([
    [
      "translation",
      {
        parsed: {
          strings: [
            "Tomato Egg Stir-Fry",
            "Xiachufang",
            "2 tomatoes",
            "3 eggs",
          ],
        },
        task: translationTask,
      },
    ],
    [
      "estimation",
      {
        parsed: { estimates: [{ index: 0, caloriesPerServing: 420, totalMinutes: 35 }] },
        task: { input: {} },
      },
    ],
    ["dedupe", { parsed: { groups: [[0, 1]] }, task: { input: {} } }],
  ]);

  const merged = mergeHelperResults(recipes, results);
  assert.equal(merged.length, 1, "the duplicate dish is collapsed");
  assert.equal(merged[0].title, "Tomato Egg Stir-Fry");
  assert.deepEqual(merged[0].ingredients, ["2 tomatoes", "3 eggs"]);
  assert.equal(merged[0].caloriesPerServing, 420);
  assert.equal(merged[0].totalMinutes, 35);
  assert.equal(merged[0].nutritionConfidence, "ai_estimated");
});

test("translation is chunked so one long card cannot truncate the remaining steps", async () => {
  const calls = [];
  const strings = Array.from(
    { length: 45 },
    (_, index) => `ingredient line ${index}`
  );
  const task = {
    kind: "translation",
    id: "translation",
    prompt: "translate these",
    input: { language: "zh", strings },
  };

  const { results } = await runHelperTasks([task], customProvider, {
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body);
      const request = JSON.parse(body.messages[1].content);
      calls.push(request.strings);
      return chatResponse({
        strings: request.strings.map((value) => `译${value}`),
      });
    },
  });

  assert.equal(calls.length, 2, "40 strings, then the remaining 5");
  assert.equal(calls[0].length, 40);
  assert.equal(calls[1].length, 5);
  const parsed = results.get("translation").parsed;
  assert.equal(parsed.strings.length, strings.length);
  assert.equal(parsed.strings[44], "译ingredient line 44");
});

test("a failed translation chunk keeps its own strings instead of blanking the card", async () => {
  const strings = Array.from({ length: 45 }, (_, index) => `line ${index}`);
  const task = {
    kind: "translation",
    id: "translation",
    prompt: "translate these",
    input: { language: "zh", strings },
  };

  const { results } = await runHelperTasks([task], customProvider, {
    fetchImpl: async (_url, options) => {
      const request = JSON.parse(JSON.parse(options.body).messages[1].content);
      if (request.strings[0] === "line 40") {
        return { ok: false, status: 429, json: async () => ({}) };
      }
      return chatResponse({
        strings: request.strings.map((value) => `译${value}`),
      });
    },
  });

  const parsed = results.get("translation").parsed;
  assert.equal(parsed.strings.length, strings.length);
  assert.equal(parsed.strings[0], "译line 0");
  assert.equal(parsed.strings[40], "line 40");
  assert.equal(parsed.strings[44], "line 44");
});

test("translation reaches the missing lines and shopping-list items the card renders", () => {
  const recipes = [
    {
      title: "Braised Chicken",
      missingIngredients: ["2 cups beef broth"],
      missingItems: [
        { line: "2 cups beef broth", name: "beef broth", quantity: "1" },
      ],
      instructions: ["Brown the chicken."],
    },
  ];
  const task = {
    input: {
      strings: ["Braised Chicken", "2 cups beef broth"],
    },
  };
  const results = new Map([
    [
      "translation",
      {
        parsed: { strings: ["红烧鸡", "2杯牛肉汤"] },
        task,
      },
    ],
  ]);

  const [recipe] = mergeHelperResults(recipes, results);
  assert.equal(recipe.title, "红烧鸡");
  assert.deepEqual(recipe.missingIngredients, ["2杯牛肉汤"]);
  assert.deepEqual(recipe.missingItems, [
    { line: "2杯牛肉汤", name: "beef broth", quantity: "1" },
  ]);
  // The publisher's steps are never sent for translation, so they are never
  // rewritten on the client either.
  assert.deepEqual(recipe.instructions, ["Brown the chicken."]);
});

test("pre-search hints are built from the manifest and sent as hints", async () => {
  resetHelperManifestCache();
  const requested = [];
  const fetchImpl = async (url, options) => {
    requested.push({ url, options });
    if (url.includes("helper-manifest")) {
      return {
        ok: true,
        json: async () => ({
          version: 1,
          tasks: [
            { kind: "dishAliases", version: 1, prompt: "aliases", expects: "json" },
            { kind: "ingredientVariants", version: 1, prompt: "variants" },
            { kind: "mealIdeas", version: 1, prompt: "ideas" },
          ],
        }),
      };
    }
    const body = JSON.parse(options.body);
    if (body.messages[0].content === "aliases") {
      return chatResponse({ aliases: ["清蒸鲈鱼"] });
    }
    return chatResponse({ table: { 西红柿: { same: ["番茄"], notSame: ["番茄酱"] } } });
  };

  const hints = await buildPreSearchHints(
    {
      dishQuery: "清蒸鱼",
      ingredientTerms: ["西红柿"],
      inventory: ["西红柿"],
      language: "zh",
    },
    customProvider,
    { apiBaseUrl: "https://backend.example", token: "id-token", fetchImpl }
  );

  // The manifest is fetched with the Firebase token, never the provider key.
  assert.equal(
    requested[0].options.headers.Authorization,
    "Bearer id-token"
  );
  assert.deepEqual(hints.aliases, ["清蒸鲈鱼"]);
  assert.deepEqual(hints.variantTable, { 西红柿: { same: ["番茄"], notSame: ["番茄酱"] } });
  // A named dish is not a breadth request, so no ideation task was offered.
  assert.equal(hints.ideas, undefined);
});

test("post-search helpers merge server recipes and collect extraction results", async () => {
  const recipes = [
    {
      title: "Braised Chicken",
      url: "https://cook.example/bc",
      missingIngredients: ["1/2 cup of olive oil"],
      ingredients: ["chicken"],
      instructions: ["Cook."],
      caloriesPerServing: 500,
      totalMinutes: 40,
    },
  ];
  const payload = {
    recipes,
    helperTasks: [
      {
        id: "missingItems",
        kind: "missingItems",
        prompt: "structure",
        input: { lines: ["1/2 cup of olive oil"] },
      },
      {
        id: "textExtraction:0",
        kind: "textExtraction",
        prompt: "extract",
        input: { pageUrl: "https://cook.example/bc", text: "irrelevant" },
      },
      {
        id: "methodSummary",
        kind: "methodSummary",
        prompt: "summarize",
        input: {
          language: "en",
          recipes: [
            {
              index: 0,
              title: "Braised Chicken",
              servings: null,
              ingredients: ["chicken"],
              steps: ["Brown the chicken.", "Simmer until tender."],
            },
          ],
        },
      },
    ],
  };
  const result = await applyPostSearchHelpers(payload, customProvider, {
    apiBaseUrl: "https://backend.example",
    token: "id-token",
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body);
      if (body.messages[0].content === "structure") {
        return chatResponse({
          items: [
            { line: "1/2 cup of olive oil", name: "olive oil", quantity: "1" },
          ],
        });
      }
      if (body.messages[0].content === "summarize") {
        return chatResponse({
          recipes: [
            { index: 0, method: ["Sear the chicken, then simmer it gently"] },
          ],
        });
      }
      return chatResponse({
        title: "Extracted Chicken",
        ingredients: ["chicken"],
        instructions: ["Cook."],
      });
    },
    cache: new Map(),
  });

  assert.equal(result.recipes[0].missingItems[0].name, "olive oil");
  // The method summary lands on the recipe; the publisher's steps never do.
  assert.deepEqual(result.recipes[0].method, [
    "Sear the chicken, then simmer it gently",
  ]);
  assert.equal(result.extractions.length, 1);
  assert.equal(result.extractions[0].pageUrl, "https://cook.example/bc");
  assert.equal(result.extractions[0].parsed.title, "Extracted Chicken");
});

test("a summary that copies the publisher's steps is rejected on the client", async () => {
  const source = "Simmer the sauce for twenty minutes until it thickens";
  const recipes = [
    {
      title: "Sauce",
      url: "https://cook.example/sauce",
      ingredients: ["tomato"],
      missingIngredients: [],
    },
  ];
  const payload = {
    recipes,
    helperTasks: [
      {
        id: "methodSummary",
        kind: "methodSummary",
        prompt: "summarize",
        input: {
          language: "en",
          recipes: [
            {
              index: 0,
              title: "Sauce",
              servings: null,
              ingredients: ["tomato"],
              steps: [source],
            },
          ],
        },
      },
    ],
  };
  const result = await applyPostSearchHelpers(payload, customProvider, {
    apiBaseUrl: "https://backend.example",
    token: "id-token",
    fetchImpl: async () =>
      chatResponse({ recipes: [{ index: 0, method: [source] }] }),
    cache: new Map(),
  });

  assert.deepEqual(result.recipes[0].method, []);
});

test("helper kinds this build does not know are dropped, never run", async () => {
  const calls = [];
  const payload = {
    recipes: [
      {
        title: "A",
        url: "https://a.example/1",
        ingredients: ["x"],
        missingIngredients: ["x"],
      },
    ],
    helperTasks: [
      {
        id: "futureWork",
        kind: "futureWork",
        prompt: "do something expensive",
        input: {},
      },
    ],
  };
  const result = await applyPostSearchHelpers(payload, customProvider, {
    apiBaseUrl: "https://backend.example",
    token: "id-token",
    fetchImpl: async () => {
      calls.push(1);
      return chatResponse({});
    },
    cache: new Map(),
  });

  assert.deepEqual(calls, []);
  assert.equal(result.recipes[0].method, undefined);
});

test("helper tasks pin reasoning_effort to none on models that accept it", async () => {
  const task = {
    kind: "missingItems",
    id: "missingItems",
    prompt: "structure these",
    input: { language: "en", lines: ["1/2 cup of olive oil"] },
  };

  const callFor = async (model) => {
    const calls = [];
    await runHelperTask(task, { ...customProvider, model }, {
      fetchImpl: async (url, options) => {
        calls.push({ url, options });
        return chatResponse({ items: [] });
      },
    });
    return JSON.parse(calls[0].options.body);
  };

  // GPT-5.6 needs the field whenever tools or reasoning defaults could apply,
  // so an explicit "none" is sent.
  assert.equal((await callFor("gpt-5.6-luna")).reasoning_effort, "none");
  assert.equal((await callFor("gpt-5.6-terra")).reasoning_effort, "none");
  // gpt-4o rejects the field outright, so it must never be sent.
  assert.equal("reasoning_effort" in (await callFor("gpt-4o-mini")), false);
  // Astra 400s on "none" specifically.
  assert.equal("reasoning_effort" in (await callFor("gpt-6-astra")), false);
});
