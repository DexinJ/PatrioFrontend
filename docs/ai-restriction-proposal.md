# AI Restriction Lifting Proposal — Fridge Manager

**Status:** Draft for review
**Scope:** Client prompt (`api/buildSystemMessage.js`), client tools (`api/gpt.js` / `api/gptTools.js` / `api/recipeAssistant.js`), server tools and recipe engine (`mobileSearcherBackend/src/chat/tools.js`, `recipeRecommendations.js`, `recipeRequest.js`), policy limits (`mobileSearcherBackend/src/config/policy.js`).

## 1. Decision framework

Every restriction is evaluated against four rules:

1. **Any multi-item or destructive state change requires a confirmation card.** Single-item, low-risk edits may be direct.
2. **Anything the app cannot verify stays labeled as unverified** — never hard-filter on unverified dietary/allergen/nutrition data.
3. **Budgets stay bounded.** Lifting a budget is an entitlement decision, not a default; free tier keeps today's numbers.
4. **Nothing user-facing is irreversible.** Bulk operations get dry-run previews and explicit confirmations.

## 2. Fridge management — lift

| # | Restriction today | Change | Where |
|---|---|---|---|
| F1 | No edit tool exposed to the AI (`editFridgeItem` exists in `GlobalContext` but is unused by tools) | Expose a single-item `updateFridgeItem` tool (name, quantity, categories, `expiresInDays`/`expiresAt`), resolving items by id where possible | `api/gptTools.js`, `api/gpt.js` `DIRECT_AI_TOOLS`, server `tools.js` `OPENAI_TOOLS` |
| F2 | No batch operation tool; per-item calls would exceed the 6-round cap | Add `proposeBulkFridgeUpdate`: array of `{ ids/names, updates }` or preset operations (`extend_expiry`, `set_storage`, `set_urgency`, `set_food_type`, `remove`, `merge_duplicates`). Shows a confirmation card with a before/after diff; supports `dryRun` | New tool in `gptTools.js` + schema in `gpt.js` / `tools.js`; reuse `removeManyFromFridge`, `editFridgeItem` in `GlobalContext.js` |
| F3 | `proposeAddAllToFridge` banned for recipe ingredients / text lists | New `proposeAddMissingIngredientsToShoppingList` that accepts the recipe results returned by `recommendRecipes` and proposes only **shopping-list** additions (never auto-adds hypothetical ingredients to the fridge) | `buildSystemMessage.js` recipes section; new tool schema |
| F4 | Removal is single-item exact-match only | Keep single-item exact-match, but allow batch removal through the `proposeBulkFridgeUpdate` card (ids/names are shown and confirmed before deletion) | `gptTools.js` |

**Held in place:** preset category enums stay closed (see C3). `streamlineLists` keeps its "never remove/modify storage/urgency/state tags" rule.

## 3. Recipe finding — lift

| # | Restriction today | Change | Where |
|---|---|---|---|
| R1 | `MAX_RESULT_COUNT = 6`, prompt says "Return 3-6 recipes" | Raise to 10 for subscribers (keep 6 for free tier or make it an entitlement). Update schema max (`resultCount` max 6 → 10) and prompt to "3-10 unless the user asks for fewer" | `recipeRecommendations.js:5`, `recipeAssistant.js`, `tools.js`, `buildSystemMessage.js:58` |
| R2 | Search budget: 2 queries, 6 results/query, 8 pages, 4 recipes/page, 20s | Raise modestly and make entitlement-aware: 3 queries, 8 results/query, 10 pages, 6 recipes/page, 25s for subscribers; keep today's defaults for free tier. `fetchConcurrency` stays 3 | `recipeRecommendations.js:8` (`DEFAULT_LIMITS` / `LIMIT_CEILINGS`), `recipeRequest.js` |
| R3 | Recipe schema is thin (cuisine, energy, calories, time, meal type, diets, ingredients, servings, count) | Add parameters that are **derivable/verifiable from publisher data**: `skillLevel` (label only), `cookingMethod` (enum: air fryer, instant pot, one-pot, sheet pan, grill, stovetop, oven), `maxIngredients` (3–30), `mealType` as an enum (breakfast/lunch/dinner/snack/dessert), `occasions` (optional). Prompt rule: "only pass values the publisher actually provides; never invent" | `recipeAssistant.js` `RECOMMEND_RECIPES_TOOL`, `tools.js`, `recipeRecommendations.js` `buildSearchQueries`/scoring |
| R4 | AI estimation of missing calories/time is off in some paths; unknown-metadata recipes are dropped under caps | Make estimation-on by default; keep the "(est.)" label; **never** let estimates alone pass a hard safety filter — keep the soft-penalty path (`keepUnknownWhenEstimated`) | `tools.js` `createRecommendRecipesTool` (`estimationEnabled`), `recipeRecommendations.js:435` |
| R5 | Unverified diets (keto, halal, low-FODMAP…) only warn and are not applied | Keep **hard filtering** limited to the verified shortlist (vegan, vegetarian, pescatarian, dairy-free, gluten-free). Add an "informational match" for other patterns: recipes are included but visibly flagged as unverified | `recipeRecommendations.js:151` `DIET_EXCLUSIONS`, `createConstraintRules` |
| R6 | Isolation: after `recommendRecipes`, all other tool calls are skipped | Partial lift: allow **exactly one** follow-up tool call limited to `proposeAddMissingIngredientsToShoppingList` (or `proposeAddAllToFridge` for explicitly listed items). Keep isolation for `proposeRecipePreferenceUpdate` — preferences must remain explicit | `chatGateway.js:805`, `gpt.js` `toolsLockedAfterIsolatedAction`, Apple path |

## 4. Recipe finding — hold (do not lift)

| # | Restriction | Why it stays |
|---|---|---|
| H1 | `webSearch` / `webFetch` banned for recipes | Arbitrary web content is an injection channel and unvetted source; the engine's whitelisted search+parse pipeline is the safe path. If ever needed, it must be a server-side fetch restricted to URLs returned by `recommendRecipes` with prompt-injection guards |
| H2 | "Never invent URLs, calories, or nutrition facts" | Hallucinated metadata is the #1 user-trust and health risk; all unverifiable fields must be labeled or omitted |
| H3 | "Put only constraints stated for the current meal in tool arguments" | Keeps saved preferences authoritative and prevents one-meal phrasing from silently becoming durable preferences |
| H4 | `proposeRecipePreferenceUpdate` isolation + confirmation | Preferences persist across sessions; they must stay explicit and confirmed |
| H5 | Hard allergen filtering limited to the fixed group list, with cross-contact warning | Ingredient lists cannot verify cross-contact/facility handling; false assurance is a safety incident |

## 5. Cross-cutting — hold (with optional entitlement tiers)

| # | Restriction | Action |
|---|---|---|
| C1 | Destructive / large-scope confirmation ("clear, reset, delete all") | **Hold.** The only barrier between a misparse or injected instruction and a wiped list |
| C2 | "Ask ONE clarifying question only if required" | **Hold.** Batch tools make ambiguity worse, not better |
| C3 | Preset category enums (storage/urgency/food_type/state) | **Hold.** Expiry prediction (`expiryPredictor.js`), reminders (`reminderPolicy.js`), food-type inference (`foodTypeInference.js`), and `streamlineLists` all assume the preset taxonomy. Freeform tags silently break them |
| C4 | History window: last 5 messages | **Hold** (optionally 5 → 8 for subscribers). Batch tools remove the need for long context; more history costs tokens and privacy |
| C5 | `parallel_tool_calls: false` + `MAX_TOOL_ROUNDS = 6` | **Hold.** Batch tools make parallel/extra rounds unnecessary; each round is a paid model call |
| C6 | Token budgets (20k/day free, 4k completion), rate limits (12/min authed, 5/min trial), 4 concurrent recipe recommendations | **Hold** as hard ceilings; only raise per entitlement alongside R2 |
| C7 | Inventory cap (80–100 items) and per-field length caps | Optional partial lift: raise to 120 for subscribers; keep the caps (prompt-size and cost protection) |
| C8 | Client/server/Apple tool definitions must stay in sync | **Hold** the single-source-of-truth rule; every new tool/param gets added to all three surfaces and covered by tests |

## 6. Suggested implementation order

**Phase 1 — quick wins, low risk (this sprint)**

1. F1: single-item `updateFridgeItem` tool (direct, no card needed for one item).
2. R1: result cap 6 → 10 (schema + prompt + engine).
3. R3: add the verifiable parameters (skill level, cooking method, max ingredients, mealType enum).
4. R6: allow one follow-up `proposeAddMissingIngredientsToShoppingList` after recommendations.

**Phase 2 — batch operations with safety rails**

1. F2: `proposeBulkFridgeUpdate` with dry-run diff card and confirmation.
2. F3: shopping-list additions from recipe results.
3. R2: entitlement-aware search budget.

**Phase 3 — optional depth**

1. R5: informational (non-hard) filtering for unverified diets.
2. C7: higher inventory cap for subscribers.
3. R4: estimation always on, with estimates visibly labeled.

## 7. Success criteria

- Every new tool appears in `DIRECT_AI_TOOLS` (client), `OPENAI_TOOLS` (server), and the Apple Intelligence tool list — no drift.
- All batch operations go through a confirmation card with a dry-run preview; no direct multi-item mutations.
- No hard filters on unverified dietary/allergen data; everything unverified is labeled.
- Limit normalization (`normalizeLimits`) and entitlement tiers are unit-tested.
- Non-subscriber budgets are unchanged; free-tier behavior is not degraded.

## 8. Open questions for the product owner

1. Should free tier get result count 10, or stay at 6 as an upgrade hook?
2. For R6, should the post-recommendation follow-up be limited to shopping-list additions only (recommended), or also allow fridge additions for explicitly listed items?
3. Do we want entitlement-aware search budgets now, or keep one budget for everyone until Phase 2?
4. Is there a UI home for bulk-edit preview cards, or do we ship chat-only cards first?
