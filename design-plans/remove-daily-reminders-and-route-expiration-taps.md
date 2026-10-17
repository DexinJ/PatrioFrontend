# Remove daily reminders and route expiration-notification taps

Written against: `8615c7b`, on the current working tree (which already carries unrelated in-flight edits to `app/(tabs)/settings.js`, `app/(tabs)/fridge.js`, `context/GlobalContext.js`, `auth/useAuth.js`, `locales/en.json`, `locales/zh.json`, `utils/reminderPolicy.js`, and others). Do not reset to `HEAD`.

Status: **applied** on 2026-10-16 (uncommitted). See `design-plans/remove-daily-reminders-and-route-expiration-taps-code-preview.md` for the code as written, the two implementation differences, and the verification results. The plan below is kept as the record of what was decided.

## Verdict on the daily reminder

Remove it. It is not load-bearing, and it is the only one of the two reminders that can fire when there is nothing to do.

Three findings drive that:

1. **It duplicates the expiration alerts for the same information.** Same 9:00 AM delivery, same `remindDays` window, only difference being that its body carries a count instead of a generic line.
2. **Its body is frozen at sync time.** `api/reminderScheduler.js:84-92` renders the count once, when the schedule is built, and the repeating trigger replays that string. If the app is not opened for a week, the banner reports a stale count. A repeating notification cannot carry live data without a background job the app does not have.
3. **It is the reminder most likely to be felt as noise**, because the `reviewFridgeBody` fallback (`api/reminderScheduler.js:92`) fires on days with nothing expiring at all.

The one real thing it covers is worth keeping, though: **items that are already inside the notify window never get an expiration alert**, because `buildExpirationReminderSchedule` drops any trigger that is already in the past (`utils/reminderPolicy.js:69`). An item added today that expires in two days, with "Notify 5 days before", produces exactly nothing once the daily reminder is gone. Short-lived food — leftovers, fish, herbs, cooked dishes — is the category that lands there, which is the category where a reminder matters most. Phase 3 closes that hole without reintroducing a repeating daily nudge, and it is the part I would argue for; Phases 1-2 stand alone if you want the minimum.

## Goal

1. Delete the Daily Reminders feature: its toggle, its schedule, its strings, its tests, and its dead setting key.
2. Make tapping an expiration notification land on the item that notification is about.

Both are local-notification changes only. No push, no server, no new permissions.

## Evidence chain (current behaviour)

- Schedule owner: `api/reminderScheduler.js`. Marker `:9`, foreground handler `:12-19`, cancel-everything-then-reschedule with a "latest wins" queue `:21-48`, permission request `:55-61`, `performReminderSync` `:62-144`. Daily branch `:83-101` (`SchedulableTriggerInputTypes.DAILY`, `:96-99`), expiration branch `:103-125` (`SchedulableTriggerInputTypes.DATE`), shared title/body copy and `data.pantrioReminder` marker on both.
- Policy owner: `utils/reminderPolicy.js`. Sync gate `canSynchronizeReminders` `:3-15`, sync signature `buildReminderSyncSignature` `:17-38` (reads `notifications.turnOn`, `notifications.dailyReminders`, `expiration.expirationAlerts`, `expiration.remindDays`), `buildExpirationReminderSchedule` `:47-81` (9:00 local, `remindDays` before expiry, past triggers dropped at `:69`, sliced to `MAX_EXPIRATION_REMINDERS = 40` at `:1`), `countItemsExpiringWithin` `:83-95` (used only by the daily branch).
- Trigger owner: `context/GlobalContext.js`. Stored-settings merge `:230-320` including the `reminderPermissionRequested` gate on both toggles `:267-280` and the `expirationAlerts` restore `:293-296`; defaults `:337-341`; sync effect (debounced 750 ms, retry with backoff, cancelled on unmount) `:2063-2110`.
- Settings UI: `app/(tabs)/settings.js`. Permission request import `:54`, `updateReminderToggle` `:1098-1136` (asks for permission on enable, reverts the switch and offers "Open Settings" on refusal), Notifications section `:3110-3138` with the Daily Reminders row at `:3117-3138`, expiration sub-label `:3140-3142`, expiration switch row `:3143-3164`, notify-days slider row `:3166-3197`.
- Strings: `locales/en.json` + mirror in `locales/zh.json` — `settings.dailyReminders` `:937`, `settings.dailyRemindersA11y` `:938`, `notifications.dailyCheckTitle` `:1151`, `notifications.expiringSoon_one/_other` `:1152-1153`, `notifications.reviewFridgeBody` `:1156`. Key parity between the two locales is enforced by `scripts/check-i18n-keys.cjs` (used-keys-exist in en, then en/zh key-set equality).
- Tests: `tests/reminderPolicy.test.js` — count import `:7`, hydration-gate test `:10-29`, signature test `:31-50` (fixture carries `dailyReminders: true` at `:33`), expiration-schedule test `:52-62`, daily-count test `:64-72`. Harness: `scripts/run-unit-tests.cjs` runs every `tests/*.test.js`.
- Tap handling today: none. `Notifications.useLastNotificationResponse` is not imported anywhere; `api/reminderScheduler.js` is the only `expo-notifications` consumer (`:12`, `:22-30`, `:51-58`, `:96-135`). Taps therefore open the app wherever it was.
- Fridge surface for a landing target: `app/(tabs)/fridge.js` — `SectionList` `:661-692` (no `ref`, `extraData` at `:691`), decorated item fields `:174-176` (`_expired`, `_almostExpired`, `_expiresAtMs`), storage filter tabs `:189-202`, search+tab filter `:204-212`, sections `:288-308`, row renderer `:584-610`, `openEditForItem` `:483-487`, selection bar `:798-806`. Rows are `components/InventoryListItem.js` (computed background/border `:120-121`, `handlePress` `:139-146`, `styles.card` `:243-253`, `memo` `:273`). Tapping a row is currently a no-op outside edit mode, because `fridge.js` passes no `onPress`.
- Mount point for a router component: `app/(tabs)/_layout.js` — `ThemedTabs` renders `TabTutorialOverlay` and `EmailVerificationPrompt` at `:608-609`, inside the provider tree and *after* the hydration/`initializing` gate at `:372-373`, which is where the app already defers everything that needs `GlobalContext`.
- Sign-out today does not cancel reminders: `auth/useAuth.js:907-931` (`signOut`) only calls `firebaseSignOut`. Cancellation exists on the destructive paths through `purgeStoredUserData` (`api/userDataPurge.js:35`).
- Available API in the pinned `expo-notifications@57.0.10`: `useLastNotificationResponse` (`build/index.d.ts:26`), `Notifications.DEFAULT_ACTION_IDENTIFIER = "expo.modules.notifications.actions.DEFAULT"` (`build/NotificationsEmitter.d.ts:3`), `Notifications.clearLastNotificationResponse()` (`build/NotificationsEmitter.d.ts:105`), `NotificationResponse.actionIdentifier` and `notification.date` in seconds (`build/Notifications.types.d.ts:593-606`).

## Phase 1 — delete the daily schedule

1. `utils/reminderPolicy.js`
   - Delete `countItemsExpiringWithin` (`:83-96`).
   - Drop `dailyEnabled` (`:19`) and its two uses: the signature entry (`:24`) and the early-out condition (`:29`). The signature becomes `[turnOn, expirationAlerts, remindDays].join(":")` plus the existing item `id:expiresAt` list, which is what makes the sync effect re-run on exactly the inputs that still matter.
2. `api/reminderScheduler.js`
   - Drop `countItemsExpiringWithin` from the import (`:3-6`).
   - Delete the daily branch (`:83-101`) and `dailyEnabled` (`:65`).
   - Narrow the gate at `:68` to `if (!notificationsEnabled || !expirationEnabled) return { scheduled: 0, permission: "not-requested" };`.
   - Leave the marker, the handler, the cancel path, the permission helper, and the expiration branch untouched.

## Phase 2 — delete the toggle, its strings, its stored state, and its tests

1. `app/(tabs)/settings.js`
   - Delete the Daily Reminders row (`:3117-3138`). `updateReminderToggle` (`:1098-1136`) stays: the expiration switch at `:3153` still uses it, including the permission prompt.
   - Keep the "Notifications" section title (`settings.notifications`, `:3111`) and the `settings.expirationReminders` sub-label (`:3141`). With one switch left the sub-label is redundant but harmless; renaming the section to "Expiration reminders" and dropping the sub-label is a legitimate tidy-up that costs one extra key in each locale file — record the choice, do not do both.
2. `context/GlobalContext.js`
   - Drop `dailyReminders: false` from the defaults (`:337-341`).
   - Drop the restore lines `:278-280`.
   - Strip the retired key from stored settings rather than letting the `...storedNotifications` spread (`:276`) carry it forward forever; a small `normalizeStoredNotifications` helper that omits `dailyReminders` keeps the merge honest and the key disappears on the next settings write. The `reminderPermissionRequested` gate (`:267-268`, `:293-296`) must stay exactly as it is, or existing users lose their expiration-alert preference on upgrade.
3. Locales, both files, same keys in the same edit
   - Remove `settings.dailyReminders`, `settings.dailyRemindersA11y` (`en:937-938`, `zh:937-938`).
   - Remove `notifications.dailyCheckTitle`, `notifications.expiringSoon_one`, `notifications.expiringSoon_other`, `notifications.reviewFridgeBody` (`en:1151-1156`, `zh:1151-1156`).
   - Keep `notifications.couldNotCancel_one/_other` and `notifications.scheduleFailed` (`en:1157-1159`) — still used by the cancel and schedule-failure paths.
   - Do not touch `home.expiringSoon*` (`en:313-314`) or `fridge.expiringSoon` (`en:336`). Different namespaces, live features.
4. `tests/reminderPolicy.test.js`
   - Drop the `countItemsExpiringWithin` import (`:7`) and the daily-count test (`:64-72`).
   - Update the signature fixture (`:33`) to remove `dailyReminders: true`, and add an assertion that a stored `dailyReminders: true` no longer changes the signature. That test is what stops a half-revert from silently re-enabling a schedule nobody renders a toggle for.
5. Docs kept in step by convention: `docs/CODE_FILE_INVENTORY.md` (`:187`, `:406-413`, `:1002-1010`), `docs/CODEBASE_REPORT.md:223-225`, `README.md:17`. `design-plans/settings-option-titles-bold.md:29` cites the daily row's old line number — historical, leave it.

## Phase 3 — close the coverage gap (recommended)

Items already inside the notify window currently get no expiration alert, which is exactly what the daily reminder was covering. Fix it in the policy instead of in a second notification:

In `buildExpirationReminderSchedule` (`utils/reminderPolicy.js:47-81`), for each item with a valid, non-past `expiresAt`:

- `lead =` 9:00 AM local on the day `remindDays` before expiry.
- If `lead > now` → keep today's behaviour: `trigger = lead`.
- If `lead <= now` (the item is already inside the window) → `trigger =` the next 9:00 AM local strictly after `now`.

Still one pending notification per item, still capped at 40, still skipped for already-expired items. The effect is that an in-window item re-arms at the same 9:00 slot on each sync instead of being dropped — bounded, because the item leaves the schedule as soon as it expires or is deleted, and the sync's cancel-then-reschedule (`api/reminderScheduler.js:63`) prevents duplicates inside a day.

No new state, no new copy, no new locale keys: the notification keeps the existing title/body, and the tap-to-item routing from Phase 4 is what makes a repeat about a specific item legible.

State the trade plainly in review: an item that stays inside the window will produce one 9:00 notification per day until it is resolved. That is a narrower version of what the daily reminder did — it fires only when there is something to act on — but it is not "no reminders at all", so reject this phase explicitly if you want the removal to be absolute.

## Phase 4 — route expiration-notification taps to the item

### Design decision

Landing on the item means: the Fridge tab, the item's own row visible, and that row visually marked for a moment. There is no item detail screen in this app, so "the item" can only be a row, and the notification's own copy ("Open Pantrio to review…") asks for review, not edit. Auto-opening the edit modal (`openEditForItem`, `fridge.js:483-487`) is rejected on that basis: an accidental edit is a worse outcome than one extra tap.

The routing must also survive two awkward facts about local notifications, both handled below: the OS queue is per-device, so a notification scheduled under one account can be delivered after another account signs in; and `useLastNotificationResponse` keeps returning the last response for the life of the process, so a response must be consumed exactly once.

### New file: `utils/notificationRouting.js` (pure, unit-testable)

- `export const REMINDER_MARKER = "pantrio-local-reminder-v1"` — moved here from `api/reminderScheduler.js:9`, which imports it, so the scheduler and the router can never disagree about what "ours" means.
- `export const NOTIFICATION_ROUTE_MAX_AGE_MS = 5 * 60 * 1000`.
- `buildReminderRoute({ response, defaultActionIdentifier, now = Date.now(), maxAgeMs = NOTIFICATION_ROUTE_MAX_AGE_MS })` returns one of:
  - `null` — no response; `response.actionIdentifier !== defaultActionIdentifier` (a dismiss or a future custom action is not a tap); `data.pantrioReminder !== REMINDER_MARKER`; or the notification is older than `maxAgeMs` (`now - response.notification.date * 1000 > maxAgeMs`; `date` is `timeIntervalSince1970`, verified at `node_modules/expo-notifications/ios/ExpoNotifications/Notifications/NotificationRecords.swift:441`). The age window is what prevents a tap from being replayed minutes later, after a sign-in or a remount.
  - `{ kind: "fridge" }` — our marker, but no usable `itemId`. Covers a daily reminder still sitting in the OS queue from a build before this change.
  - `{ kind: "expiration", itemId }` — our marker, `data.kind === "expiration"`, non-empty string id.
- `resolveFocusedItemId(route, items)` returns the id only when the route is `{ kind: "expiration" }` and `items` contains it, else `null`. Keeping item data out of `buildReminderRoute` is deliberate: this second function is the account-switch guard, and it should be testable on its own.

### New file: `hooks/useNotificationRouting.js`

- `const response = Notifications.useLastNotificationResponse();`
- Consume once: keep the handled `{identifier, actionIdentifier, date}` in a ref, and call `Notifications.clearLastNotificationResponse()` after handling so a later remount cannot replay it.
- `buildReminderRoute(...)` → if `null`, return.
- `resolveFocusedItemId(route, fridgeItems)` → `itemId` or `null`.
- `router.navigate({ pathname: "/fridge", params: itemId ? { focusItemId: itemId, focusNonce: String(Date.now()) } : {} })`. `focusNonce` exists because a second tap on the same item must still be a state change for the screen effect; without it, params can compare equal across pushes. (`router.navigate` rather than `router.push` so repeated taps cannot stack duplicate entries; verify on device that params refresh when the Fridge tab is already focused and fall back to `push` + `setParams` if not.)
- No fallback alert when the item is gone: landing on the Fridge tab is self-explanatory, and an alert for a notification the OS already delivered is noise.

### Wiring: `app/(tabs)/_layout.js`

Render `<NotificationRouter />` beside `TabTutorialOverlay` / `EmailVerificationPrompt` (`:608-609`). That position gives the cold-start ordering for free: `ThemedTabs` returns early until `initializing` and `storageHydrated` are both settled (`:372-373`) and until the account is verified (`SessionBackedGlobalProvider`, `:136-176`), so the component does not exist before the providers it reads from are ready, and a tap that arrives while signed out routes nowhere. Combined with the age window and the consume-once clear, no tap can be replayed after a later sign-in.

### Landing behaviour: `app/(tabs)/fridge.js`

1. `const { focusItemId, focusNonce } = useLocalSearchParams();`, plus `const listRef = useRef(null)` passed as `ref={listRef}` on the `SectionList` (`:661-663`).
2. Effect on `[focusItemId, focusNonce]`: bail when the id is empty, or when `decoratedItems` holds no item with that id (deleted, or another account's item). Otherwise, in this order:
   - `setEditMode(false)` and `setSelectedIds(new Set())` — edit mode turns rows into checkboxes and raises the selection bar over the list (`:798-806`).
   - `setSearch("")` and `setActiveTab("All")` — either can hide the target (`:204-212`).
   - `setFocusHighlightId(id)`.
   - After a frame, find `(sectionIndex, itemIndex)` in `fridgeSections` (`:288-308`) and call `listRef.current?.scrollToLocation({ sectionIndex, itemIndex, viewPosition: 0.5, animated: true })` inside `try/catch`. `SectionList` throws for sections it has not measured, so this is best-effort: if it fails, the row is still on screen because the filters were cleared, at worst below the fold.
   - Clear the highlight after ~2.5 s, on unmount, and whenever search/filter changes.
   - Keep the consumed nonce in a ref so switching tabs and returning does not re-highlight.
3. `components/InventoryListItem.js`: add an optional `highlighted` prop that swaps the computed border for `theme.actionButton` and `borderWidth: 2` (`:120-121`, `styles.card` `:243-253`). It is a boolean, so the `memo` comparison stays cheap.
4. Add `focusHighlightId` to the `SectionList`'s `extraData` (`:691`), or the memoized rows will not re-render on highlight.

### Verified interaction, not pre-built

`TabTutorialOverlay` (`:608`) is itself a modal `Pressable` and can cover the target row during a first-run tour. Check it during QA; if it hides the row, defer only the highlight until the overlay is dismissed (`context/TabTutorialContext.js` exposes the active step) rather than suppressing the navigation.

### Optional follow-on (recommended, not required for routing)

Now that each notification is about one item and lands on it, the shared body "Open Pantrio to review items expiring within {{days}} days" (`notifications.reviewBody`) no longer identifies anything, and repeats for the same item read as duplicates. Scheduling already has the item in hand, so the body can name it: one new key pair (`notifications.reviewItemBody`, with an item-name placeholder) plus the zh mirror, used where `:107-112` builds the content today. Note the privacy trade in review: an item name becomes visible in the notification centre and on the lock screen.

## Phase 5 — cancel reminders on sign-out

Required for Phase 4 to be correct, and a one-line fix: plain `signOut` (`auth/useAuth.js:907-931`) leaves every pending Pantrio reminder on the device today, so the next account inherits notifications, and their taps, for food it never added. Add `void cancelPantrioReminders().catch(() => {})` after `await firebaseSignOut(auth)`. Nothing is lost: the next signed-in sync rebuilds the schedule from that account's items. The destructive paths already cancel through `purgeStoredUserData` (`api/userDataPurge.js:35`).

The age window in Phase 4 covers taps; this phase removes the notifications themselves.

## Tests

- `tests/reminderPolicy.test.js`: as in Phase 2, plus a Phase 3 case — an item already inside the window yields a trigger at the next 9:00 local rather than being dropped, and an expired item still yields nothing.
- New `tests/notificationRouting.test.js`:
  - default tap on our expiration payload → `{ kind: "expiration", itemId }`;
  - unknown/foreign payload → `null`;
  - stale response past `maxAgeMs` → `null`;
  - non-default `actionIdentifier` → `null`;
  - marker with missing/blank `itemId` → `{ kind: "fridge" }`;
  - `resolveFocusedItemId` returns the id only when the current items contain it, and `null` otherwise.

## Verification

- `npm run test:unit` (harness: `scripts/run-unit-tests.cjs`).
- `node scripts/check-i18n-keys.cjs` — must pass: it is the only thing policing en/zh key parity, and this change edits keys in both files.
- `npm run lint`.
- Manual, on a dev build, with a scratch trigger time (temporarily set the expiration trigger to now + 2 minutes; do not ship the scratch edit):
  - cold start from a tap → Fridge tab, target row highlighted;
  - background/foreground tap → same, without stacking a duplicate entry;
  - tap after the item was deleted → Fridge tab, no highlight, no crash;
  - tap for an item belonging to a previously signed-in account → Fridge tab, no highlight (Phase 5 plus `resolveFocusedItemId`);
  - target in a different storage tab (Freezer item while the tab was on Pantry) → filter resets, row visible;
  - empty window → `getAllScheduledNotificationsAsync()` returns nothing dated: with the daily reminder gone, "nothing expiring" must now mean "no notifications", which is the whole point of Phase 1;
  - short-lived item (expiry inside `remindDays`) → produces a notification (Phase 3);
  - tap while the first-run tour overlay is up (interaction noted above).

## Out of scope

Push or remote notifications, badge counts, notification actions (snooze, "used it"), an item detail screen, Android notification channels, a user-configurable reminder time, persisting a schedule database on top of the OS queue, and giving the dormant `notifications.turnOn` master flag a UI switch.

## Rollback

Every edit is local and reversible by reverting the touched files: two reminder modules, one settings section plus one settings default/merge, two locale files, one test file, one new util, one new hook, the tabs layout, the fridge screen, `InventoryListItem`, and one line in `signOut`. Notification schedules are rebuilt on the next sync, so no data migration is needed in either direction, and a stored `dailyReminders` key left behind by an older build is inert once the merge stops reading it.
