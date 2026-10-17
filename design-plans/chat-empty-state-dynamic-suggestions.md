# Make the chat empty-state starter prompts state-driven (Chat)

Written against: `8615c7b`, on the working tree (which contains uncommitted edits to
`app/(tabs)/chat.js`, `locales/en.json`, and `locales/zh.json`, plus an untracked
`utils/chatSuggestions.js` and a `tests/chatSuggestions.test.js` that git ignores —
`.gitignore:48` ignores `tests/` wholesale, so test edits there must be synced
separately from the app commit). Build on the working tree, not on `HEAD`.

## Evidence chain

- Surface: `app/(tabs)/chat.js:89` (`ChatEmptyState`, rendered at `:577` when the
  transcript is empty) to `:107-132`, which maps `CHAT_SUGGESTIONS` from the static
  list at `utils/chatSuggestions.js:11`.
- Problem: all three starters are fixed strings that ignore the state behind the
  screen. The recipe starter hard-codes `tonight` (`locales/en.json:365`), so it is
  wrong at every hour that is not dinner, and the third starter
  (`chat.suggestions.expiringFirst*`, `locales/en.json:367`) restates a fact the Home
  card already shows. Neither adapts to the fridge or to the clock.
- Why the recipe copy is load-bearing: the backend will not search recipes when a
  message names no dish, ingredient, cuisine, meal type, time limit, or diet. It asks
  one clarifying question and skips the recipe tool that turn
  (`D:\mobileSearcherBackend\src\chat\systemPrompt.js`, Recipes section). "tonight"
  works only because it smuggles in a meal, so a meal-less rewrite would turn the
  flagship starter into a question instead of recipe cards.
- Why a meal swap is expressive enough: `recommendRecipes` accepts `mealType`
  (`breakfast | lunch | dinner | snack | dessert`) and `maxPrepMinutes`
  (`D:\mobileSearcherBackend\src\chat\tools.js:428`).
- Why the second starter can be about expired food at all: the client tells the
  assistant which items are expired. `getFridgeContents` returns
  `withContextTagLabels(fridgeItems)` (`api/gptTools.js:720`), which spreads each item
  and adds `tagLabels` (`api/gptTools.js:191-199`). Those labels come from the urgency
  tags the client re-derives on every item from the user's own thresholds
  (`context/GlobalContext.js:1995-2057`), and the expired bucket's label is the literal
  string `Expired` (`context/GlobalContext.js:465-470`). The assistant therefore does
  not have to do date arithmetic, which matters because it has no "today" in its
  prompt to do it with.
- Why the shopping-list half is already supported: adding to the list is explicitly a
  shopping-list action and never a recipe request, and several items must go through
  one batch call (`D:\mobileSearcherBackend\src\chat\systemPrompt.js`, Tools section).
  The client advertises the batch capability (`api/gpt.js:83`, sent at `:1945`) and
  implements it (`api/gptTools.js:308`), so N expired items is one call.
- The one asymmetry to respect: `massAddShoppingItems` and `addShoppingItem` mutate
  immediately. Unlike the photo path, which shows a confirmation card through
  `proposeAddAllToFridge` before anything changes, a list add has no confirmation step.
- Data already on the chat screen: `fridgeItems` is destructured from `GlobalContext`
  at `app/(tabs)/chat.js:152`, and each entry carries the derived
  `expired: "expired" | "almost" | "ok"` field built at
  `context/GlobalContext.js:1995-2057`. Deciding whether to show the chip needs no new
  plumbing.
- Focus refresh is already available: `useFocusEffect` is imported
  (`app/(tabs)/chat.js:18`) and used twice on this screen (`:193`, `:213`), so a
  time-derived label can be recomputed when the tab regains focus.
- Test seam: `tests/chatSuggestions.test.js` already asserts that every `labelKey` and
  `promptKey` resolves in `locales/en.json` and `locales/zh.json`, that ids are
  unique, that exactly one suggestion opens the camera, and that every icon exists in
  the Ionicons glyph map. It runs through `scripts/run-unit-tests.cjs`
  (`npm run test:unit`, `node --test` over `tests/*.test.js`).
- Owner: `utils/chatSuggestions.js` (what the starters are) and `ChatEmptyState` in
  `app/(tabs)/chat.js` (how they render).
- Scope and affected surfaces: the empty chat state, plus one line in each copy of the
  assistant prompt. No change to `MessageInput`, `PlusMenu`, `MessageList`, the message
  shape, stored data, or the tool layer.
- Uncertainty: the meal boundaries are a product choice rather than a derivation; the
  zh label needs a native read; and the chip's gate uses the client's `expired` field
  while the assistant re-reads the same fact as a tag label, so the two must agree for
  the tap to find what the label promised.

## Design decision

Keep three starters and make two of them depend on state the app already has, instead
of writing the answers into the copy:

1. Cook names the meal that matches the local time (breakfast, lunch, or dinner), so
   the chip reads correctly at any hour and still carries the meal constraint the
   recipe tool needs.
2. Expired restock says "Add expired items to shopping list" and is shown only when the
   fridge holds at least one item whose derived status is `expired`. Otherwise it is
   dropped, leaving two chips. It names the shopping list rather than "my list", so the
   destination is unambiguous, and dropping the possessive keeps it within a character
   of the cook chip, so the two longest chips set the row's width together.
3. Photo keeps its behavior and its Chinese label gains a destination —
   "拍照添加食材到冰箱". The restock chip now names the shopping list, and two "add"
   chips with only one destination stated invites the reader to assume both land in
   the same place. The English label stays "Add items from a photo": "from a photo"
   already implies intake, and the parity phrasing ("Add items from a photo to my
   fridge") would be the longest chip in the row at 35 characters.

Why this second starter rather than one that names a fridge item: a chip such as "What
can I make with the chicken?" is a second recipe request, so the row returns recipe
cards twice. Restocking is the one job the app's four tabs never offer as a single
action, it gives the shopping list a seat in the empty state, and it shows the assistant
writing to the app rather than only answering.

Alternatives considered and rejected: a restock built from items that are merely
`almost` expired (the chip says expired, so it should mean expired); "what am I out
of?" (the app has no depletion model, so the assistant would be guessing); and a
duplicate check against the list, which is read-only and cannot show the assistant
acting.

## Reuse

- `fridgeItems` from `GlobalContext` (`app/(tabs)/chat.js:152`), the derived array that
  already carries `expired`. Do not re-derive it.
- The urgency labels the client already computes and hands to the assistant
  (`api/gptTools.js:191-199`, `context/GlobalContext.js:465-470`) — the same signal the
  user sees in the Fridge tab, so the chip and the answer cannot drift apart by design.
- The existing shopping-list rules and the batch tool
  (`D:\mobileSearcherBackend\src\chat\systemPrompt.js`; `api/gptTools.js:308`).
- The `useFocusEffect` plus `useCallback` pattern at `app/(tabs)/chat.js:193`.
- The chip treatment and a11y wiring at `app/(tabs)/chat.js:107-132`
  (`suggestionChip`, `accessibilityRole="button"`, `accessibilityLabel`).
- The suggestion list shape and its guard rails: `utils/chatSuggestions.js:11` and
  `tests/chatSuggestions.test.js`.

No new primitive is required. The locale block gains two keys and a nested `meals` map;
the chip component, its styles, and the Ionicons are unchanged.

## Changes

1. `utils/chatSuggestions.js`
   - Change: keep `CHAT_SUGGESTION_ACTION_TEXT` and `CHAT_SUGGESTION_ACTION_PHOTO`, add
     a meal picker and an expired-items check, and rewrite `CHAT_SUGGESTIONS`.
   - Meal buckets and helper:

     ```js
     // Local device hours, [from, to). The last bucket wraps past midnight, so
     // the three tile the whole day with no gap.
     export const MEAL_BUCKETS = [
       { id: "breakfast", from: 5, to: 11 },
       { id: "lunch", from: 11, to: 17 },
       { id: "dinner", from: 17, to: 5 },
     ];

     export function mealForDate(date = new Date()) {
       const hour = date.getHours();
       const bucket = MEAL_BUCKETS.find(({ from, to }) =>
         from < to ? hour >= from && hour < to : hour >= from || hour < to,
       );
       return bucket?.id ?? MEAL_BUCKETS[MEAL_BUCKETS.length - 1].id;
     }

     export function hasExpiredItems(items) {
       return (Array.isArray(items) ? items : []).some(
         (item) => item?.expired === "expired",
       );
     }
     ```

   - `CHAT_SUGGESTIONS` keeps `labelKey` and `promptKey` on all three entries so the
     existing test contract still holds, and adds a discriminant to the two conditional
     ones:
     - `{ id: "cook", action: TEXT, icon: "restaurant-outline",
          labelKey: "chat.suggestions.cookLabel",
          promptKey: "chat.suggestions.cookPrompt", meal: true }`
     - `{ id: "expiredRestock", action: TEXT, icon: "cart-outline",
          labelKey: "chat.suggestions.expiredRestockLabel",
          promptKey: "chat.suggestions.expiredRestockPrompt", expiredRestock: true }`
     - `{ id: "photo", action: PHOTO, icon: "camera-outline",
          labelKey: "chat.suggestions.photoLabel", promptKey: null }`
   - Preserve: the action constant names and values, the icon names, the one-photo rule,
     and the order cook, expired restock, photo.
   - Verify: importing the module under `node --test` needs no React or context;
     `mealForDate` returns exactly one of the three ids for any hour; `hasExpiredItems`
     is `true` only when an item's `expired` is `"expired"`.

2. `app/(tabs)/chat.js`, `ChatEmptyState` (`:89`) and its call site (`:577`)
   - Change: take `fridgeItems` from the screen, where it is already in scope at
     `:152`, and derive the visible row there:

     ```js
     const [now, setNow] = useState(() => new Date());
     useFocusEffect(useCallback(() => { setNow(new Date()); }, []));
     const showExpiredRestock = useMemo(() => hasExpiredItems(fridgeItems), [fridgeItems]);
     const suggestions = CHAT_SUGGESTIONS.filter(
       (suggestion) => !suggestion.expiredRestock || showExpiredRestock,
     );
     // per chip:
     const label = suggestion.meal
       ? t(suggestion.labelKey, { meal: t(`chat.suggestions.meals.${mealForDate(now)}`) })
       : t(suggestion.labelKey);
     ```

   - Keep `key={suggestion.id}`, the styles, `accessibilityRole="button"`, and set
     `accessibilityLabel={label}`. Pass the resolved text out rather than the raw
     descriptor: `onSuggestion?.({ action: suggestion.action, text: label })`.
   - Preserve: the chip row markup, styles, and icon sizing; the empty-state title,
     body, and `chat.aiNotice` line; and the `messages.length === 0` render condition at
     `:562`.
   - Verify: with one expired item the row shows three chips and the second one reads as
     the user asking to restock; with nothing expired, or with only `almost` items, the
     row shows two; the meal label refreshes when the tab regains focus after a meal
     boundary has passed.

3. `app/(tabs)/chat.js`, `handleSuggestion` (`:320`)
   - Change: read the resolved text instead of re-translating a key.

     ```js
     const handleSuggestion = (suggestion) => {
       if (!suggestion) return;
       if (suggestion.action === CHAT_SUGGESTION_ACTION_PHOTO) {
         takePhoto();
         return;
       }
       const prompt = String(suggestion.text || "").trim();
       if (!prompt) return;
       handleSend({ text: prompt, imageUri: null, isUser: true });
     };
     ```

   - Preserve: the photo branch's `takePhoto()` path, the immediate-send behavior, and
     the send payload shape.
   - Verify: tapping the second chip sends the restock sentence, and tapping photo still
     opens the camera instead of sending a message.

4. `locales/en.json` and `locales/zh.json`, the `chat.suggestions` block (`en.json:364`,
   `zh.json:364`)
   - Change: replace the four `cookTonight*` and `expiringFirst*` keys with:

     ```jsonc
     // en
     "cookLabel": "What should I cook for {{meal}}?",
     "cookPrompt": "What should I cook for {{meal}}?",
     "expiredRestockLabel": "Add expired items to shopping list",
     "expiredRestockPrompt": "Add expired items to shopping list",
     "photoLabel": "Add items from a photo",
     "meals": { "breakfast": "breakfast", "lunch": "lunch", "dinner": "dinner" }

     // zh
     "cookLabel": "{{meal}}做什么菜？",
     "cookPrompt": "{{meal}}做什么菜？",
     "expiredRestockLabel": "把过期食材加入购物清单",
     "expiredRestockPrompt": "把过期食材加入购物清单",
     "photoLabel": "拍照添加食材到冰箱",
     "meals": { "breakfast": "早餐", "lunch": "午餐", "dinner": "晚餐" }
     ```

   - The meal is interpolated as a value, the same way `home.welcomeBackName`
     interpolates `{{name}}`, and both locales keep the noun in a position where word
     order holds, so no sentence is assembled out of separately translated fragments.
   - Preserve: every other key in the `chat` block and the surrounding formatting style.
   - Verify: both files parse, and `rg -n "cookTonight|expiringFirst" app utils locales
     tests` returns no matches.

5. `D:\mobileSearcherBackend\src\chat\systemPrompt.js` and `api/buildSystemMessage.js`
   (the client's copy of the same prompt, used by the custom and Apple providers at
   `api/gpt.js:1839`)
   - Change: add one line to the Tools section, in both files, with identical text:

     ```text
     - Expired restock: when the user asks to put their expired food on the shopping
       list, read the fridge, take the items whose urgency tag is Expired, skip
       anything already on the list, and add them in one call.
     ```

     Both files currently carry a byte-identical prompt body (verified), and
     `api/systemPrompt.js:3` re-exports the client copy, so the line has to land in the
     backend prompt and the client copy together or the two providers will behave
     differently.
   - Preserve: every existing rule; the two bodies must stay identical.
   - Verify: diffing the two prompt bodies still reports no difference.

6. `tests/chatSuggestions.test.js`
   - Change: keep the existing assertions, which still hold, and add:
     - a tiling test: for hours `0` through `23` on a fixed date, `mealForDate` returns
       one of the three bucket ids and every bucket is reachable;
     - `hasExpiredItems`: `true` with one `expired` item among `ok` ones, and `false`
       for `[]`, for all-`ok`, and for `almost` items;
     - an interpolation test: every `meals.<id>` exists in both locales and
       `cookLabel`/`cookPrompt` contain `{{meal}}`, because i18next prints a placeholder
       literally when the value is not passed.
   - Preserve: the uniqueness, per-locale, one-photo, and Ionicons assertions.
   - Verify: `npm run test:unit` passes.

## Scope

- Inherit: the empty chat state on `app/(tabs)/chat.js`, plus the assistant's handling
  of the restock sentence.
- Verify: the composer and its plus menu (`components/MessageInput.js:138`,
  `components/PlusMenu.js`) and the chat tour steps (`utils/tabTutorials.js:71-91`)
  render unchanged, and the Fridge tab's own urgency derivation
  (`app/(tabs)/fridge.js:132`) is untouched.
- Exclude: a recipe-based second chip, a restock built from `almost` items, changing
  immediate-send to a prefill, adding any confirmation card for list adds, and any
  change to `MessageList` or the tool layer.

## Validation

- Product: in a new chat at 09:00 the first chip names breakfast, at 13:00 lunch, at
  20:00 dinner, and tapping it returns recipe cards rather than a clarifying question.
  With an expired item in the fridge the second chip appears; tapping it adds the
  expired items to the shopping list in one batch, skips any already listed, and reports
  what changed. With nothing expired the row shows two chips.
- Interface: light and dark themes; a long expired item name; several expired items at
  once; the zh locale; an empty fridge (two chips); a fridge where everything is
  `almost` (two chips); a tab left open across a meal boundary and then refocused.
- System: no second urgency vocabulary is introduced. The gate reads the `expired` field
  `GlobalContext` derives, and the assistant reads the matching urgency label, so the
  chip cannot promise something the tool call will not find.
- Repository: `npm run test:unit` returns exit code 0 with all tests passing,
  `rg -n "cookTonight|expiringFirst" app utils locales tests` returns nothing, and the
  two prompt copies still match.

## Stop conditions

- Stop if the two prompt copies cannot be kept identical, since the WS and local
  provider paths would then diverge.
- Stop if the assistant does not reliably resolve "my expired items" to the items the
  client labels `Expired`; that means a stronger prompt contract is needed before the
  chip ships.
- Stop if a confirmation step is later added to list adds, since the chip's copy assumes
  the tap changes the list directly.
- Stop if `chat.suggestions.cookTonight*` or `chat.suggestions.expiringFirst*` turns out
  to be referenced outside `utils/chatSuggestions.js` and `locales/*.json`. None were
  found at the time of writing.

## Design documentation

- None. The repository has no `DESIGN.md`, so the starter-prompt rules recorded here
  (one state-driven chip, meals tile the day, the restock chip only when food has
  actually expired) have no other destination yet.
