# Recipe-Safe Token-Saving Change

Status: Safe changes implemented; fridge single-source change proposed

## Goal

Reduce the tokens sent to the AI on a typical chat request without breaking
recipe requests that the client did not pre-classify as recipes.

## Problem

Every chat request carries large fixed overhead:

- The original system message was about 7,563 characters and repeated several
  recipe rules in different wording.
- The tool definitions contained long descriptions that were repeated across
  tools.
- The recipe context, including the fridge inventory, was always built and
  sent, even for ordinary chat.

The tempting fix is to gate the recipe context and recipe tools by
`intent === "recipe_recommendation"`. That is not safe, because the client
classifier can miss indirect recipe phrasings. The system message deliberately
contains a fallback that lets the model recognize those requests anyway, and
that fallback only works if the recipe tool and fridge context remain
available.

## Constraints

1. Keep `recommendRecipes` available even when intent is `chat`.
2. Keep the fridge inventory available to `recommendRecipes`, or make the
   backend obtain it lazily.
3. Keep the system-message override that says recipe rules win even when a
   message was not pre-classified as a recipe request.

## Implemented safe changes

### 1. Condense the system message

`api/buildSystemMessage.js` was shortened from 7,563 to 4,941 characters, about
a 35% reduction.

Removed or merged:

- Repeated statements that recipe requests are always in scope.
- Repeated statements that `recommendRecipes` must be called exactly once.
- Repeated statements that web search must not be used for recipe searches.
- Step-by-step fridge-first ordering that is already enforced by
  `resolveRoundToolPolicy` on the backend and `customRecipeToolPolicy` on the
  client.

Kept intact:

- The recipe override sentence that handles indirect phrasings.
- The required reads: `always call getFridgeContents` and
  `Call getShoppingListContents`.
- The language rule: `Always reply in <language> (language code: <code>)`.
- All confirmation-card, safety, expiry, and recipe-output rules.

### 2. Slim the tool schemas

`api/gpt.js` keeps the same tool names, parameter shapes, required fields, and
category enums, but the tool descriptions are shorter.

`recommendRecipes` and `getFridgeContents` were intentionally left in the chat
tool set because they are the recipe escape hatch.

### 3. Client intent classifier removed (updated)

The client used to classify every typed message into `chat` or
`recipe_recommendation` and send that guess to the backend. That classifier is
gone. Two things replaced it:

- The fridge screen's "find recipes" button sends an explicit
  `uiAction: "findRecipes"` in the `start` payload. That is a decision the user
  made, not a guess, so the backend pins the fridge-first recipe sequence for it.
- Typed text is routed by the backend (`resolveRequestRouting` in
  `src/chat/recipeRequest.js`): high-precision phrasings force the recipe
  pipeline, settings/preference statements never do, a bare meal word only
  counts right after recipe cards, and everything else is left to the model with
  the full tool set.

Why the earlier "leave it unchanged" note was reversed: the classifier matched
single characters, so 「菜系」 and 「香菜」 were read as 「菜」 and the turn was
forced into a recipe search, which also made `proposeRecipePreferenceUpdate`
unavailable. The recipe tool and its inventory still stay available in chat
mode, so the escape hatch for indirect phrasings this document was protecting
is unchanged.

## Why the fridge inventory path is necessary

There are two separate "fridge inventory" paths:

- `recipeContext.inventory` is sent in the `start` message and is what the
  recipe engine actually uses.
- `getFridgeContents` is a client-owned read whose result is returned to the
  model, not to the recipe engine.

The backend `recommendRecipes` tool reads `ctx.recipeContext` in
`src/chat/tools.js`, then `normalizeInventory` in
`src/chat/recipeRecommendations.js` consumes `recipeContext.inventory`. The
dish path in `src/chat/recipeDishSearch.js` also receives that inventory to
mark ingredients the user has versus ingredients that are missing.

Therefore `recipeContext.inventory` is required for correct fridge-aware
recommendations. The `getFridgeContents` step is useful for the model but is
not a substitute for the trusted inventory.

## When the fridge-first step is actually forced

When intent is `recipe_recommendation`, the fridge-first sequence is forced:

- Backend: `resolveRoundToolPolicy` in `src/chat/recipeRequest.js` pins
  `getFridgeContents` on round 0, then `recommendRecipes` on round 1+.
- Custom provider: `customRecipeToolPolicy` in `api/recipeAssistant.js` does the
  same.
- Apple local AI: `runAppleAi` in `api/gpt.js` adds the same instruction.

When intent is `chat`, that sequence is not forced. The backend offers the full
tool list with automatic tool choice, so the model can still call
`recommendRecipes` directly. That is why the recipe tool and inventory must stay
available even for chat.

## Proposed later change: one source of fridge truth

The cleanest way to avoid sending the inventory twice is to make the client's
`getFridgeContents` result the single source for both the model and the recipe
engine.

Recommended steps:

1. Keep `getFridgeContents` as the real client-side read.
2. In `src/ws/chatGateway.js`, when the client returns `tool_results` for
   `getFridgeContents`, sanitize the result and cache it in request state:

   ```js
   state.recipeContext = {
     ...state.recipeContext,
     inventory: sanitizeInventoryFromFridgeResult(result),
   };
   ```

3. Remove `recipeContext.inventory` from the client `start` payload, so ordinary
   chat no longer sends the fridge list.
4. Keep `recommendRecipes` reading `ctx.recipeContext.inventory`.

Handle the spontaneous path:

- Before running a server-side `recommendRecipes`, check whether
  `state.recipeContext.inventory` has been captured this request.
- If not, emit a `getFridgeContents` client tool round first, wait for the
  result, cache it, then continue.

The backend must map the richer `getFridgeContents` result into the lean
`{ name, quantity }` inventory shape the recipe engine expects.

## Verification

After the implemented safe changes:

- The system-message language and recipe tests pass.
- The tool-schema recipe capability tests pass.
- `aiProviderSlotComparison.test.js` still fails because
  `refactor/aiProviderSlotModel.js` is missing. That failure is unrelated to
  these changes.

Still to verify before the later fridge change:

1. A plain chat question still answers without a tool call.
2. A direct recipe request still reads the fridge, then returns recipe cards.
3. An indirect recipe request, for example "what should I make tonight", still
   triggers a fresh recommendation with the correct fridge context.
4. A recipe follow-up, for example "breakfast instead", is treated as a new
   request and does not reuse the previous result.
5. "Save that I am allergic to peanuts" still shows a preference confirmation
   card and does not save until confirmed.
6. A non-recipe question about news, prices, or recalls still uses web search
   and never calls recommendRecipes.

## Rollback

The implemented changes are isolated to `api/buildSystemMessage.js` and
`api/gpt.js`. They can be reverted independently if model behavior degrades.
