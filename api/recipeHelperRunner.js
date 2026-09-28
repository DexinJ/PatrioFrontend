// api/recipeHelperRunner.js
//
// Runs recipe helper tasks on the user's own AI provider.
//
// When the active provider is a custom API key or Apple Intelligence, the
// backend hands back task descriptors (prompt + input) instead of running the
// helper itself. This module executes them — against the user's endpoint for
// custom providers, on-device for Apple — and merges the results into the
// recipe cards. Our own key is never involved, and web search stays on the
// backend where it has always been.

const TASK_TIMEOUT_MS = 12_000;
const MAX_CONCURRENT_TASKS = 2;
const MAX_TASKS_PER_REQUEST = 5;
const DEFAULT_MAX_OUTPUT_TOKENS = 1_200;
const MANIFEST_CACHE_MS = 10 * 60 * 1000;

let manifestCache = null;

function nowMs() {
  return Date.now();
}

function clip(value, maxLength) {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, maxLength)
    : "";
}

function taskKey(task) {
  return `${String(task?.kind || "")}|${JSON.stringify(task?.input ?? {})}`;
}

/**
 * Helper models answer with fenced JSON often enough that this is the normal
 * path, not an error path.
 */
export function parseHelperJson(text) {
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : trimmed).trim();
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(candidate.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

async function withTimeout(promiseFactory) {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error("Helper task timed out.")),
    TASK_TIMEOUT_MS
  );
  try {
    return await promiseFactory(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

async function runCustomTask(task, provider, { fetchImpl = fetch } = {}) {
  const baseUrl = String(provider?.baseUrl || "").trim().replace(/\/+$/, "");
  const apiKey = String(provider?.apiKey || "").trim();
  const model = String(provider?.model || "").trim();
  if (!baseUrl || !apiKey || !model) return null;

  const response = await withTimeout((signal) =>
    fetchImpl(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: String(task.prompt || "") },
          { role: "user", content: JSON.stringify(task.input ?? {}) },
        ],
        max_completion_tokens:
          Number.isFinite(task.maxOutputTokens) && task.maxOutputTokens > 0
            ? task.maxOutputTokens
            : DEFAULT_MAX_OUTPUT_TOKENS,
        temperature: 0,
      }),
      signal,
    })
  ).catch(() => null);

  if (!response || !response.ok) return null;
  const data = await response.json().catch(() => null);
  const content = data?.choices?.[0]?.message?.content;
  return typeof content === "string" ? content : null;
}

/**
 * The Apple module is native-only, so it is loaded on demand: importing this
 * runner in a plain Node test (or on Android) must not pull it in.
 */
async function resolveAppleGenerate(provided) {
  if (typeof provided === "function") return provided;
  try {
    const module = await import("../modules/apple-intelligence/src");
    return module.generateWithAppleIntelligence;
  } catch {
    return null;
  }
}

async function runAppleTask(task, _provider, { appleGenerate } = {}) {
  const generate = await resolveAppleGenerate(appleGenerate);
  if (typeof generate !== "function") return null;
  const instructions = `${String(task.prompt || "")}\nRespond with ONLY the JSON object, with no text around it.`;
  const input = JSON.stringify(task.input ?? {});
  const text = await withTimeout(() => Promise.resolve(generate(instructions, input)))
    .catch(() => null);
  if (typeof text !== "string") return null;
  // The on-device model has no JSON mode, so a malformed answer gets exactly one
  // repair attempt before the task is abandoned and the deterministic result
  // stays in place.
  if (parseHelperJson(text)) return text;
  const repaired = await withTimeout(() =>
    Promise.resolve(
      generate(
        "Return the same information again as valid JSON only. No explanation, no markdown.",
        `${input}\n\nYour previous answer was not valid JSON:\n${text.slice(0, 1_500)}`
      )
    )
  ).catch(() => null);
  return typeof repaired === "string" ? repaired : null;
}

/**
 * Runs one task and returns its parsed JSON, or null when the provider could
 * not do it. Every failure is expected: the server already produced a
 * deterministic result that stays in place.
 */
export async function runHelperTask(task, provider, options = {}) {
  if (!task || typeof task !== "object") return null;
  const type = String(provider?.type || provider?.kind || "");
  const text =
    type === "apple"
      ? await runAppleTask(task, provider, options)
      : await runCustomTask(task, provider, options);
  return parseHelperJson(text);
}

/**
 * Runs the tasks the server asked for, in small batches, and returns a map of
 * `kind -> parsed`. Tasks the provider cannot do are simply absent.
 */
export async function runHelperTasks(tasks, provider, options = {}) {
  const list = (Array.isArray(tasks) ? tasks : [])
    .filter((task) => task && typeof task === "object")
    .slice(0, MAX_TASKS_PER_REQUEST);
  const results = new Map();
  const cache = options.cache || null;
  const startedAt = nowMs();

  let cursor = 0;
  const worker = async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= list.length) return;
      const task = list[index];
      const key = taskKey(task);
      const resultKey = String(task.id || task.kind || key);
      if (cache?.has(key)) {
        results.set(resultKey, { parsed: cache.get(key), task });
        continue;
      }
      const parsed = await runHelperTask(task, provider, options);
      if (parsed == null) continue;
      results.set(resultKey, { parsed, task });
      cache?.set(key, parsed);
    }
  };

  await Promise.all(
    Array.from(
      { length: Math.min(MAX_CONCURRENT_TASKS, list.length) },
      () => worker()
    )
  );

  return { results, elapsedMs: nowMs() - startedAt };
}

/**
 * Applies the helper output to the recipes the server returned. Everything here
 * is additive: a recipe without helper output keeps exactly what the server
 * produced, which is why a failed task can never break a card.
 */
export function mergeHelperResults(recipes, results) {
  const list = Array.isArray(recipes) ? recipes.map((recipe) => ({ ...recipe })) : [];
  if (!(results instanceof Map) || results.size === 0) return list;

  const parsedOf = (kind) => results.get(kind)?.parsed;
  applyMissingItems(list, parsedOf("missingItems"));
  applyTranslation(list, parsedOf("translation"), results.get("translation")?.task);
  applyEstimation(list, parsedOf("estimation"));
  const deduped = applyDedupe(list, parsedOf("dedupe"));
  return deduped;
}

function applyMissingItems(recipes, parsed) {
  const items = Array.isArray(parsed?.items) ? parsed.items : [];
  if (items.length === 0) return;
  const byLine = new Map();
  for (const item of items) {
    const line = clip(String(item?.line ?? ""), 160);
    const name = clip(String(item?.name ?? ""), 120);
    if (!line || !name) continue;
    byLine.set(line, {
      line,
      name,
      quantity: clip(String(item?.quantity ?? ""), 40) || "1",
    });
  }
  if (byLine.size === 0) return;

  for (const recipe of recipes) {
    const missing = Array.isArray(recipe.missingIngredients)
      ? recipe.missingIngredients
      : [];
    if (missing.length === 0) continue;
    recipe.missingItems = missing.map((line) => {
      const text = clip(String(line ?? ""), 160);
      return (
        byLine.get(text) || { line: text, name: text, quantity: "1" }
      );
    });
  }
}

function applyTranslation(recipes, parsed, task) {
  const source = Array.isArray(parsed?.strings) ? parsed.strings : [];
  if (source.length === 0) return;
  // The originals are the strings the server asked about, in the same order.
  const texts = Array.isArray(task?.input?.strings) ? task.input.strings : null;
  if (!texts || texts.length !== source.length) return;
  const mapping = new Map();
  texts.forEach((value, index) => {
    if (typeof value === "string" && typeof source[index] === "string") {
      mapping.set(value, source[index]);
    }
  });
  if (mapping.size === 0) return;

  const translateValue = (value) =>
    typeof value === "string" && mapping.has(value) ? mapping.get(value) : value;
  for (const recipe of recipes) {
    recipe.title = translateValue(recipe.title);
    recipe.source = translateValue(recipe.source);
    if (Array.isArray(recipe.ingredients)) {
      recipe.ingredients = recipe.ingredients.map(translateValue);
    }
    if (Array.isArray(recipe.instructions)) {
      recipe.instructions = recipe.instructions.map(translateValue);
    }
  }
}

function applyEstimation(recipes, parsed) {
  const estimates = Array.isArray(parsed?.estimates) ? parsed.estimates : [];
  if (estimates.length === 0) return;
  const missing = recipes.filter(
    (recipe) =>
      recipe.caloriesPerServing == null || recipe.totalMinutes == null
  );
  if (missing.length === 0) return;

  for (const estimate of estimates) {
    const index = Number.isInteger(estimate?.index) ? estimate.index : -1;
    const target = missing[index];
    if (!target) continue;
    const calories = Number(estimate?.caloriesPerServing);
    const minutes = Number(estimate?.totalMinutes);
    if (target.caloriesPerServing == null && Number.isFinite(calories)) {
      target.caloriesPerServing = Math.min(3_000, Math.max(50, Math.trunc(calories)));
      target.nutritionConfidence = "ai_estimated";
    }
    if (target.totalMinutes == null && Number.isFinite(minutes)) {
      target.totalMinutes = Math.min(720, Math.max(5, Math.trunc(minutes)));
      target.timeConfidence = "ai_estimated";
    }
  }
}

function applyDedupe(recipes, parsed) {
  const groups = Array.isArray(parsed?.groups) ? parsed.groups : [];
  if (groups.length === 0) return recipes;
  const dropped = new Set();
  for (const group of groups) {
    const ids = (Array.isArray(group) ? group : [])
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value >= 0);
    if (ids.length < 2) continue;
    for (const id of ids.slice(1)) dropped.add(id);
  }
  if (dropped.size === 0) return recipes;
  return recipes.filter((_, index) => !dropped.has(index));
}

/* -------------------------------------------------------------------------
 * Pre-search hints
 * ---------------------------------------------------------------------- */

function manifestTask(manifest, kind) {
  const tasks = Array.isArray(manifest?.tasks) ? manifest.tasks : [];
  return tasks.find((task) => task?.kind === kind) || null;
}

async function loadManifest({ apiBaseUrl, token, fetchImpl = fetch }) {
  if (
    manifestCache &&
    nowMs() - manifestCache.fetchedAt < MANIFEST_CACHE_MS
  ) {
    return manifestCache.value;
  }
  const response = await fetchImpl(`${apiBaseUrl}/api/recipes/helper-manifest`, {
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => null);
  if (!response?.ok) return null;
  const value = await response.json().catch(() => null);
  if (!value || !Array.isArray(value.tasks)) return null;
  manifestCache = { value, fetchedAt: nowMs() };
  return value;
}

export function resetHelperManifestCache() {
  manifestCache = null;
}

/**
 * A search response advertises the helper version it was built for. A mismatch
 * means our cached prompts are stale, so the cache is dropped and the next
 * request refetches before running pre-search tasks again.
 */
export function noteHelperVersion(version) {
  if (!Number.isFinite(version)) return;
  if (manifestCache && manifestCache.value?.version !== version) {
    manifestCache = null;
  }
}

/**
 * Runs the pre-search helper prompts on the user's provider and returns the
 * shape the backend accepts as `hints`. It never blocks the request: any
 * failure yields empty hints and the server's deterministic plan runs.
 */
export async function buildPreSearchHints(
  {
    dishQuery = "",
    ingredientTerms = [],
    inventory = [],
    mealType = "",
    language = "en",
  } = {},
  provider,
  { apiBaseUrl, token, fetchImpl = fetch, appleGenerate, cache } = {}
) {
  const manifest = await loadManifest({ apiBaseUrl, token, fetchImpl });
  if (!manifest) return {};

  const tasks = [];
  const dish = clip(dishQuery, 120);
  if (dish) {
    const task = manifestTask(manifest, "dishAliases");
    if (task) {
      tasks.push({
        ...task,
        input: { dish, language },
        reads: "aliases",
      });
    }
  }
  const terms = (Array.isArray(ingredientTerms) ? ingredientTerms : [])
    .map((entry) => clip(String(entry ?? ""), 80))
    .filter(Boolean)
    .slice(0, 20);
  // Only the dish pipeline consumes ingredient variants, so a breadth search
  // never spends the user's tokens on them.
  if (dish && terms.length > 0) {
    const task = manifestTask(manifest, "ingredientVariants");
    if (task) {
      tasks.push({ ...task, input: { language, terms }, reads: "variants" });
    }
  }
  if (!dish && inventory.length > 0) {
    const task = manifestTask(manifest, "mealIdeas");
    if (task) {
      tasks.push({
        ...task,
        input: {
          inventory: inventory.slice(0, 20),
          language,
          ...(mealType ? { mealType } : {}),
        },
        reads: "ideas",
      });
    }
  }
  if (tasks.length === 0) return {};

  const { results } = await runHelperTasks(tasks, provider, {
    fetchImpl,
    appleGenerate,
    cache,
  });

  const hints = {};
  const aliases = results.get("dishAliases")?.parsed?.aliases;
  if (Array.isArray(aliases)) hints.aliases = aliases;
  const variants = results.get("ingredientVariants")?.parsed;
  if (variants && typeof variants === "object") {
    hints.variantTable = variants.table && typeof variants.table === "object"
      ? variants.table
      : variants;
  }
  const ideas = results.get("mealIdeas")?.parsed?.ideas;
  if (Array.isArray(ideas)) hints.ideas = ideas;
  return hints;
}

/**
 * Runs the post-search tasks and merges them into the recipes. Also returns the
 * extraction payloads so the caller can send them back for validation.
 */
export async function applyPostSearchHelpers(
  payload,
  provider,
  { fetchImpl = fetch, appleGenerate, cache, apiBaseUrl, token } = {}
) {
  noteHelperVersion(Number(payload?.helperTaskVersion));
  const recipes = Array.isArray(payload?.recipes) ? payload.recipes : [];
  const tasks = Array.isArray(payload?.helperTasks) ? payload.helperTasks : [];
  if (recipes.length === 0 || tasks.length === 0) {
    return { recipes, extractions: [] };
  }

  const serverTasks = tasks.filter(
    (task) => task.kind !== "textExtraction"
  );
  const extractionTasks = tasks.filter(
    (task) => task.kind === "textExtraction"
  );

  const { results } = await runHelperTasks(serverTasks, provider, {
    fetchImpl,
    appleGenerate,
    cache,
  });
  const merged = mergeHelperResults(recipes, results);

  const extractions = [];
  if (extractionTasks.length > 0 && apiBaseUrl && token) {
    const { results: extractionResults } = await runHelperTasks(
      extractionTasks,
      provider,
      { fetchImpl, appleGenerate, cache }
    );
    // Extraction tasks are keyed by id, so re-run them by id rather than kind.
    for (const task of extractionTasks) {
      const parsed = extractionResults.get(String(task.id || task.kind))?.parsed;
      if (parsed) extractions.push({ pageUrl: task.input?.pageUrl, parsed });
    }
  }

  return { recipes: merged, extractions };
}
