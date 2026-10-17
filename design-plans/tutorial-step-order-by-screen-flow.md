# Tutorial: order the chat tour by screen flow, keeping every step

Written against: `8615c7b`, on the current working tree (which already carries unrelated uncommitted
edits to `app/`, `components/`, `context/`, `api/`, `locales/`, and this `design-plans/` folder).
Do not reset to `HEAD`.

## Status

Implemented in this working tree for Chat only.

- `utils/tabTutorials.js` — `TAB_TUTORIAL_VERSION` 3 → 4; `chat` 2 → 4; the chat step list is
  `header`, `messages`, `composer`, `attach`, `attachOptions`.
- `tests/tabTutorials.test.js` — the two constant-coupled version assertions now derive from
  `getTabTutorialVersion(tabKey)`, plus three new invariants (chat order, reveal adjacency, global
  version equals the newest tab version).
- Change 5 below (the `PlusMenu` hand-off) was **not** taken; the reveal finale still relies on the
  menu not already being open.
- The Fridge and Shopping List trim was considered and dropped on review; the reasoning is kept under
  Deferred.

Verification run: `npm run test:unit` → 278 pass, 1 failure unrelated to tutorials
(`tests/aiProviderSlotComparison.test.js` imports a missing `refactor/aiProviderSlotModel.js`).
`node scripts/check-i18n-keys.cjs` → 1 pre-existing false positive, the template-literal key
`chat.suggestions.meals.${mealForDate(now)}` at `app/(tabs)/chat.js:139`. No device pass yet: card
placement and the reveal finale still need eyes on hardware.

## Goal

Chat is the only tour that doubles back. It spotlights the plus button, then the menu that button
opens, and only last the composer row that contains both. Reorder those three steps so the spotlight
descends the screen and narrows as it goes.

- New order: `header` → `messages` → `composer` → `attach` → `attachOptions`.
- No step is added, removed, or reworded. No component changes. No locale changes.
- No other tab changes, and no other tab replays for existing users. The only other edit is the
  shared version constant.

## Evidence chain

- Step lists: `utils/tabTutorials.js:62-95` (chat: `header`, `messages`, `composer`, `attach`,
  `attachOptions`), `:96-139` (fridge), `:36-61` (home), `:140-171` (list), `:172-185` (settings).
- The inversion, before this change: `app/(tabs)/chat.js:679-687` wraps `<MessageInput>` in
  `<TutorialTarget id="chat.composer">`, and `components/MessageInput.js:137-139` wraps `<PlusMenu>`
  in `<TutorialTarget id="chat.attach">` *inside* that component. `chat.composer` is therefore the
  parent rect of `chat.attach`: the tour drilled into the child (step 3), its menu (step 4), and only
  then named the parent (step 5).
- The reveal, which stays: `components/PlusMenu.js:21` (`const menuVisible = menuOpen || revealOptions`)
  is fed by `components/MessageInput.js:122-124` through `shouldRevealMenu("chat", currentStep?.id)`
  (`utils/tabTutorials.js:220-224`). The dropdown under the spotlight is display-only — the overlay is
  modal and its rows are inert (`design-plans/tutorial-gestures-and-sample-content.md`).
- Because the reveal step stays, the last card of the chat tour describes a menu the overlay has
  opened, and that menu closes when the tour finishes. That is the accepted cost of this version of
  the change; it is why the design decisions below drop an invariant the first draft carried.
- Forced-state reset, for the finale hand-off: `components/FridgeAddMenu.js:47-57` resets its own
  toggle when `revealOptions` flips true, and its comment records that `PlusMenu` does not. `PlusMenu`
  has no equivalent (its only readers of `revealOptions` are `:21` and `:50`), so a menu the user
  opened before a replay can still be open after the tour ends. Change 5 closes that gap and was
  deliberately left out of this implementation.
- Prior intent being preserved: `design-plans/tutorial-photo-options-and-hold-menu.md` added
  `attachOptions` deliberately, to *show* the two photo rows instead of describing them. This plan
  keeps that demonstration in Chat and only moves it.
- Version coupling: `utils/tabTutorials.js:10` and `:15-21`. Two tests compared against the global
  constant — `tests/tabTutorials.test.js:80` and `:86` — which only passed while the tab under test
  happened to sit at the global version. They now read the tab's own version, so the next tab that
  moves ahead cannot break them.
- Constraints any reorder must respect (`tests/tabTutorials.test.js`): unique step ids per tab
  (`:32-40`), non-empty title and body in both catalogs (`:42-56`), anchored ids carrying their tab
  prefix (`:119-132`), each anchored id appearing as a quoted literal under `app/` or `components/`
  (`:134-166`), and the forward/back walk over every tour.
- Tutorial mechanics that are *not* touched: `context/TabTutorialContext.js` (anchor registry,
  measurement retries, session shape), `components/TabTutorialOverlay.js` (card placement, Back /
  Skip / Next), `utils/tutorialSamples.js` (empty-state samples), and the `replay` steps.

## Design decisions

**1. Order the tour by screen flow, not by importance.**

A coach mark can only sit where its control lives, so ranking steps by importance produces a
spotlight that teleports — bottom-row input, then header, then a row in the middle — and the tour
stops reading as a walkthrough of the screen in front of the user. Spatial flow is the backbone.
Importance decides two things only: which step goes first (orientation), and which control deserves
the finale.

There is also a hard dependency: a step that force-opens a dropdown must directly follow the step
that spotlights its trigger, or the tour shows an open menu with nothing introducing it.

**2. Chat: `composer` before `attach`, and `attachOptions` stays.**

The composer is the parent rect of the plus button, so the old order named the container after the
child it contains. Moving `composer` ahead of `attach` fixes that without touching a key, id, target,
or component; the reveal keeps working exactly as it did.

Keeping `attachOptions` means the tour now *ends* on a step that force-opens a dropdown. Accepted,
with the cost stated plainly: the last thing on screen is a menu that closes the moment the user taps
"Got it", and while it is open its two rows are inert. That is the price of demonstrating the photo
path inside Chat, which is the owner's call on this change. The alternative — deleting the step — is
what this revision drops; see Stop conditions.

**3. Keep the adjacency rule; drop the "a reveal step is never last" rule.**

The first draft of this plan banned a reveal step from being the finale. That rule and "keep
`attachOptions`" cannot both hold, so the rule goes and the risk is documented instead. What survives
is the part that prevents an unexplained menu: a reveal step must directly follow its trigger. Both
tours satisfy it — chat `attach` → `attachOptions`, fridge `addButton` → `addOptions` — and both are
covered by tests.

**4. Fridge, Shopping List, Home, and Settings keep their order and their versions.**

- Fridge and List are task-ordered — find → filter → browse → act on an item → add → bulk edit — and
  both end on a non-reveal step. Pure spatial order there would open on the header Edit button, the
  weakest content on the screen, because the header sits above the search bar.
- The Fridge tour keeps its seventh card (`editButton`) even though it is the longest tour in the
  app. That card's copy teaches outcomes the "Edit" label does not imply — select several items, then
  move them to the shopping list or find recipes — and dropping it would push the tour's finale onto
  `addOptions`, a forced-open menu. Shorter is not automatically better when the card being cut is
  the only one that names those two capabilities.
- Home opens on orientation ("which account is signed in") and is the only tour that ends on a
  centered epilogue card instead of an anchored control.
- Settings is two steps and has no ordering question.

## Reuse

- The five existing chat step objects — same ids, `targetId`s, `titleKey`s, `bodyKey`s. Nothing new
  is authored, so no locale key, anchor, or component is added or removed.
- `shouldRevealMenu` (`utils/tabTutorials.js:220-224`) — unchanged, both branches kept.
- `TAB_TUTORIAL_TAB_VERSIONS` (`utils/tabTutorials.js:15-21`) — the per-tab map is what keeps the
  re-teach scoped to Chat, which is the whole answer to "what changes on the other screens".
- `components/FridgeAddMenu.js:47-57` — the forced-state reset pattern to mirror in `PlusMenu` for
  change 5.
- `tests/tabTutorials.test.js` — the existing guards (ids, both catalogs, tab prefix, source
  literals, walk, reveal helper) all stay valid as written.

## Changes

1. `utils/tabTutorials.js` — version the change. **Implemented.**
   - Change: `TAB_TUTORIAL_VERSION` `3` → `4`; `chat` `2` → `4` in `TAB_TUTORIAL_TAB_VERSIONS`.
     Leave `home: 1`, `fridge: 3`, `list: 1`, `settings: 1` untouched, so those four tours neither
     change nor replay. `4` becomes the newest tab version, keeping the global constant equal to the
     maximum of the map.
   - Preserve: the header comment's model (one number per tab, the global bumped when any tab's steps
     change) and the freeze.
   - Verify: `getTabTutorialVersion("chat")` is `4`, `getTabTutorialVersion("fridge")` stays `3`, and
     a user who finished the old chat tour is taught it again.

2. `utils/tabTutorials.js` — move one entry in the chat step list. **Implemented.**
   - Change: the `composer` object now sits above `attach`; `attachOptions` stays directly after
     `attach`, and the array stays five entries: `header`, `messages`, `composer`, `attach`,
     `attachOptions`. A comment above `composer` records why.
   - Preserve: every id, `targetId`, `titleKey`, and `bodyKey` exactly as they are; the `home`,
     `fridge`, `list`, and `settings` arrays byte-for-byte.
   - Verify: the array order above, and every anchored id still carries the `chat.` prefix.

3. `tests/tabTutorials.test.js` — fix the two version-coupled assertions. **Implemented.**
   - Change: `:80` and `:86` derive their value from `getTabTutorialVersion(tabKey)`.
   - Preserve: the assertions' meaning — a tab is unseen until marked at its own version, and one
     version below its own re-teaches it. `:179`'s unknown-tab fallback to `TAB_TUTORIAL_VERSION`
     stays.
   - Verify: `npm run test:unit` passes with the global at 4 and fridge at 3.

4. `tests/tabTutorials.test.js` — encode the order invariants. **Implemented.**
   - Change: three new cases — the chat tour teaches `composer` before `attach` (with a comment
     naming `MessageInput` as the nesting source); every reveal step directly follows its trigger
     (chat `attach` → `attachOptions`, fridge `addButton` → `addOptions`); and
     `TAB_TUTORIAL_VERSION === Math.max(...Object.values(TAB_TUTORIAL_TAB_VERSIONS))`.
   - Preserve: the reveal-helper case as written — it still asserts two dropdown steps — and the walk
     test, which covers the five-step chat tour automatically. No "reveal step is never last"
     assertion; the chat finale is one by design.
   - Verify: `npm run test:unit`.

5. `components/PlusMenu.js` — close the finale hand-off gap. **Not taken.**
   - Change: mirror `FridgeAddMenu`'s reset — keep the previous `revealOptions` in state and call
     `setMenuOpen(false)` when it flips true, so the tour's forced state cannot leave a menu open
     after the last card. Roughly four lines, no prop or signature change; the comment in
     `components/FridgeAddMenu.js:51-52` that names `PlusMenu` as the looser case would need updating
     in the same pass.
   - Preserve: the `menuVisible = menuOpen || revealOptions` OR, the user's own toggle, `busy`
     disabled states, and the dropdown's placement and children.
   - Verify: with the menu open before a replay, the last chat card ends with the menu closed.

## Scope

- Inherit: the five per-tab tours, via `utils/tabTutorials.js` and the version map.
- Touch: `utils/tabTutorials.js`, `tests/tabTutorials.test.js`, and (change 5, not taken)
  `components/PlusMenu.js`.
- Untouched: `components/MessageInput.js`, `components/TabTutorialOverlay.js`,
  `components/TutorialTarget.js`, `components/FridgeAddMenu.js`, `context/TabTutorialContext.js`,
  `utils/tutorialSamples.js`, both locale catalogs, and every screen.
- Exclude: deleting or rewording any card, the Fridge/List tour length question, a tab-bar step.

## Validation

- Repository: `npm run test:unit` (especially `tabTutorials`), `node scripts/check-i18n-keys.cjs`,
  `npm run lint` (`expo lint`).
- Manual, fresh state via Settings → Preferences → Replay page tutorials:
  - Chat: five cards in order `header`, `messages`, `composer`, `attach`, `attachOptions`; the
    composer card appears *before* the plus-button card; the final card shows the real menu open with
    both rows visible and inert, and finishing closes it.
  - Fridge: seven cards, unchanged, and `addOptions` still force-opens the real add menu.
  - Home, Shopping List, Settings: unchanged, and re-entering a finished tab does not replay it.
  - Both locales, and `fontSize` 12 / 16 / 24 for card placement on both phone sizes.
- Interface: device pass on iOS and Android for the final chat card — it anchors to a control low on
  the screen, and the card must not cover the menu it is describing.

## Stop conditions

- Stop if the finale must land on a non-reveal control. That requires deleting `attachOptions`, which
  this revision exists to avoid; take it as a separate decision rather than smuggling it in here.
- Stop if the re-teach cost is judged too high for a pure reorder. Then either keep
  `TAB_TUTORIAL_TAB_VERSIONS.chat` at `2` (existing users keep the old order, new users get the new
  one — a split experience worth confirming first) or drop the change.
- Stop if change 5 turns out to need a prop or state change beyond the reset — the fallback is to
  ship changes 1–4 alone and note the leak as pre-existing.

## Risks / open questions

- The finale is a forced-open menu that collapses when the tour ends, and its rows are inert while it
  is open. This is the accepted trade-off described in Design decisions 2, and the most likely thing
  to be questioned on a device review.
- Because change 5 was not taken, a menu the user opened before a replay can still be open after the
  tour finishes. Pre-existing behaviour, now more visible because the reveal step is the finale.
- Copy overlap between `tutorial.tabs.chat.attachOptions.body` and
  `tutorial.tabs.fridge.addOptions.body` — same photo subjects, same outcome. Both cards stay, so the
  overlap stays. Deferred, not a defect introduced here.
- Re-teaching cost: chat replays once for every existing user. The other four tabs do not, which is
  the point of the per-tab map.
- `docs/chinese-localization-comparison.md` lists `tutorial.tabs.chat.attach.body` and is already
  stale for that key (its "Shipped" column carries an earlier, longer sentence). No update is
  required, and this change rewords nothing.

## Deferred

- Fridge tour length (7 steps, the longest in the app) — reconsidered and kept, not deferred by
  accident. An earlier draft deferred it because a reveal step could not be the finale; that rule is
  gone (see Design decisions 3), so the real trade-off is explicit: dropping `editButton` would get
  the tour to six cards but land the finale on the forced-open `addOptions` menu. If tour-completion
  data shows people skip the Fridge tour, the honest options are to drop `editButton` and accept the
  menu finale (and drop the Shopping List's `editButton` at the same time, for symmetry), or to fold
  the batch hint into the `itemsMenu` card and drop `editButton` cleanly.
- Shopping List `editButton`: the same cross-screen jump to the header, teaching bulk delete and
  select-all. Same deferral, same evidence needed.
- Home's `greeting` opener: the softest step in the app, kept because it also answers "which account
  is signed in".
- A step for the tab bar itself, still untaught (noted as out of scope in
  `design-plans/tutorial-gestures-and-sample-content.md`).
- The duplicated photo copy, if the two cards are ever consolidated.

## Design documentation

- No `DESIGN.md` exists in this repository, so the only written record is this folder: leave
  `design-plans/tutorial-photo-options-and-hold-menu.md` and
  `design-plans/tutorial-gestures-and-sample-content.md` in place — they explain why
  `attachOptions` exists and why its rows are inert during a tour.
- If accepted, the rules worth keeping next to the code are the three encoded in change 4: the tour
  follows the screen's flow, a reveal step directly follows its trigger, and the global version
  constant equals the newest tab version.
