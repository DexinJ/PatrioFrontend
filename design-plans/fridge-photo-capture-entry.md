# Fridge add menu with photo capture (camera folded into the + button)

Written against: `8615c7b`, built on the current working tree (which already carries unrelated edits to `api/gpt.js`, `app/(tabs)/chat.js`, `components/MessageInput.js`, `components/PlusMenu.js`, `locales/en.json`, `locales/zh.json`, the new `hooks/` folder, and others). Do not reset to `HEAD`.

This plan is the output of a UI review of a proposed change to the Fridge screen — a control that goes straight to taking a picture — not of an existing defect. The first draft placed it in a second floating button beside the existing `+`; the reviewed design below supersedes that and folds capture into the `+` button itself, mirroring the chat screen's attach menu. It was produced read-only against product source; nothing in this document has been implemented.

Status: **applied** on 2026-10-12 (uncommitted), including the `TAB_TUTORIAL_VERSION` bump to 3. See `design-plans/fridge-photo-capture-code-preview.md` for the code as written and the one implementation difference.

## Evidence chain

- Surface: `app/(tabs)/fridge.js` — the Fridge tab: header (`components/Header.js:HeaderWithButton` via `navigation.setOptions`, `fridge.js:110-122`), top block (`SearchAndSortBar` + `FilterTabsRow`, `fridge.js:551-570`), list, empty state (`fridge.js:572-574`), floating add button (`fridge.js:620-630`), edit-mode bars.
- Problem (design, not behaviour): the screen offers exactly one create action — the `+` FAB at `fridge.js:620-630`, which opens the manual `ItemFormModal` (`fridge.js:644-658`). Photographing a shelf or a receipt exists only on the Chat tab, behind `components/PlusMenu.js` → "Take a Photo". Nothing on the Fridge screen reveals that a photo can populate the fridge at all.
- Problem (empty state): `fridge.js:572-574` renders only `<Text>{emptyText}</Text>` (`fridge.emptyFridge` / `fridge.noMatches`). The one moment when capture has the most leverage — an empty fridge — is the one moment the screen offers no action.
- Design evidence (the system that governs this surface):
  - `components/FloatingAddButton.js` is the only FAB primitive. It already accepts `icon` (default `"add"`), `style`, `disabled`, `accessibilityLabel`, and `tutorialTargetId`, and its wrapper carries `position: absolute; bottom: 30; right: 20` (`FloatingAddButton.js:44-47`). `tutorialTargetId="fridge.addButton"` at `fridge.js:625`.
  - `components/Header.js` exposes `HeaderWithButton` (text-only right button, used by the fridge header) and `IconHeader` (left/right icon groups, used by `app/(tabs)/_layout.js:101`). The fridge header is the text variant.
  - `components/SearchAndSortBar.js:37-48` is a `flexDirection: "row"` with `gap: 10` and one trailing 44×44 control (`styles.sortBtn`); the row is a plain flex row with no slot reserved for a third control.
  - Chat's photo entry, which this redesign copies: `components/PlusMenu.js` owns its `+` button **and** an in-tree dropdown (`styles.menu` = `position: absolute; bottom: 50; left: 10`) whose rows are `plusMenu.takeAPhoto` (camera) and `plusMenu.chooseFromGallery` (image library). It delegates capture to `hooks/usePhotoCapture.js` and exposes `menuVisible = menuOpen || revealOptions` so the tour can force it open; `utils/tabTutorials.js:shouldRevealAttachMenu` exists solely to drive that reveal.
  - Fridge → assistant precedent: `openRecipesForItems` (`fridge.js:300-365`) does `router.push("/chat")` then `streamMessage({ text: prompt, displayText, uiAction, selectedIngredients })`, and reports real failures with `Alert.alert` while swallowing `REQUEST_CANCELLED`.
  - Applying what comes back: the assistant's `add_all_to_fridge` proposal is applied by `handleUiAction` in `app/(tabs)/chat.js` against `utils/fridgeProposal.js`, and reports success as a transcript message ("✅ Added N items"), not as an `Alert.alert`.
  - Tutorial model: `utils/tabTutorials.js` — fridge steps are `searchBar`, `filterTabs`, `items`, `itemsMenu`, `addButton`, `editButton`; `TAB_TUTORIAL_TAB_VERSIONS.fridge = 2`; `TAB_TUTORIAL_VERSION = 2`. `tests/tabTutorials.test.js` proves every non-null `targetId` appears as a quoted literal under `app/` or `components/`, that every step has copy in **both** locales, and that each tab declares its own version.
  - Feedback contract: the earlier review found success confirmations use blocking `Alert.alert` (`fridge.js:377-385`) and that no toast pattern exists. A photo that lands in the chat transcript avoids that problem entirely, because the assistant answers in the transcript.
- Owner: `app/(tabs)/fridge.js` owns the surface; `components/FloatingAddButton.js` owns the floating-action pattern; `hooks/usePhotoCapture.js` owns capture; `app/(tabs)/chat.js` owns the proposal card that applies the result.
- Scope and affected surfaces: Fridge screen (default and edit mode, empty and populated, light and dark, EN and ZH), the fridge coach-mark tour, and the two locale files. Chat, Shopping List, and the composer are consumers only through the existing photo/proposal pipeline.
- Uncertainty: none about the existing owners. The one open question from the earlier draft — where the capture control lives — is answered below by folding it into the existing `+` button, which removes the second floating button entirely. What remains is the cost of one extra tap on manual add, recorded under Stop conditions.

## Design decision

The `+` button stops being a shortcut to a single form and becomes the screen's one add menu, exactly as the chat `+` already is. One tap opens a small dropdown anchored above the button:

1. **Take a photo** — camera capture, reusing `hooks/usePhotoCapture.js`.
2. **Choose from gallery** — library capture, the same hook's second entry point, kept so the fridge menu and the chat attach menu offer the same two photo sources.
3. **Add manually** — the existing `ItemFormModal` add flow.

Photo rows first, so the menu mirrors the chat attach menu's order (`plusMenu.takeAPhoto` → `plusMenu.pickFromGallery`) exactly, the new capability is the first thing read, and the two image sources stay adjacent. Manual add lands last, which costs it reading prominence but puts it nearest the thumb, since the menu opens upward from a bottom-right button. At three rows the difference is small — every row is one tap from the open menu — so this is a polish decision, not a correctness one.

The labels stay action-shaped and short. The obvious rewrite ("Take a photo of your fridge or a receipt") was rejected because the target is a list, not a noun: a shelf, a receipt, the fridge, a shopping bag. A label that tries to cover it becomes a sentence, breaks parallelism with "Add manually", and makes the rows unequal — and the app already solved this the right way. `tutorial.tabs.chat.attachOptions.body` states the target list and the outcome ("Take a live photo of a shelf, a receipt, or your fridge — or choose one you already have. The assistant reads it and adds what it finds to your inventory."), while the menu rows stay generic. The fridge copy mirrors that split: generic rows, specific copy in the tour step and in the accessibility labels.

The accessibility bar for this change is discoverability, labeling, and skippability — not making photography performable without sight. Framing a shot and confirming what was captured are visual tasks, and a descriptive label does not change that. What matters is that nothing is gated behind the camera: every outcome the photo path reaches (items identified and added) is reachable by typing the item into the manual form or by asking the assistant in text, and the assistant's answer comes back as chat text that a screen reader already reads. A blind user loses speed on this route, not capability — so the requirement is that the menu announces itself clearly enough to be used deliberately or skipped deliberately, which is what the semantics and labels above provide.

The trade is deliberate and stated plainly: manual add goes from one tap to two. It buys a single add entry point per screen, parity with the chat composer's `+`, no second floating button, and a camera path that is discoverable from the screen where it is useful.

Capture still ends in the existing chat pipeline: `router.push("/chat")` then `streamMessage(...)`, exactly like `openRecipesForItems`. The assistant reads the photo and proposes items through the `add_all_to_fridge` card that already exists, so there is no new apply path, no new proposal state, and success feedback stays in the transcript instead of an interrupting modal.

A photo is sent with a localized text prompt rather than as an image-only turn. The image-only composer path is well travelled, but the fridge path calls `streamMessage` directly from a screen that also supplies `displayText`; sending text alongside the photo keeps that branch identical to the recipe flow that already works and removes any dependence on the `chat.errors.messageEmpty` ordering at `api/gpt.js:1749`.

The dropdown is plain in-tree UI, not a `Modal`. That is a hard constraint, not a preference: the tutorial overlay is itself a modal `Pressable`, so a second modal menu cannot be revealed underneath it — the same reason the chat tour's `attachOptions` step works while the fridge's `ActionGridPopover` step cannot be revealed. Keeping the menu in-tree is what lets the fridge tour show the new rows.

Rejected alternatives:

- **A second floating button** (the previous draft). Two FABs on one screen compete for the same primary action and give an occasional action permanent visual weight.
- **A control in the header or the search row.** `HeaderWithButton` is text-only and `SearchAndSortBar` has no slot; both would promote an occasional action into screen chrome.
- **Empty state only.** It disappears the moment the fridge has one item, which is when capture is still most useful. Kept as a follow-on rather than part of this change.

## Reuse

- `components/FloatingAddButton.js` — `icon`, `style`, `disabled`, `accessibilityLabel`, `tutorialTargetId`.
- `hooks/usePhotoCapture.js` — permission prompts, downscale/JPEG preparation, and the `{ text, imageUri, imageRequestUri, isUser }` payload. Consumed today by `components/PlusMenu.js`.
- `theme.actionButton`, `theme.accent`, `theme.card`, `theme.border`, `theme.textPrimary`, `theme.textSecondary` — `context/GlobalContext.js`.
- `router.push("/chat")` + `streamMessage` launch and its `REQUEST_CANCELLED` handling — `openRecipesForItems`, `fridge.js:300-365`.
- `components/TutorialTarget.js` and the per-tab version map in `utils/tabTutorials.js`.
- `common.addItem` and the existing `fridge.*` copy register — `locales/en.json`, `locales/zh.json`.
- No new primitive is required, and no second floating-button pattern is introduced: the button stays `FloatingAddButton` and the dropdown mirrors an existing owner rather than re-inventing one.
- Exemplar: `components/PlusMenu.js` — a dropdown owned by the same component as its `+` button, in-tree and absolutely positioned, with `menuVisible = menuOpen || revealOptions`.

## Changes

1. `components/FridgeAddMenu.js` (new)
   - Change: own the FAB and its dropdown, mirroring `components/PlusMenu.js`: render `FloatingAddButton` with `tutorialTargetId="fridge.addButton"`, hold `menuOpen`, and render the dropdown inside `<TutorialTarget id="fridge.addOptions">` with three rows in order (`camera` → Take a photo, `image` → Choose from gallery, `plus` → Add manually). Props: `{ theme, fontSize, disabled, revealOptions, busy, onAddManually, onTakePhoto, onPickPhoto }`. Close on selection, and reset `menuOpen` whenever `revealOptions` flips true so a forced-open menu cannot leak — stricter than `components/PlusMenu.js`, which relies on `menuOpen` already being false and has no reset. (Implemented as a render-phase adjustment; this repo's lint rejects a synchronous `setState` inside an effect.)
   - Change (assistive tech): the open dropdown sets `accessibilityViewIsModal` so VoiceOver keeps focus inside it instead of wandering back into the list — the same prop `components/TabTutorialOverlay.js:132` and `components/SortSheetModal.js:32` already use for the app's modals. Announce the open with `accessibilityLiveRegion="polite"` on the container (precedent: `app/_layout.js:151`, `app/(tabs)/_layout.js:465`), and move screen-reader focus to the first row with `AccessibilityInfo.setAccessibilityFocus` once it mounts. The trigger reports its `expanded` state.
   - Known limitation, deliberately out of scope: focus is **not** restored to the `+` button when the menu closes. That needs a ref on the button, and `components/TutorialTarget.js` spreads unknown props onto its host `<View>` *after* its own `ref={setRef}`, so a ref passed through it would silently replace the tutorial's anchor registration. A focus nicety is not worth risking every coach mark in the app; iOS falls back to the nearest remaining element.
   - Preserve: the button's geometry, colour, disabled treatment, accessibility label, and tutorial id; its rendered output is unchanged. `components/FloatingAddButton.js` gains one optional `expanded` prop (defaults to `undefined`, one consumer) so the trigger can report the menu state — part of the design now rather than an exception, because only the accessibility state gains a field.
   - Verify: tapping the button opens the dropdown above it; each row calls exactly its handler; the menu closes after a selection; with VoiceOver/TalkBack on, opening the menu announces it and lands on Take a photo, and closing returns to the `+`.

2. `app/(tabs)/fridge.js`
   - Change: replace the bare `FloatingAddButton` (`fridge.js:620-630`) with `<FridgeAddMenu />`; add `const { busy, takePhoto, pickPhoto } = usePhotoCapture({ onCapture: handlePhotoCaptured });`; add `handlePhotoCaptured({ imageUri, imageRequestUri })` mirroring `openRecipesForItems` — guard on the existing busy/generation refs, `router.push("/chat")`, then `streamMessage({ text: t("fridge.photoPrompt"), displayText: t("fridge.photoDisplayText"), imageUri, imageRequestUri })`, and on failure (excluding `REQUEST_CANCELLED`) `Alert.alert(t("fridge.photoTitle"), error?.message || t("fridge.photoFailed"))`. Compute `revealOptions` from `useTabTutorial()` for the new fridge step.
   - Preserve: Add manually still calls `setAddModalVisible(true)` and opens the same `ItemFormModal`; edit mode still disables the button; list padding (`paddingBottom: editMode ? 170 : 110`), sorting, filters, and the long-press menu are untouched.
   - Verify: `+` opens the menu instead of the form; Add manually reaches the form; Take a photo and Choose from gallery both land on Chat with the photo, the prompt, and a proposal.

3. `utils/tabTutorials.js`
   - Change: generalize the reveal helper to cover both hidden menus, raise `TAB_TUTORIAL_VERSION` to `3`, set `TAB_TUTORIAL_TAB_VERSIONS.fridge` to `3`, leave `home`, `chat`, `list`, `settings` at their current numbers, and insert an `addOptions` step (`targetId: "fridge.addOptions"`) after `addButton`.
   - Change: that step's `body` carries the "photograph what?" answer, mirroring `tutorial.tabs.chat.attachOptions.body` with fridge framing — name the targets (a shelf, a receipt, the fridge) and the outcome (the assistant reads it and adds what it finds). Its `title` names the menu, since the step is the one place the rows are explained in words.
   - Preserve: `shouldRevealAttachMenu("chat", "attachOptions")` keeps returning true; only the fridge tour replays; every other tab keeps its seen version.
   - Verify: `tests/tabTutorials.test.js` passes, including that a device which saw the fridge tour at version 2 is taught again.

4. `locales/en.json` + `locales/zh.json`
   - Change: reuse `plusMenu.takeAPhoto` and `plusMenu.pickFromGallery` for the two visible row labels — they are already action-shaped and already read correctly in the fridge context. Add a new `fridge.addManually` for the third row, and the menu-specific accessibility labels `fridge.takePhotoA11y` / `fridge.pickPhotoA11y` ("Take a photo of your fridge, a shelf, or a receipt" and its gallery counterpart), following the precedent where the gallery row's visible label `plusMenu.pickFromGallery` and its accessibility label `plusMenu.chooseFromGallery` already differ.
   - Change: add `fridge.photoPrompt`, `fridge.photoDisplayText`, `fridge.photoTitle`, `fridge.photoFailed`, and `tutorial.tabs.fridge.addOptions.title` / `.body`, with matching Chinese copy in the existing tone.
   - Preserve: every existing key and the shared `plusMenu.*` pair — do not reword them, because the chat composer's attach menu reads them with a different meaning ("attach this to my message"). If fridge-specific visible wording is ever wanted, fork new keys rather than editing the shared pair.
   - Verify: both files parse, and the tutorial test's both-locales check passes.

5. `tests/tabTutorials.test.js` + `tests/fridgeAddMenu.test.js` (new)
   - Change: extend the reveal-helper cases to the fridge step (`("fridge", "addOptions")` true, cross cases false); assert the new `fridge.addOptions` target literal exists in source and that the new `fridge.*` keys resolve in both locales.
   - Preserve: existing cases and assertions unchanged.
   - Verify: `npm run test:unit`.

## Scope

- Inherit: the Fridge tab in default and edit mode, empty and populated, light and dark, EN and ZH; the fridge coach-mark tour.
- Verify: the shared `usePhotoCapture` hook after its second consumer exists (`components/PlusMenu.js` and `app/(tabs)/fridge.js`) — the composer's "Take a Photo" / "Pick from Gallery" behaviour must be unchanged; the chat proposal card must still apply `add_all_to_fridge`; the new dropdown must not collide with the edit-mode `SelectionActionBar` or with the list's last row.
- Verify (assistive tech): the chat attach menu (`components/PlusMenu.js`) has the same custom-dropdown gap — `accessibilityState={{ expanded }}` on the trigger, but no modal semantics, no focus move, and no announcement when it opens. This change leaves that one alone; if the fridge treatment works, applying the same props there is a small follow-on rather than part of this plan.
- Exclude: a second floating button, a header control, and a search-row control — the reviewed design rules out all three.
- Exclude: an action row in the empty fridge (`fridge.js:572-574`). The gap is real and remains a candidate follow-on plan, but it is a different change from this one.
- Exclude: the Shopping List and Home tabs; changing what the manual add form does; any toast/undo work — that is a separate decision already recorded elsewhere.
- Exclude: sending an image-only turn from the fridge. This plan always pairs the photo with a text prompt.

## Validation

- Product: on the Fridge tab, press `+`, choose Take a photo, photograph a shelf or receipt, and confirm the app lands on Chat with the prompt, the photo, and the assistant's proposed items, and that applying them adds the items to the fridge and reports success in the transcript. Repeat through Choose from gallery, and through Add manually to the existing form.
- Interface: menu open and closed; the three rows in the order Take a photo → Choose from gallery → Add manually; empty and populated fridge; edit mode (button disabled, menu unopenable); long-press menu; keyboard open on the search field; a 320px-wide device (the dropdown must fit above the button without clipping and must not cover the list's last row — the list reserves `paddingBottom: 110`); light and dark, EN and ZH; deny the camera permission and confirm the existing `plusMenu.cameraPermissionTitle` alert is what the user sees.
- Interface (assistive tech): with VoiceOver and TalkBack, confirm that opening `+` announces the menu and moves focus into it rather than on through the list; that the three rows are read in order and the two photo rows announce what to photograph rather than just "Take a photo" / "Pick from Gallery"; that dismissing returns focus to the `+`; and that typing an item into the manual form still reaches the same outcome, so the photo route can be skipped deliberately.
- System: confirm there is no second capture implementation, no new floating-action primitive, and no new proposal/apply path; confirm the tour step spotlights the real button.
- Repository: `npm run test:unit` → all unit tests pass (the pre-existing `tests/aiProviderSlotComparison.test.js` failure — it imports the absent `refactor/aiProviderSlotModel.js` — is unrelated and must be ignored); `npm run lint` → no new errors.

## Stop conditions

- Stop if the extra tap on manual add is judged unacceptable on product grounds — the fallbacks are a long-press shortcut on the `+` (long-press is already an established gesture in this app, see `components/InventoryListItem.js`) or returning capture to a control of its own.
- Stop if the dropdown cannot be revealed under the tutorial overlay: that means it was implemented as a `Modal`, and it has to stay in-tree.
- Stop if the assistant's photo → `add_all_to_fridge` proposal cannot be reached from a fridge-initiated `streamMessage` call, or if sending text alongside the photo changes the transcript in a way the recipe flow does not already demonstrate.
- Stop if `hooks/usePhotoCapture.js` grows a second responsibility (state, navigation, or proposal handling) instead of staying a capture helper.
- Stop if the in-tree dropdown cannot be made discoverable to screen readers (open announcement, focus into the rows, focus back to the trigger). The fallback is a real bottom sheet with native semantics, but that cannot be revealed by the tour — so the two constraints need a decision rather than a silent swap.
- Stop if raising the fridge tutorial version would re-teach tabs other than `fridge`.

## Design documentation

- After acceptance and validation: record in `docs/CODEBASE_REPORT.md` that the Fridge tab's `+` button is an add menu (Take a photo / Choose from gallery / Add manually) whose photo routes go through the chat photo/proposal pipeline, that the two photo rows carry descriptive accessibility labels, and that the fridge tour is versioned independently. No `DESIGN.md` governs this surface at `8615c7b`.
