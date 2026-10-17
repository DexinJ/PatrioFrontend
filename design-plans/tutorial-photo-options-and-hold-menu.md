# Tutorial: show the chat photo options and the fridge hold-to-open menu

Written against: `8615c7b`, built on the current working tree (which already carries unrelated edits to `app/(tabs)/chat.js`, `locales/en.json`, `locales/zh.json`, `components/MessageList.js`, `api/*`, plus the new `design-plans/` folder). Do not reset to `HEAD`.

## Goal

Two tutorial steps today only *describe* a control. Make them *show* it instead:

1. **Chat** - the two photo options behind the `+` button (Take a photo / Choose from gallery).
2. **Fridge** - press and hold an item to open its action menu (recipes, shopping list, edit, delete).

## Evidence chain

- Tutorial model:
  - `utils/tabTutorials.js` - one step list per tab; `TAB_TUTORIAL_VERSION = 1` at `:9`; chat steps at `:50-74` (`header`, `messages`, `attach`, `composer`); fridge steps at `:76-106` (`searchBar`, `filterTabs`, `items`, `addButton`, `editButton`).
  - `context/TabTutorialContext.js` - owns the anchor registry and the transient session. It measures the current anchor immediately, then again at 180 ms and 600 ms, and it re-measures whenever `registryVersion` changes (bumped by every `registerTarget`), so a control that mounts *after* a step starts is still picked up.
  - `components/TutorialTarget.js` - the anchor. Renders a host `View` with `collapsable={false}` and registers it by id; it does **not** forward refs.
  - `components/TabTutorialOverlay.js` - a full-screen transparent `Modal` with a dim layer and a spotlight hole. Its root is a `Pressable` that advances on tap and `accessibilityViewIsModal`, so **the user cannot operate the underlying screen during a step**. Any menu that should be visible must reveal itself.
- Chat photo options:
  - `components/MessageInput.js:110-113` wraps `PlusMenu` in `<TutorialTarget id="chat.attach">` (the anchor is the `+` button, not the options).
  - `components/PlusMenu.js:21` holds `menuOpen`; `:222` renders `{menuOpen && ( ... )}`. The dropdown is an ordinary in-tree `View` (not a Modal) positioned `absolute; bottom: 50; left: 10` at `:280-289`, with the two rows at `:241` (`plusMenu.takeAPhoto`, camera) and `:262` (`plusMenu.chooseFromGallery`, image library).
  - Current copy: `locales/en.json` `tutorial.tabs.chat.attach.body` = "Tap plus to take or choose a picture. The assistant can read a receipt, a shelf, or your fridge..." - it never names the two options.
- Fridge hold-to-open menu:
  - `components/InventoryListItem.js:147` fires `onLongPress` after `delayLongPress={longPressDelayMs}` (default 200 ms) and hands back a measured rect.
  - `app/(tabs)/fridge.js:508` `handleMeasuredLongPress` sets `contextItem` / `contextFromRect` / `contextMenuVisible`.
  - `app/(tabs)/fridge.js:695` renders `ActionGridPopover` with `contextActions` (`:422-461`: recipes, shop list, edit, delete).
  - `components/ActionGridPopover.js:52` wraps everything in `react-native-popover-view`'s `Popover` - i.e. a **second Modal**, which is why it cannot be relied on to render under the tutorial overlay.
  - Current copy: `locales/en.json` `tutorial.tabs.fridge.items.body` mentions "Long-press any item..." as one clause inside a paragraph about sorting/expiry, and the step is anchored to `fridge.items` - the entire `SectionList`, so the spotlight covers the whole list, not an item.
- Tests that constrain any change (`tests/tabTutorials.test.js`):
  - unique step id per tab; non-empty `title` + `body` in **both** `locales/en.json` and `locales/zh.json`;
  - every anchored `targetId` must start with the owning tab's prefix (`chat.`, `fridge.`);
  - every anchored `targetId` must appear as a quoted literal somewhere under `app/` or `components/`.
- Versioning: `markTabTutorialSeen` stores one shared `TAB_TUTORIAL_VERSION` per tab, so raising it to `2` re-teaches **all five** tabs, not just the two being edited.

## Design decision

**Chat - two steps, and the second one opens the real menu.**

- Keep `attach` (spotlight the `+`).
- Add `attachOptions`: while this step is active, `PlusMenu` forces its dropdown open, and a new anchor `chat.attachOptions` wraps that dropdown. The spotlight hole then lights up the two real rows, with copy that names each one.

This works because the dropdown is plain in-tree UI: it renders *below* the overlay, so the spotlight hole reveals it with no z-order work, and the `registerTarget` version bump makes the context re-measure once it mounts.

**Fridge - a dedicated step on a real row.**

- Insert `itemsMenu` after `items`, anchored to the **first rendered row** (new optional `tutorialTargetId` on `InventoryListItem`, mirroring `FloatingAddButton`'s existing `tutorialTargetId` prop).
- Do **not** auto-open the real `ActionGridPopover`: it is its own Modal and would fight the overlay for stacking. The copy names the four actions verbatim and the spotlight sits on the row the user must press.
- Reword `items` to lead with what the list shows; move the hold instruction entirely into `itemsMenu`.

Rejected alternative: copy-only edits to the existing two steps. That is the smallest diff but still a card that tells instead of showing, which is exactly what the request is about.

## Plan

1. **Version the change** - `utils/tabTutorials.js:9`.
   Raise `TAB_TUTORIAL_VERSION` to `2`.
   If re-teaching home/list/settings is unwanted, add a per-tab override map (e.g. `TAB_TUTORIAL_TAB_VERSIONS = { chat: 2, fridge: 2 }`) and read it in `getSeenTabVersion` / `markTabTutorialSeen`. Recommend the override map so only the two edited tabs re-tour; either way the existing "older version re-teaches" test keeps passing.

2. **Add the chat step** - `utils/tabTutorials.js:64-69`.
   Insert `attachOptions` (`targetId: "chat.attachOptions"`, `tutorial.tabs.chat.attachOptions.title/body`) between `attach` and `composer`. Reword `attach` so it stops pretending it already covers photos and instead says "tap `+` to open your photo options".

3. **Add a reveal helper** - `utils/tabTutorials.js` (exported, next to the other pure helpers).
   ```js
   // Steps whose host control must reveal itself while the step is active.
   export function shouldRevealAttachMenu(tabKey, stepId) {
     return tabKey === "chat" && stepId === "attachOptions";
   }
   ```
   Keeping this pure makes it unit-testable without rendering React Native.

4. **Wire the reveal into the composer** - `components/MessageInput.js`.
   Read `useTabTutorial()`, compute `revealAttachMenu = isActive && shouldRevealAttachMenu("chat", currentStep?.id)`, and pass it to `<PlusMenu onSend={handleSendImage} revealOptions={revealAttachMenu} />`.

5. **Reveal + anchor the options** - `components/PlusMenu.js`.
   - `const menuVisible = menuOpen || revealOptions;` and use it at `:210-212` and `:222`.
   - Wrap the dropdown (`:222-275`) in `<TutorialTarget id="chat.attachOptions">` (keep the existing `styles.menu` on the inner View; `TutorialTarget` must not become the positioned element or the offsets move).
   - Add an effect so the forced state does not leak: whenever `revealOptions` flips true, reset `setMenuOpen(false)`, so that when the step ends the dropdown closes even if the user had opened it earlier.
   - Leave `takePhoto` / `pickPhoto` / `busy` untouched - the step is display-only; the overlay's tap-to-advance means neither row is pressable during the tour.

6. **Give the fridge row an anchor** - `components/InventoryListItem.js`.
   Add an optional `tutorialTargetId` prop. Keep the existing `<View collapsable={false} ref={rowRef}>` (that ref is what measures the popover rect at `:130-140`) and wrap it in `<TutorialTarget id={tutorialTargetId}>` so the tutorial measures the same bounds without touching the popover path. `TutorialTarget` renders a plain `View`, so passing `undefined` is a no-op for every other list (shopping list reuses this component).

7. **Anchor the first row** - `app/(tabs)/fridge.js:515-535`.
   `renderItem` currently destructures only `{ item }` (`:516`), so widen it to `{ item, index, section }` and pass `tutorialTargetId={section === fridgeSections[0] && index === 0 ? "fridge.items.first" : undefined}`; add `fridgeSections` to the `useCallback` deps. If the list is empty the anchor never mounts, and the overlay correctly falls back to a centered card.

8. **Add the fridge step** - `utils/tabTutorials.js:90-95`.
   Insert `itemsMenu` after `items`, `targetId: "fridge.items.first"`, keys `tutorial.tabs.fridge.itemsMenu.title/body`. Copy should read as an instruction ("Press and hold any item...") and name all four actions: recipes, add to shopping list, edit, delete.

9. **Strings, both locales** - `locales/en.json`, `locales/zh.json`.
   Add `tutorial.tabs.chat.attachOptions` and `tutorial.tabs.fridge.itemsMenu`, and update `attach.body` and `fridge.items.body`. Keep the existing register (plain, second person, no jargon); zh mirrors the current simplified-Chinese tone. Both files are already dirty, so patch them in place rather than regenerating.

10. **Tests** - `tests/tabTutorials.test.js`.
    The existing guards already cover ids, both locales, tab prefixes, and source literals, so the new steps fail loudly if any of steps 2-9 is half-done. Add one focused case for `shouldRevealAttachMenu` (true only for `("chat", "attachOptions")`) and, if the per-tab version map is adopted, one for its fallback to `TAB_TUTORIAL_VERSION`.

## Verification

- `npm run test:unit` - especially `tabTutorials`; also `styleSheetAbsoluteFill` since the overlay is touched only via context.
- `npm run lint` (`expo lint`).
- Manual, fresh state (`clearTabTutorialSeen` / Settings -> Preferences -> Replay page tutorials):
  - Chat: step 3 spotlights `+`; step 4 shows the dropdown open with both rows lit through the spotlight, and it closes when the step advances.
  - Fridge: the new step spotlights a real item row, and the spotlight does not cover the whole list.
  - Both: overlay still dismisses, does not leave the dropdown open, and the tour ends after the last step.
- Re-entering a tab after finishing does not replay; Settings -> Replay re-runs all steps including the new ones.

## Risks / open questions

- Re-teaching scope: a global version bump replays the home/list/settings tours too. The per-tab override map (step 1) avoids that at the cost of a slightly larger change - worth a quick decision.
- The forced-open dropdown sits directly above the composer. The spotlight hole plus `+` button is the anchor, so the card will be placed above or below the hole; verify on a short screen that the card does not cover the dropdown it is describing.
- If a future change makes `PlusMenu`'s dropdown a real Modal, the chat reveal breaks the same way the fridge one would; the helper in step 3 is the single place that documents the assumption.
- Android `measureInWindow` on the newly mounted dropdown is covered by the context's 180/600 ms retries plus the registry bump; verify on a physical Android device, not only iOS.
