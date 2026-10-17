# Tutorial: make the tour's gestures safe and reversible, and give empty tabs real content to point at

Written against: `8615c7b`, on the current working tree (which carries unrelated edits to `api/*`, `app/(tabs)/*`, `components/*`, `context/*`, `locales/*`). Do not reset to `HEAD`.

Two independent changes to the per-tab first-run tutorial. **Part A** fixes the overlay's gesture
model (audit findings 1 and 2). **Part B** adds example items and one example conversation that are
rendered only while a tour has nothing real to point at. Either part can ship without the other; if
they are split, Part A touches `components/TabTutorialOverlay.js`, `context/TabTutorialContext.js`,
`utils/tabTutorials.js`, `locales/*` and `tests/tabTutorials.test.js`, and Part B adds
`utils/tutorialSamples.js` plus edits the three tab screens.

## Status

Implemented in this working tree. Two deltas from the plan text below, both agreed during review:

1. **Card placement.** The shopping list and chat steps no longer anchor the whole list/message
   area. While samples are on screen those two anchors wrap just the example block, so the coach
   card lands below the examples instead of centred over them; with real data the anchors keep the
   `flex: 1` they always had, so the card behaves exactly as before. The step ids (`list.items`,
   `chat.messages`) are unchanged.
2. **Sample rendering.** Because the anchors hug content, the samples render as plain blocks rather
   than through `SectionList` / `MessageList`: the shopping list reuses `ShoppingListRow` in a
   `View`, and the chat reuses the shared `MessageBubble` component. Three static rows and two
   messages need no scrolling, and this keeps the real (scrollable) paths untouched.

Files changed: `components/TabTutorialOverlay.js`, `context/TabTutorialContext.js`,
`utils/tabTutorials.js`, `utils/tutorialSamples.js` (new), `app/(tabs)/fridge.js`,
`app/(tabs)/list.js`, `app/(tabs)/chat.js`, `locales/en.json`, `locales/zh.json`,
`tests/tabTutorials.test.js`, `tests/tutorialSamples.test.js` (new).

## Goal

Part A — the tour must stop consuming gestures that the rest of the app defines as something else,
and it must be possible to walk backwards:

1. A tap on the spotlit control, on the tab bar, or anywhere else outside the card is currently
   read as "Next". After this change the card owns progression: **Back**, **Skip**, **Next**.
2. There is currently no way back to a previous step, and the only exit is a permanent Skip. Add a
   Back control.

Part B — four tutorial steps point at content that may not exist on a fresh account:
`fridge.items`, `fridge.itemsMenu` (anchored to the first row), `list.items`, and `chat.messages`.
On an empty account the spotlight falls back to a centered card with nothing behind it, so the copy
describes data the user cannot see (worst case: `fridge.itemsMenu` says "Press and hold any item"
with no rows on screen). Show clearly-labelled sample content **only** when that tab's tour is
running and the real collection is empty.

## Evidence chain

- Overlay gestures: `components/TabTutorialOverlay.js`
  - The backdrop is a full-screen advance target at `:243-251`
    (`<Pressable style={StyleSheet.absoluteFill} onPress={advance} …/>`); its comment reads
    "Tap anywhere outside the card to move to the next step."
  - The four dim panels and the focus ring are `pointerEvents="none"` (`:256, :263, :275, :287,
    :299`), so a tap inside the spotlight hole falls through to the backdrop and advances.
  - The overlay is a `Modal` rendered as a sibling *after* `<Tabs>` in `app/(tabs)/_layout.js:594`,
    so it covers the tab bar as well. A React Native `Modal` opens its own window: no touch can
    reach the tab bar through it, even where the modal is transparent.
  - Copy that asks for the touch being reinterpreted: `tutorial.tabs.chat.attach.body`
    ("Tap the plus button to open your photo options", `locales/en.json:80`) and
    `tutorial.tabs.fridge.itemsMenu.body` (`locales/en.json:106`). The two reveal steps
    (`chat.attachOptions`, `fridge.addOptions`) also force a dropdown open for display only, and
    `design-plans/tutorial-photo-options-and-hold-menu.md` already records that neither row should
    be pressable while the tour runs — with no backdrop those rows are inert by construction.
- No backwards navigation: the actions row renders exactly `dismiss` (`:190`) and `advance` (`:208`);
  `advance` can only increment (`context/TabTutorialContext.js:174-188`) and `finishSession` writes
  the tab into `seenTabs` (`:164-172`). Skip is `theme.textSecondary` text with no fill or border,
  while Next is a filled pill. On iOS a transparent `Modal` has no swipe-to-dismiss, so Skip is the
  only escape besides Android back.
- Surface needing content: `app/(tabs)/fridge.js:583-585` (`emptyFridge` / `noMatches`),
  `app/(tabs)/list.js:709-745` (`emptyList` / `noMatches`), `app/(tabs)/chat.js:602-610`
  (empty state with suggestion chips). Anchored steps: `utils/tabTutorials.js` `TAB_TUTORIALS`
  (`fridge.items`, `fridge.itemsMenu` → `fridge.items.first`, `list.items`, `chat.messages`).
- Derivation pipelines the samples must feed (the tour's copy asserts these values):
  `app/(tabs)/fridge.js:128-189` (`decoratedItems` → `tabDefs` pill counts at `:164-185`),
  `app/(tabs)/list.js:250-290` and `:390-436` (category labels → pill counts),
  `app/(tabs)/list.js:445-516` (filter → sort → sections).
- Patterns to reuse: `utils/chatSuggestions.js` + `tests/chatSuggestions.test.js` (pure data module,
  locale coverage and icon-glyph assertions), `utils/tabTutorials.js` + `tests/tabTutorials.test.js`
  (pure helpers, source-literal guards), `utils/itemTagLabels.js`
  (`buildTagMaps`, `makeLabelToTagId`), `components/MessageList.js:923` (renders
  `{ id, role, content }`), `components/InventoryListItem.js` (documented item fields).
- Test harness has no component renderer: `scripts/run-unit-tests.cjs` runs `tests/*.test.js` under
  `node --test` with `scripts/i18n-test-setup.mjs`. Every guard below must therefore live in pure
  functions or source scanning.
- Uncertainty: card placement and spotlight geometry can only be confirmed on a device (the earlier
  plan flagged the same thing). Sample rows at the maximum font size (12–24, `app/(tabs)/settings.js:2886`)
  need one visual pass for wrapping in both locales.

## Design decisions

**A. The card owns progression; the dim becomes inert.**

A full-screen press target cannot exclude the tab bar (the modal window swallows those touches
regardless) and cannot exclude the spotlight without coordinate hit-testing whose result changes
between steps, because card placement is derived from the measured card height. Rather than encode
that instability, remove the ambiguity: the only controls that move the tour are Back, Skip, and
Next (plus Android back, which dismisses, as today). Dimming already communicates "this is modal",
and the tab bar being dimmed and inert is consistent with that — what is *not* consistent is a dim
that silently advances the tour instead.

The alternative — keep tap-to-advance but suppress it inside the spotlight rect and a measured
tab-bar band — needs the tab bar height, which is only available inside a screen:
`useBottomTabBarHeight` reads `BottomTabBarHeightContext`, which
`@react-navigation/bottom-tabs` provides around each screen's content
(`node_modules/@react-navigation/bottom-tabs/lib/module/views/BottomTabView.js`, the provider at
`:247`), not around the navigator, so `app/(tabs)/_layout.js` cannot read it without wrapping the
navigator's own tab bar. It also produces a tap that advances on one step and does nothing on the
next. Rejected for this change; see Risks for the follow-up that would restore tab navigation.

**B. Samples are render-only, injected upstream of the derivation pipeline, and labelled.**

- Injected in the screen from constants, never written into `GlobalContext` / `ChatContext` state,
  storage, or the AI request history. Handlers continue to read the real collections
  (`handleDoneShopping` at `app/(tabs)/list.js:317`, `streamlineLists` at `:233`, long-press and
  edit actions in `fridge.js`), so a sample can never be checked off, deleted, moved, or sent.
- Injected **upstream** of the count/derivation memos, not at the render call, so the copy that the
  tour is explaining stays true: `fridge.filterTabs.body` says "The number on each pill is how many
  items are in it" and `list.filterTabs.body` says the list groups itself by aisle. Injecting at the
  rows would leave the pills reading 0 while rows are visible.
- Shown only when both conditions hold: this tab's tour session is active, and the real collection
  is empty. `useTabTutorial()` exposes `isActive` and `activeTabKey`; the tab key comparison matters
  because inactive tab screens stay mounted (`MaybeScreen` in `@react-navigation/bottom-tabs`).
- Labelled with a single muted notice above the content ("Example items" / "Example conversation"),
  and removed the moment the tour ends or real data exists.

Excluded: **Home**. Its three cards are the product's live-data promise
("Each card is a live count…", `tutorial.tabs.home.cards.body`); fabricating counts there would
teach a false reading of the screen. A new user's home shows honest zeros, and the home tour runs on
a different tab from the fridge tour, so the two never appear at the same time. **Settings** has no
content dependency. Fridge, Shopping List, and Chat each get samples; no other surface changes.

## Reuse

- `utils/tabTutorials.js` — exported pure helpers consumed by the context and by
  `tests/tabTutorials.test.js` (pattern: `shouldRevealMenu`, `getTabKeyForPathname`).
- `components/TutorialTarget.js` — the notice and sample rows render inside the existing anchors
  (`fridge.items`, `list.items`, `chat.messages`, `fridge.items.first`); no new anchor ids.
- `components/InventoryListItem.js` — sample rows render through the real row component, fed by the
  same decorated fields the fridge screen already computes (`_expired`, `_almostExpired`,
  `_expiresAtMs`, `_daysUntilExpire`, `_storageLabel`, `_stateLabel`, `_foodTypeLabel`).
- `components/MessageList.js` — the sample conversation renders through the real message renderer.
- `utils/itemTagLabels.js` `buildTagMaps` / `makeLabelToTagId` — reuse for the sample `tagIds`
  (already used this way in `app/(tabs)/fridge.js:95-96`).
- `utils/chatSuggestions.js` + `tests/chatSuggestions.test.js` — the shape to copy for a pure sample
  data module and its locale test.
- Locale catalogs `locales/en.json` / `locales/zh.json`; `tutorial.*` already exists in both.

No new primitive is needed: `utils/tutorialSamples.js` is a data module in the same style as
`utils/chatSuggestions.js`, and the notice is a plain `Text` in each screen's local styles.

## Changes

### Part A — overlay interaction

1. `components/TabTutorialOverlay.js`
   - Change: delete the full-screen backdrop `Pressable` (`:243-251`) and its "Tap anywhere outside
     the card" comment. Leave the four dim panels and the ring exactly as they are
     (`pointerEvents="none"`). Nothing else in the overlay becomes pressable.
   - Preserve: the `Modal` (`transparent`, `animationType="fade"`, `statusBarTranslucent`,
     `onRequestClose={dismiss}`, `supportedOrientations`) — Android back must keep dismissing the
     tour, and the dim must keep covering the status bar area.
   - Preserve: `accessibilityViewIsModal` on the card, the step label, the dots row, the title/body
     typography, card placement maths, and the `advanceLockRef` tap-throttle behaviour for Next.
   - Verify: with the tour open, taps on the spotlighted control, on the dim, and on the tab bar
     produce no state change; Next/Skip still work. Also verify the now-removed duplicate
     accessibility element labelled "Next step" is gone (the card is the first thing announced).

2. `utils/tabTutorials.js`
   - Change: add two exported pure helpers next to `shouldRevealMenu`:
     `nextStepIndex(index, totalSteps)` → the next index, or `null` when `index` is already the last
     step / input is not finite / `totalSteps <= 0`; and `previousStepIndex(index)` → `index - 1`,
     or `null` when `index` is not a finite number or is `<= 0`.
   - Preserve: the module's existing exports and its header comment about the tutorial model; the
     new helpers belong under the existing "pure helper" section, not in a new file.
   - Verify: `tests/tabTutorials.test.js` covers the boundaries (below).

3. `context/TabTutorialContext.js`
   - Change: import the two helpers; reuse the existing `advanceLockRef` (rename to `navLockRef` and
     update both call sites, since it now guards two directions). `advance` becomes
     `const next = nextStepIndex(session.index, steps.length); if (next === null) { finishSession(session.tabKey); return; } … setSession({ tabKey: session.tabKey, index: next })`.
     Add `back`:
     `const previous = previousStepIndex(session.index); if (previous === null) return;` then take
     the same 220 ms lock and `setSession({ tabKey: session.tabKey, index: previous })`.
   - Expose `back` in the provider `value` (with `back` in its dependency array) and add
     `back: () => {}` to the `EMPTY_TUTORIAL` default so consumers outside the provider stay safe.
   - Preserve: the session shape (`{ tabKey, index }`), the derived spotlight
     (`measurementKey` = `tabKey:index:targetId`), the auto-start delay, the
     `verificationPromptVisible` guard, `dismiss`, `finishSession`, and `replayTutorials`.
   - Verify: Back on step 1 is a no-op; Back from step 2 lands on step 1 with the step-1 spotlight
     re-measured (the brief centered card before the 0 ms/180 ms re-measure is expected and matches
     forward navigation); Skip and finish still mark the tab seen exactly once.

4. `components/TabTutorialOverlay.js` (same file as step 1)
   - Change: read `back` from `useTabTutorial()`. Replace the actions row content with a left cluster
     and the Next pill:
     `<View style={styles.actions}><View style={styles.actionsLeft}>[Back][Skip]</View>[Next]</View>`.
     Back is a `Pressable` with `accessibilityRole="button"`,
     `accessibilityLabel={t("tutorial.a11y.back")}`, `disabled={stepIndex === 0}`,
     `accessibilityState={{ disabled: stepIndex === 0 }}`, `hitSlop={8}`, the existing
     `styles.skipBtn` padding, and `opacity: 0.4` when disabled (rendered, not hidden, so the row
     does not shift between steps). Text uses `theme.textSecondary`, `fontSize`,
     `fontWeight: "600"` — identical to Skip.
   - Add `actionsLeft: { flexDirection: "row", alignItems: "center", gap: 14 }` to the stylesheet.
     `gap` is already used by `styles.dots`, so it is supported in this React Native version.
   - Update the file's header comment (`:1-5`) to state that progression is explicit and the dim is
     inert.
   - Preserve: `styles.actions` `space-between`, the Next pill's fill/typography, and the
     last-step label (`tutorial.done`).
   - Verify: at `fontSize` 24 in both locales the three controls stay on one line with no clipping;
     the disabled Back still announces its disabled state to a screen reader.

5. `locales/en.json`, `locales/zh.json`
   - Change: add under `tutorial` — `"back": "Back"` / `"back": "上一步"` and
     `"a11y": { "back": "Previous step" }` / `"a11y": { "back": "上一步" }`.
   - Preserve: existing `next`, `skip`, `done`, `stepOf`, and the `a11y` block's current keys.
   - Verify: both catalogs resolve; `node scripts/check-i18n-keys.cjs` stays clean.

### Part B — sample content

6. `utils/tutorialSamples.js` (new)
   - Change: a data module in the style of `utils/chatSuggestions.js`, header comment stating that
     this content is render-only, is shown only while a tab's tour runs on an empty collection, and
     must never be persisted, mutated, or sent to the AI. Exports:
     - `TUTORIAL_SAMPLE_ID_PREFIX = "tutorial-sample-"` and
       `isTutorialSampleId(id)`.
     - `shouldShowTabSamples({ isActive, activeTabKey, tabKey, itemCount })` → `true` only when
       `isActive === true`, `activeTabKey === tabKey`, and `itemCount === 0`.
     - `buildTutorialFridgeItems({ now, labelToTagId, t })` → the three descriptors below mapped to
       raw item shape (`{ id, name, quantity, createdAt, expiresAt, tagIds }`), where `name` is
       `t(nameKey)`, `createdAt`/`expiresAt` are ISO strings built from `now` plus `expiresInDays`,
       and `tagIds` is `["Fridge", "Expired", "Dairy", "Opened"]`-style labels resolved through the
       injected `labelToTagId` so ids always match the live preset tags.
     - `buildTutorialShoppingItems({ now, labelToTagId, t })` → the three descriptors below, same
       shape with only the food-type tag per item.
     - `TUTORIAL_SAMPLE_CHAT` → the two `{ id, role, contentKey }` descriptors, and
       `buildTutorialSampleChat(t)` → those descriptors as text-only messages
       (`{ id, role, content }`, no `type`, no `action`, no `recipes`, no `imageUri`).
     - Every user-visible string in the module is a locale key (`nameKey` / `contentKey` matching
       `/^tutorial\.samples\./`); no literal copy is hard-coded.
   - Preserve: no coupling to `GlobalContext` — labels are resolved by the screens, which already
     hold `tagById` / `labelToTagId`.
   - Verify: `tests/tutorialSamples.test.js` (step 11).

   Fridge samples (three, `expiresInDays` relative to `now`):

   | id | nameKey | en / zh | qty | expiresInDays | storage | urgency | food type | state |
   | --- | --- | --- | --- | --- | --- | --- | --- | --- |
   | `tutorial-sample-fridge-yogurt` | `tutorial.samples.fridge.yogurt.name` | Greek yogurt / 希腊酸奶 | 1 | `-2` | Fridge | Expired | Dairy | Opened |
   | `tutorial-sample-fridge-spinach` | `tutorial.samples.fridge.spinach.name` | Baby spinach / 嫩菠菜 | 1 | `1` | Fridge | Eat first | Produce | Opened |
   | `tutorial-sample-fridge-peas` | `tutorial.samples.fridge.peas.name` | Frozen peas / 冷冻豌豆 | 1 | `180` | Freezer | Long keeper | Frozen | Unopened |

   These make `fridge.items` ("Expired and expiring items are pinned to the top") true — one expired
   row in its own section, one expiring tomorrow, one fresh — and give the storage pills real counts
   (All 3, Fridge 2, Freezer 1, Pantry 0).

   Shopping list samples (three, each a different aisle so `list.filterTabs` shows more than "All"):

   | id | nameKey | en / zh | qty | food type label |
   | --- | --- | --- | --- | --- |
   | `tutorial-sample-list-milk` | `tutorial.samples.list.milk.name` | Milk / 牛奶 | 1 | Dairy |
   | `tutorial-sample-list-apples` | `tutorial.samples.list.apples.name` | Apples / 苹果 | 6 | Produce |
   | `tutorial-sample-list-bread` | `tutorial.samples.list.bread.name` | Bread / 面包 | 1 | Bakery |

7. `locales/en.json`, `locales/zh.json`
   - Change: add `tutorial.samples` with `itemsNotice` ("Example items" / "示例食材"),
     `chatNotice` ("Example conversation" / "示例对话"), the six `fridge.*.name` / `list.*.name`
     keys, and `chat.user` / `chat.assistant`:
     - en `chat.user`: "What should I cook tonight?"; en `chat.assistant`: "Try a spinach frittata —
       it's quick and a good way to use up greens before they go off. Want the steps?"
     - zh `chat.user`: "今晚做什么好？"; zh `chat.assistant`: "可以做菠菜烘蛋：快，又能把快到期的绿叶菜用掉。要步骤吗？"
   - Preserve: the existing `tutorial.tabs.*` copy (Part A does not reword any step).
   - Verify: every key resolves in both catalogs; `node scripts/check-i18n-keys.cjs` stays clean.

8. `app/(tabs)/fridge.js`
   - Change: `const { isActive, activeTabKey } = useTabTutorial();` (extend the existing
     `useTabTutorial()` call at `:46`); add
     `const showSamples = shouldShowTabSamples({ isActive, activeTabKey, tabKey: "fridge", itemCount: fridgeItems.length });`
     and `const sourceFridgeItems = useMemo(() => (showSamples ? buildTutorialFridgeItems({ now: new Date(), labelToTagId, t }) : fridgeItems), [showSamples, labelToTagId, t, fridgeItems]);`
     Then use `sourceFridgeItems` in place of `fridgeItems` at `:129` (and in the `:162` dependency
     array) and at `:584` (the empty-state text). Everything downstream — `decoratedItems`,
     `tabDefs` counts, filtering, sections, `renderItem`, `fridge.items.first` — follows
     automatically.
   - Change: render the notice as the first child inside the existing
     `<TutorialTarget id="fridge.items">` (`:615`), above the `SectionList`/empty text, only when
     `showSamples`: `<Text style={[styles.sampleNotice, { fontSize: Math.max(12, fontSize * 0.8), color: theme.textSecondary }]}>{t("tutorial.samples.itemsNotice")}</Text>`
     with `sampleNotice: { textAlign: "center", marginTop: 6, marginBottom: 2 }` in the local
     stylesheet.
   - Change (defense in depth, one line): build `visibleIds` (`:283`) from
     `filteredItems.filter((it) => !isTutorialSampleId(it.id))` so select-all can never include a
     sample even if a future change makes selection reachable during a tour.
   - Preserve: every mutation path reads the real `fridgeItems`
     (`removeManyFromFridge`, `editFridgeItem`, `addToFridge`, `handleMeasuredLongPress` and the
     `ActionGridPopover` actions), and `FridgeAddMenu` keeps receiving `revealOptions={revealAddMenu}`
     (`:663`) so the `addOptions` step still opens the real dropdown.
   - Verify: tour on an empty fridge → notice + three rows with Expired / Expiring soon sections and
     pill counts 3 / 2 / 1 / 0; tour on a fridge with one real item → no notice, only the real row;
     after the tour ends → rows and notice disappear and `fridge.emptyFridge` returns.

9. `app/(tabs)/list.js`
   - Change: extend the `GlobalContext` destructure (`:134`) with whatever is missing, then add
     `const { isActive, activeTabKey } = useTabTutorial();` (new import from
     `../../context/TabTutorialContext`) and
     `const showSamples = shouldShowTabSamples({ isActive, activeTabKey, tabKey: "list", itemCount: shoppingListItems.length });`
     plus `const sourceShoppingItems = useMemo(() => (showSamples ? buildTutorialShoppingItems({ now: new Date(), labelToTagId }) : shoppingListItems), [...])`.
     Build `labelToTagId` the same way `fridge.js:95-96` does
     (`buildTagMaps(tags)` → `makeLabelToTagId(tagIdByKey)`), importing both from
     `../../utils/itemTagLabels`.
   - Change: use `sourceShoppingItems` at the derivation call sites only —
     `categoryByItemId` (`:270`, `:273`), `categoryCounts` (`:281`, `:286`), the `categoryTabs` All
     count (`:433`, `:436`), `filteredShoppingItems` (`:445`, `:456`), and the empty-state check
     (`:714`). Leave `:233` (`streamlineLists`) and `:317` (`handleDoneShopping`) on the real
     `shoppingListItems`.
   - Change: notice row inside the existing `<TutorialTarget id="list.items">` (`:709`), rendered
     above the list when `showSamples`, same copy and style as the fridge screen.
   - Preserve: check-off, quantity editing, delete, edit mode, `Done shopping`, the search/sort bar,
     the input row, and the empty-state text for the non-sample cases.
   - Verify: tour on an empty list → notice + three rows in three aisle sections, pills
     All 3 / Bakery 1 / Dairy 1 / Produce 1; `Done shopping` and check-off never see a sample id;
     after the tour the empty state returns.

10. `app/(tabs)/chat.js`
    - Change: add
      `const showSamples = shouldShowTabSamples({ isActive, activeTabKey, tabKey: "chat", itemCount: messages.length });`
      (from `useTabTutorial()`), and in the render branch at `:602` use
      `messages.length === 0 && !waiting && showSamples`
      → render a `<View>` containing the notice
      (`t("tutorial.samples.chatNotice")`, muted, centered) above
      `<MessageList messages={buildTutorialSampleChat(t)} />`; keep the existing empty-state branch
      for `messages.length === 0 && !waiting && !showSamples`.
    - Preserve: `MessageList`'s props (`onUiAction`, `onRetry`, `onDismiss` may be passed as-is),
      the `conversationLoading` branch, `waiting`, the composer, and the suggestion-chip empty state
      for real empty conversations. Sample messages are text-only, so no action card can render from
      them.
    - Verify: with an empty conversation, starting the Chat tour shows the notice plus the two
      bubbles and no typing indicator; when the tour ends the suggestion chips return; sending a
      message during or after the tour never includes the sample text in the request history
      (`messages` in `ChatContext` is untouched).

11. `tests/tutorialSamples.test.js` (new) and `tests/tabTutorials.test.js` (extend)
    - `tests/tutorialSamples.test.js`, mirroring `tests/chatSuggestions.test.js`:
      every `nameKey` / `contentKey` resolves to a non-empty string in `locales/en.json` **and**
      `locales/zh.json`; all sample ids are unique, start with `TUTORIAL_SAMPLE_ID_PREFIX`, and
      `isTutorialSampleId` accepts them; `shouldShowTabSamples` is true only for the active, empty,
      matching tab (false for a different `tabKey`, `itemCount > 0`, `isActive: false`);
      `buildTutorialFridgeItems({ now: new Date("2026-01-10T12:00:00Z"), labelToTagId, t: stubT })`
      with a stub mapper returns exactly one expired, one expiring-soon, and one fresh item, and each
      has `tagIds` for storage / urgency / food_type / state; `buildTutorialShoppingItems` spans at
      least two distinct food-type labels (assert against the injected mapper, not hard-coded ids);
      `TUTORIAL_SAMPLE_CHAT` messages carry only `id`, `role`, `content` — assert no `action`,
      `recipes`, or `imageUri`, and that every sample descriptor points at a `tutorial.samples.*`
      key (guards against hard-coded copy bypassing the catalogs).
    - `tests/tabTutorials.test.js`: add cases for `nextStepIndex` / `previousStepIndex`
      (`nextStepIndex(last, total) === null`, `nextStepIndex(0, 0) === null`,
      `previousStepIndex(0) === null`), plus one walk test that steps from 0 to the last index and
      back to 0 for every tab in `TAB_TUTORIAL_KEYS` using only the helpers.
    - Preserve: the existing guards (unique ids, both locales, tab prefix, source literals, version
      map) — no existing assertion is weakened.
    - Verify: `npm run test:unit` passes.

## Scope

- Inherit: all five tabs' tours (the overlay and context are shared), and the three screens that
  render samples.
- Verify: `app/(tabs)/_layout.js` (overlay mount, tab bar, Android back), `components/FloatingAddButton.js`
  and `components/FridgeAddMenu.js` (`fridge.addButton` / `fridge.addOptions` reveal flow),
  `components/PlusMenu.js` + `components/MessageInput.js` (`chat.attachOptions` reveal flow),
  `components/InventoryListItem.js` (sample rows reuse it), `app/(tabs)/index.js` (Home stays on real
  data), `app/(tabs)/settings.js` (Replay row still resets every tab).
- Exclude: findings 1 and 2's follow-ups that were not requested — restoring tab navigation during a
  tour (would require de-modalizing the overlay), the replay-scope/copy mismatch, the
  `accessibilityViewIsModal` placement, and copy polish (duplicated photo phrasing, the two "plus"
  buttons in Chat, punctuation drift, no step for the tab bar).

## Validation

- Product: a new account opens each tab for the first time and completes or skips every tour without
  ever being unable to move backwards or forwards, and without the app reacting to a tap the tour
  was not meant to own. Empty Fridge / Shopping List / Chat still show the tour's controls and
  content instead of a centered card over nothing.
- Interface:
  - Both themes and `fontSize` 12, 16, and 24; both locales; portrait phone (and one tablet pass for
    card placement, since `supportsTablet` is true).
  - Each tab's tour, step by step: Back at each step returns to the previous anchor with a
    re-measured spotlight; Back is visibly disabled on step 1; the last step's control reads
    "Got it" and ends the tour; Skip ends immediately; Android hardware back ends immediately.
  - Taps on the spotlit control, on the dim, and on the tab bar change nothing.
  - Empty-state samples: appear only on an empty fridge / shopping list / empty chat, only while
    that tab's tour runs, carry the notice, and vanish on finish, skip, or as soon as a real item is
    added. Home keeps real counts.
  - Reveal steps still open the real dropdowns (`chat.attachOptions`, `fridge.addOptions`) with both
    rows visible inside the spotlight, and neither row reacts to a tap.
- System: samples never reach `GlobalContext` / `ChatContext` state, storage, or the AI request —
  confirm by adding an item, checking `streamlineLists` behaviour, and sending a chat turn after
  the tour; only one sample mechanism exists (shared `utils/tutorialSamples.js`, no per-screen
  copy).
- Repository: `npm run test:unit` → all tests pass including the new guards;
  `node scripts/check-i18n-keys.cjs` → no missing keys; `npm run lint` (`expo lint`) → clean.
- Manual: Settings → Preferences → Replay page tutorials re-runs every tab including the new
  controls, and re-entering a finished tab does not replay it.

## Stop conditions

- Stop if the tour must stay escapable by tapping the dimmed background (that is a product decision
  for the owner, not an implementation detail) — the inert dim is the core of Part A.
- Stop if Part B requires persisting sample data, mutating it, or showing it outside a running tour;
  that breaks the render-only contract and the AI-context guarantee.
- Stop if `MessageList` turns out to need an active conversation id or a non-empty context to render
  the sample messages — re-check the branch at `app/(tabs)/chat.js:602-624` before widening scope.
- Stop if the sample `tagIds` cannot be resolved from the live preset tags (for example a future
  refactor removes `tags` from `GlobalContext`), and report instead of hard-coding tag ids.
- Stop if Part A needs the tab bar height (that means the de-modalized variant was chosen); record
  the tradeoff and ask before touching `app/(tabs)/_layout.js`'s tab bar.

## Design documentation

- No `DESIGN.md` exists in this repository, so nothing outside the code needs updating.
- After acceptance and validation, record the two decisions where they will be read next:
  the interaction contract ("progression is explicit — Back, Skip, Next; the dim is inert; Android
  back dismisses") in the header comment of `components/TabTutorialOverlay.js`, and the sample
  contract ("render-only, only on an empty collection during that tab's tour, never persisted or
  sent to the AI, always labelled") in the header comment of `utils/tutorialSamples.js`.

## Risks / open questions

- Removing tap-to-advance changes a deliberate interaction (the code comment promised it). If the
  owner wants it back, the safer variant is to keep advancing only from the dim regions that can
  never be the tab bar (the strip above the spotlight and the two side strips), which needs no new
  geometry — but the same tap then behaves differently between steps that place the card above and
  below the anchor, which is why it is not the primary proposal.
- The tab bar stays dimmed and inert during a tour; that is modal semantics, but it is the part most
  likely to be questioned on device review. Restoring navigation means dropping the `Modal` for an
  in-tree overlay inset above the tab bar (loses `statusBarTranslucent` and `onRequestClose`, needs
  `BackHandler`, and makes "leave the tab mid-tour" a pause that does not mark the tab seen) — a
  separate change with its own plan.
- Back navigation re-measures the anchor (`measurementKey` changes). Expect one frame of centered
  card; if it reads as a flicker on device, reuse the previous rect until the new measurement lands.
- Sample rows are rendered by the real row component, so they look real. The notice line is the only
  signal; if it proves too weak on device, extend it (for example a leading chip inside the section
  header) rather than restyling the rows.
- Fridge samples make the fridge show three items while Home shows zero. That is deliberate (Home's
  cards are live counts) but should be confirmed with the owner in the same review.
- Chat samples contain a plausible assistant answer. Keep them text-only; any `ui_action` or
  `recipe_cards` sample would render a tappable proposal card over data that does not exist.
