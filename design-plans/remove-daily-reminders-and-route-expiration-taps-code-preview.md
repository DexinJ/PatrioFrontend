# Code preview — remove daily reminders, route expiration-notification taps

Status: **applied** to the working tree (uncommitted) on 2026-10-16, with the differences recorded below.

Companion plan: `design-plans/remove-daily-reminders-and-route-expiration-taps.md`. Written against the current working tree at `8615c7b`, including its uncommitted edits.

Files: 4 new (2 modules, 2 test files), 8 edited. Nothing deleted or renamed, and no shared component changes what it renders for existing callers.

## Decisions taken here that the plan left open

- **Phase 3 is in** — items already inside the notify window re-arm at the next 9:00 AM instead of being dropped. Without it, removing the daily reminder leaves short-dated food with no reminder at all.
- **The optional "name the item in the body" change is out** (kept at the end as a separate block). It is not needed for tap routing and it puts food names on the lock screen.
- **The highlight ring uses `theme.accent`, not `theme.actionButton` as the plan said.** `actionButton` is the green primary-action colour the + button and save buttons use; `accent` is the app's blue attention colour, which is what a "this one" ring should read as.
- **`utils/notificationRouting.js` owns `REMINDER_MARKER`,** which is where the plan put it: the routing rules must stay importable from a plain Node test, and `api/reminderScheduler.js` imports `expo-notifications`, so the marker cannot live there any more.
- **The fridge focus effect is split in two, and a wrapper component hosts the routing hook.** Both are explained at the point they matter; each exists because of a failure mode described in the comment.

## Applied differences and verification

- **The focus request is accepted as a render-phase adjustment, not from an effect.** As drafted, the effect that clears the search box, the storage tab, and edit mode tripped `react-hooks/set-state-in-effect`. The applied form adjusts state during render (React's documented pattern for reacting to a changed prop), keeps the one-shot scroll in an effect that only calls `setState` from inside a timer, and gives the highlight its own effect so its 2.6 s timer cannot be cancelled by a section rebuild. This is the same rule, and the same resolution, as the earlier fridge add-menu change.
- **Verification:** `scripts/run-unit-tests.cjs` - 305 tests, 304 pass, 1 fail. The failure is `tests/aiProviderSlotComparison.test.js`, which imports `refactor/aiProviderSlotModel.js`; that path does not exist anywhere in the tree, and nothing in this change touches the AI provider slot model. It fails the same way before these edits.
- **`scripts/check-i18n-keys.cjs`** reports one missing key, `chat.suggestions.meals.${mealForDate(now)}` - a template literal the checker reads as a literal, at `app/(tabs)/chat.js:139`. Pre-existing and unrelated. The en/zh key sets were compared separately and match exactly at 1054 keys each.
- **eslint** is clean on every file this change touches.
- **`npm run test:unit` and `npm run lint` could not be used** in this environment: the npm CLI shim is missing (`Cannot find module '...npm\\bin\\npm-cli.js'`), so the underlying commands were run directly with `node`.
- **Docs updated in the same pass:** `docs/CODE_FILE_INVENTORY.md` (scheduler, policy, both test entries, and a new `utils/notificationRouting.js` entry), `docs/CODEBASE_REPORT.md` (section 8), `README.md` (feature list and the settings list). Both docs directories are git-ignored.

---

## 1. New — `utils/notificationRouting.js`

```js
// Payload contract and routing rules for Pantrio's local reminders.
//
// Deliberately free of native imports: `api/reminderScheduler.js` imports the
// marker from here, and the rules below are unit tested from plain Node, where
// `expo-notifications` cannot be loaded.

export const REMINDER_MARKER = "pantrio-local-reminder-v1";

// A tap is only meaningful while the notification is still fresh.
// `useLastNotificationResponse` keeps returning the last response for the life
// of the process, so without this a tap that happened before a sign-in could be
// replayed minutes later, against a different account.
export const NOTIFICATION_ROUTE_MAX_AGE_MS = 5 * 60 * 1000;

const EXPIRATION_KIND = "expiration";

/**
 * Turns a notification response into a routing intent, or null when the
 * response is not a fresh tap on one of our reminders.
 *
 * Returns `{ kind: "expiration", itemId }` for an item reminder, and
 * `{ kind: "fridge", itemId: null }` when the reminder is ours but there is no
 * item to focus (a daily summary left in the queue by an older build).
 */
export function buildReminderRoute({
  response,
  defaultActionIdentifier,
  now = Date.now(),
  maxAgeMs = NOTIFICATION_ROUTE_MAX_AGE_MS,
}) {
  if (!response) return null;

  // Dismissals, and any custom action added later, are not taps.
  if (
    defaultActionIdentifier &&
    response.actionIdentifier !== defaultActionIdentifier
  ) {
    return null;
  }

  const notification = response.notification;
  const data = notification?.request?.content?.data;
  if (!data || data.pantrioReminder !== REMINDER_MARKER) return null;

  // `date` is the delivery time, in seconds since the epoch.
  const deliveredAtMs = Number(notification?.date) * 1000;
  if (!Number.isFinite(deliveredAtMs)) return null;
  if (now - deliveredAtMs > maxAgeMs) return null;

  const itemId = typeof data.itemId === "string" ? data.itemId.trim() : "";
  if (data.kind !== EXPIRATION_KIND || !itemId) {
    return { kind: "fridge", itemId: null };
  }

  return { kind: EXPIRATION_KIND, itemId };
}

/**
 * The OS notification queue is per device, not per account: a reminder
 * scheduled while one account was signed in can be tapped after another account
 * has signed in. Only an item the current account actually has may be focused.
 */
export function resolveFocusedItemId(route, items) {
  if (!route || route.kind !== EXPIRATION_KIND || !route.itemId) return null;
  const owned = (Array.isArray(items) ? items : []).some(
    (item) => String(item?.id || "") === route.itemId
  );
  return owned ? route.itemId : null;
}
```

---

## 2. New — `hooks/useNotificationRouting.js`

```js
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { useContext, useEffect, useRef } from "react";
import { GlobalContext } from "../context/GlobalContext";
import {
  buildReminderRoute,
  resolveFocusedItemId,
} from "../utils/notificationRouting";

/**
 * Sends a tapped Pantrio reminder to the fridge item it is about.
 *
 * Mounted as a child of the signed-in tab tree, after storage hydration, so a
 * response that arrives before the app has an account and items routes nowhere.
 * `useLastNotificationResponse` keeps returning the last response for the life
 * of the process, so each one is consumed once and then cleared.
 */
export default function useNotificationRouting() {
  const { fridgeItems } = useContext(GlobalContext);
  const response = Notifications.useLastNotificationResponse();
  const handledRef = useRef(null);

  useEffect(() => {
    if (!response) return;

    const route = buildReminderRoute({
      response,
      defaultActionIdentifier: Notifications.DEFAULT_ACTION_IDENTIFIER,
    });
    if (!route) return;

    const handledKey = `${response?.notification?.request?.identifier || ""}:${
      response?.actionIdentifier || ""
    }:${response?.notification?.date ?? 0}`;
    if (handledRef.current === handledKey) return;
    handledRef.current = handledKey;

    try {
      Notifications.clearLastNotificationResponse();
    } catch (error) {
      console.warn("Could not clear the last notification response:", error);
    }

    const focusItemId = resolveFocusedItemId(route, fridgeItems);
    router.navigate({
      pathname: "/fridge",
      params: focusItemId
        ? { focusItemId, focusNonce: String(Date.now()) }
        : {},
    });
  }, [fridgeItems, response]);
}
```

---

## 3. Edited — `api/reminderScheduler.js` (full file after the change)

```js
import * as Notifications from "expo-notifications";
import i18next from "i18next";
import { REMINDER_MARKER } from "../utils/notificationRouting";
import { buildExpirationReminderSchedule } from "../utils/reminderPolicy";
import { createLatestTaskQueue } from "../utils/latestTaskQueue";

const reminderTaskQueue = createLatestTaskQueue();

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

async function cancelPantrioRemindersRaw() {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const cancellationResults = await Promise.allSettled(
    scheduled
      .filter(
        (request) => request?.content?.data?.pantrioReminder === REMINDER_MARKER
      )
      .map((request) =>
        Notifications.cancelScheduledNotificationAsync(request.identifier)
      )
  );
  const failedCount = cancellationResults.filter(
    (result) => result.status === "rejected"
  ).length;
  if (failedCount > 0) {
    const error = new Error(
      i18next.t("notifications.couldNotCancel", {
        count: failedCount,
      })
    );
    error.code = "REMINDER_CANCELLATION_FAILED";
    throw error;
  }
}

export function cancelPantrioReminders() {
  return reminderTaskQueue.invalidateAndRun(cancelPantrioRemindersRaw);
}

async function ensurePermission() {
  return Notifications.getPermissionsAsync();
}

export async function requestReminderPermissions() {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

async function performReminderSync({ settings, fridgeItems }) {
  await cancelPantrioRemindersRaw();

  const expirationEnabled = Boolean(settings?.expiration?.expirationAlerts);
  const notificationsEnabled = settings?.notifications?.turnOn !== false;
  if (!notificationsEnabled || !expirationEnabled) {
    return { scheduled: 0, permission: "not-requested" };
  }

  const currentPermission = await ensurePermission();
  if (!currentPermission.granted) {
    return {
      scheduled: 0,
      permission: currentPermission.canAskAgain ? "undetermined" : "denied",
    };
  }

  const remindDays = settings?.expiration?.remindDays ?? 5;
  const requests = buildExpirationReminderSchedule(fridgeItems, remindDays).map(
    (reminder) => ({
      content: {
        title: i18next.t("notifications.nearingExpirationTitle"),
        body: i18next.t("notifications.reviewBody", {
          days: Math.round(Number(remindDays) || 5),
        }),
        data: {
          pantrioReminder: REMINDER_MARKER,
          kind: "expiration",
          itemId: reminder.itemId,
        },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: reminder.trigger,
      },
    })
  );

  const scheduleResults = await Promise.allSettled(
    requests.map((request) => Notifications.scheduleNotificationAsync(request))
  );
  const identifiers = scheduleResults
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value);
  const failed = scheduleResults.find((result) => result.status === "rejected");
  if (failed) {
    await Promise.allSettled(
      identifiers.map((identifier) =>
        Notifications.cancelScheduledNotificationAsync(identifier)
      )
    );
    throw failed.reason instanceof Error
      ? failed.reason
      : new Error(i18next.t("notifications.scheduleFailed"));
  }
  return { scheduled: identifiers.length, permission: "granted" };
}

export function syncLocalReminders(request) {
  return reminderTaskQueue.runLatest(
    () => performReminderSync(request),
    { supersededValue: { scheduled: 0, permission: "superseded" } }
  );
}
```

What changed: the `countItemsExpiringWithin` import and the whole daily branch are gone, the gate is narrowed to the expiration toggle, and the request list is now built with a `map` instead of a `push` loop.

---

## 4. Edited — `utils/reminderPolicy.js` (full file after the change)

```js
const MAX_EXPIRATION_REMINDERS = 40;

export function canSynchronizeReminders({
  storageHydrated,
  storageOwnerUid,
  fridgeWriteEnabled,
  settingsWriteEnabled,
}) {
  return Boolean(
    storageHydrated &&
      storageOwnerUid &&
      fridgeWriteEnabled &&
      settingsWriteEnabled
  );
}

export function buildReminderSyncSignature(settings, fridgeItems) {
  const notificationsEnabled = settings?.notifications?.turnOn !== false;
  const expirationEnabled = Boolean(settings?.expiration?.expirationAlerts);
  const remindDays = clampInteger(settings?.expiration?.remindDays, 1, 31, 5);
  const settingsSignature = [
    notificationsEnabled ? 1 : 0,
    expirationEnabled ? 1 : 0,
    remindDays,
  ].join(":");

  if (!notificationsEnabled || !expirationEnabled) {
    return settingsSignature;
  }

  const itemSignature = (Array.isArray(fridgeItems) ? fridgeItems : [])
    .map((item) => `${String(item?.id || "")}:${String(item?.expiresAt || "")}`)
    .sort()
    .join("|");
  return `${settingsSignature}:${itemSignature}`;
}

function clampInteger(value, minimum, maximum, fallback) {
  const number = Math.round(Number(value));
  return Number.isFinite(number)
    ? Math.min(maximum, Math.max(minimum, number))
    : fallback;
}

// 9:00 local on the day `daysBefore` ahead of the expiry date, or the next 9:00
// when that moment has already passed.
//
// The second case is what the retired daily summary reminder used to cover: an
// item added inside its own notify window — short-dated food, most often — had
// a trigger in the past on the day it was added, so it never got a reminder at
// all. Re-arming at the next 9:00 keeps one pending notification per item, and
// the item leaves the schedule once it is deleted or expires.
function nextReminderTrigger(expiration, daysBefore, currentTime) {
  const leadTime = new Date(
    expiration.getFullYear(),
    expiration.getMonth(),
    expiration.getDate() - daysBefore,
    9,
    0,
    0,
    0
  );
  if (leadTime.getTime() > currentTime) return leadTime;

  const next = new Date(currentTime);
  next.setHours(9, 0, 0, 0);
  if (next.getTime() <= currentTime) {
    next.setDate(next.getDate() + 1);
  }

  // A warning that lands after the food has expired is noise, not a warning.
  return next.getTime() < expiration.getTime() ? next : null;
}

export function buildExpirationReminderSchedule(
  fridgeItems,
  remindDays,
  now = new Date()
) {
  const currentTime = now instanceof Date ? now.getTime() : Number(now);
  const daysBefore = clampInteger(remindDays, 1, 31, 5);
  const scheduled = [];

  for (const item of Array.isArray(fridgeItems) ? fridgeItems : []) {
    const expiration = new Date(item?.expiresAt);
    if (Number.isNaN(expiration.getTime())) continue;
    if (expiration.getTime() < currentTime) continue;

    const trigger = nextReminderTrigger(expiration, daysBefore, currentTime);
    if (!trigger) continue;

    scheduled.push({
      itemId: String(item?.id || ""),
      trigger,
      expiresAt: expiration,
    });
  }

  return scheduled
    .sort(
      (left, right) =>
        left.trigger.getTime() - right.trigger.getTime() ||
        left.expiresAt.getTime() - right.expiresAt.getTime()
    )
    .slice(0, MAX_EXPIRATION_REMINDERS);
}
```

Two behaviour changes beyond deleting `countItemsExpiringWithin` and the `dailyEnabled` term: in-window items now get the next 9:00 slot instead of being skipped, and equal trigger times (which the new case creates, since every in-window item shares tomorrow's 9:00) are broken by soonest expiry, so the 40-reminder cap keeps the most urgent items rather than whichever came first in the array.

---

## 5. Edited — `context/GlobalContext.js`

Above `function mergeStoredSettings(previousSettings, parsedSettings) {`:

```js
// `notifications.dailyReminders` was retired along with the daily summary
// reminder. Dropping the key on read keeps older installs from carrying a
// toggle that no screen renders and no scheduler reads.
function withoutRetiredNotificationKeys(notifications) {
  return Object.fromEntries(
    Object.entries(notifications).filter(([key]) => key !== "dailyReminders")
  );
}
```

In the `mergeStoredSettings` return value (`:274-281`):

```js
    notifications: {
      ...previousSettings.notifications,
-      ...storedNotifications,
+      ...withoutRetiredNotificationKeys(storedNotifications),
      reminderPermissionRequested,
-      dailyReminders: reminderPermissionRequested
-        ? storedNotifications.dailyReminders === true
-        : false,
    },
```

In the defaults (`:337-341`):

```js
      notifications: {
        turnOn: true,
-        dailyReminders: false,
        reminderPermissionRequested: false,
      },
```

The `reminderPermissionRequested` gate around `expirationAlerts` (`:293-296`) is untouched on purpose: it is what keeps an existing user's expiration-alert preference from being reset on upgrade.

---

## 6. Edited — `app/(tabs)/settings.js`

Delete the Daily Reminders row (`:3118-3139`, the row plus its trailing blank line) so the section opens directly on the expiration group:

```jsx
            <CollapsibleSection
              title={t("settings.notifications")}
              expanded={isSectionExpanded("notifications")}
              onToggle={() => toggleSection("notifications")}
              styles={stylesWithFont}
              theme={theme}
              fontSize={fontSize}
            >
-              <View style={stylesWithFont.settingRow}>
-                <Text style={stylesWithFont.label}>
-                  {t("settings.dailyReminders")}
-                </Text>
-
-                <Switch
-                  accessibilityLabel={t("settings.dailyRemindersA11y")}
-                  value={!!settings?.notifications?.dailyReminders}
-                  onValueChange={(val) =>
-                    void updateReminderToggle(
-                      "notifications",
-                      "dailyReminders",
-                      val
-                    )
-                  }
-                  trackColor={{
-                    true: theme.actionButton,
-                    false: theme.border,
-                  }}
-                />
-              </View>
-
              <Text style={stylesWithFont.menuSectionLabel}>
                {t("settings.expirationReminders")}
              </Text>
```

`updateReminderToggle` (`:1098-1136`) stays as it is; the expiration switch still calls it.

---

## 7. Edited — `app/(tabs)/_layout.js`

Import, in the slot between the context imports and the utils import:

```js
import { TabTutorialProvider } from "../../context/TabTutorialContext";
+import useNotificationRouting from "../../hooks/useNotificationRouting";
import { getTabKeyForPathname } from "../../utils/tabTutorials";
```

A wrapper component, next to `ChatTabHeader` and the other small components above `ThemedTabs`:

```jsx
// Routes a tapped reminder after the tab tree exists and has hydrated.
//
// A child component rather than a hook call inside `ThemedTabs`, because
// `ThemedTabs` returns early until storage hydration finishes: a hook called at
// its top would consume the response before `fridgeItems` existed and route to
// the fridge with nothing focused.
function NotificationRouter() {
  useNotificationRouting();
  return null;
}
```

Render it inside `ThemedTabs`, beside the other overlays (`:608-609`):

```jsx
        <TabTutorialOverlay />
        <EmailVerificationPrompt />
+        <NotificationRouter />
      </View>
```

---

## 8. Edited — `app/(tabs)/fridge.js`

Import (`:1`):

```js
-import { router, useNavigation } from "expo-router";
+import { router, useLocalSearchParams, useNavigation } from "expo-router";
```

State and refs, with the other UI state (`:66-90`):

```js
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editItem, setEditItem] = useState(null);
+
+  // Reminder-tap focus: the item to reveal, and the section list that shows it.
+  const { focusItemId, focusNonce } = useLocalSearchParams();
+  const [focusHighlightId, setFocusHighlightId] = useState(null);
+  const listRef = useRef(null);
+  const handledFocusRef = useRef(null);
+  const scrollPendingRef = useRef(null);
```

Two effects, immediately after `fridgeSections` (`:308`):

```js
+  // A tapped expiration reminder arrives as route params. The row can be hidden
+  // by the search box or the storage tabs, and edit mode would turn it into a
+  // checkbox, so the screen is normalised before it is highlighted.
+  useEffect(() => {
+    const targetId = typeof focusItemId === "string" ? focusItemId : "";
+    if (!targetId) return;
+
+    // The nonce is what makes a second tap on the same item a new request.
+    const focusKey = `${targetId}:${focusNonce || ""}`;
+    if (handledFocusRef.current === focusKey) return;
+
+    // Left unhandled while the item is missing, so a late storage hydrate can
+    // still pick it up. An item that was deleted simply never matches.
+    if (!decoratedItems.some((it) => it.id === targetId)) return;
+    handledFocusRef.current = focusKey;
+
+    scrollPendingRef.current = targetId;
+    setEditMode(false);
+    setSelectedIds(new Set());
+    setSearch("");
+    setActiveTab("All");
+    setFocusHighlightId(targetId);
+  }, [decoratedItems, focusItemId, focusNonce]);
+
+  // Scrolled from its own effect, after the filters above have rebuilt the
+  // sections: clearing them is what changes this dependency. Best-effort by
+  // design — SectionList throws for a section it has not measured yet, and the
+  // row is on screen either way once the filters are gone.
+  useEffect(() => {
+    const targetId = scrollPendingRef.current;
+    if (!targetId) return;
+
+    const sectionIndex = fridgeSections.findIndex((section) =>
+      section.data.some((it) => it.id === targetId)
+    );
+    if (sectionIndex < 0) return;
+    const itemIndex = fridgeSections[sectionIndex].data.findIndex(
+      (it) => it.id === targetId
+    );
+    scrollPendingRef.current = null;
+
+    const scrollTimeoutId = setTimeout(() => {
+      try {
+        listRef.current?.scrollToLocation({
+          sectionIndex,
+          itemIndex,
+          viewPosition: 0.5,
+          animated: true,
+        });
+      } catch {
+        // Not measured yet; the highlight still marks the row.
+      }
+    }, 60);
+
+    const highlightTimeoutId = setTimeout(
+      () => setFocusHighlightId(null),
+      2600
+    );
+
+    return () => {
+      clearTimeout(scrollTimeoutId);
+      clearTimeout(highlightTimeoutId);
+    };
+  }, [fridgeSections]);
```

Row renderer (`:584-610`) — one prop, one dependency:

```jsx
      <InventoryListItem
        item={item}
        theme={theme}
        fontSize={fontSize}
        editMode={editMode}
+        highlighted={item.id === focusHighlightId}
        selected={selectedIds.has(item.id)}
        onToggleSelect={toggleSelect}
        onMeasuredLongPress={handleMeasuredLongPress}
```

```js
    [
      theme,
      fontSize,
      editMode,
+      focusHighlightId,
      selectedIds,
      toggleSelect,
      handleMeasuredLongPress,
      fridgeSections,
    ]
```

`SectionList` (`:661-692`) — a ref, and the highlight in `extraData` (which is what makes the memoized rows re-render at all):

```jsx
          <SectionList
+            ref={listRef}
            sections={fridgeSections}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            stickySectionHeadersEnabled
```

```jsx
-            extraData={{ editMode, selectedCount }}
+            extraData={{ editMode, selectedCount, focusHighlightId }}
```

Two notes for the reviewer. The request is never cleared from the route params: `handledFocusRef` already stops a remount from re-highlighting, and clearing params would need `router.setParams`, which risks a loop for no gain. And during the first-run tour the fridge renders sample rows, so a tap that lands mid-tour is not handled until the tour ends and the real items are back — the request is not consumed, so it still applies when they are.

---

## 9. Edited — `components/InventoryListItem.js`

Prop:

```js
  editMode = false,
  selected = false,
+  highlighted = false,
  onToggleSelect,
```

Border, above `statusColor` (`:120-121`):

```js
  const bg = isExpired ? theme?.dangerBackground : isAlmost ? theme?.warningBackground : theme?.card;
-  const border = isExpired ? theme?.danger : isAlmost ? theme?.warning : theme?.border;
+  const border = highlighted
+    ? theme?.accent
+    : isExpired
+      ? theme?.danger
+      : isAlmost
+        ? theme?.warning
+        : theme?.border;
```

Card style:

```jsx
          style={[
            styles.card,
            { backgroundColor: bg, borderColor: border },
+            highlighted ? styles.highlighted : null,
          ]}
```

Style, beside `card` in the stylesheet (`:243-253`):

```js
  card: {
    borderWidth: 1,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "stretch",
  },
+  highlighted: {
+    borderWidth: 2,
+  },
```

No other caller passes `highlighted`, so every existing use renders exactly as it does today. The 1px width difference on the highlighted row is deliberate: a colour-only change reads as a normal border, and the row is only in this state for 2.6 seconds.

---

## 10. Edited — `auth/useAuth.js`

Import, after `../api/authProvisioningStorage` (`:33`):

```js
} from "../api/authProvisioningStorage";
+import { cancelPantrioReminders } from "../api/reminderScheduler";
import {
  clearUserDataPurgePending,
```

In `signOut` (`:929-932`):

```js
    await firebaseSignOut(auth);
    lastProviderIdsRef.current = [];
+    // Pending reminders belong to the account that scheduled them, and the OS
+    // notification queue outlives the session. Without this, the next account on
+    // this device inherits another user's food reminders and their taps. The
+    // next signed-in sync rebuilds this account's own schedule.
+    await cancelPantrioReminders().catch(() => {});
    return { providerCleanupError };
  }, []);
```

---

## 11. Edited — `locales/en.json` and `locales/zh.json`

Same two regions in both files, with the zh values dropped to match:

```json
-    "dailyReminders": "Daily Reminders",
-    "dailyRemindersA11y": "Daily reminders",
     "expirationReminders": "Expiration reminders",
```

```json
   "notifications": {
-    "dailyCheckTitle": "Pantrio fridge check",
-    "expiringSoon_one": "{{count}} item nearing expiration.",
-    "expiringSoon_other": "{{count}} items nearing expiration.",
     "nearingExpirationTitle": "An item is nearing expiration",
     "reviewBody": "Open Pantrio to review items expiring within {{days}} days.",
-    "reviewFridgeBody": "Take a moment to review your fridge and shopping list.",
     "couldNotCancel_one": "Could not cancel {{count}} scheduled Pantrio reminder.",
```

Band 937-938 and band 1151-1153 + 1156, in both files. `notifications.couldNotCancel_*` and `notifications.scheduleFailed` stay; `home.expiringSoon*` (`:313-314`) and `fridge.expiringSoon` (`:336`) are a different namespace and a live feature.

---

## 12. New — `tests/notificationRouting.test.js`

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  NOTIFICATION_ROUTE_MAX_AGE_MS,
  REMINDER_MARKER,
  buildReminderRoute,
  resolveFocusedItemId,
} from "../utils/notificationRouting.js";

const DEFAULT_ACTION = "expo.modules.notifications.actions.DEFAULT";
const NOW = new Date(2026, 7, 10, 12);

function tapOn({ data, date = NOW, actionIdentifier = DEFAULT_ACTION }) {
  return {
    actionIdentifier,
    notification: {
      date: Math.floor(date.getTime() / 1000),
      request: { identifier: "reminder-1", content: { data } },
    },
  };
}

function routeFor(response) {
  return buildReminderRoute({
    response,
    defaultActionIdentifier: DEFAULT_ACTION,
    now: NOW.getTime(),
  });
}

test("a tap on an expiration reminder routes to its item", () => {
  assert.deepEqual(
    routeFor(
      tapOn({
        data: {
          pantrioReminder: REMINDER_MARKER,
          kind: "expiration",
          itemId: "milk",
        },
      })
    ),
    { kind: "expiration", itemId: "milk" }
  );
});

test("foreign notifications do not route", () => {
  assert.equal(routeFor(null), null);
  assert.equal(routeFor(tapOn({ data: { someOtherReminder: true } })), null);
  assert.equal(routeFor(tapOn({ data: undefined })), null);
});

test("stale taps and non-tap actions do not route", () => {
  const data = {
    pantrioReminder: REMINDER_MARKER,
    kind: "expiration",
    itemId: "milk",
  };

  assert.equal(
    routeFor(
      tapOn({
        data,
        date: new Date(NOW.getTime() - NOTIFICATION_ROUTE_MAX_AGE_MS - 1000),
      })
    ),
    null
  );
  assert.equal(
    routeFor(tapOn({ data, actionIdentifier: "dismiss" })),
    null
  );
});

test("a reminder with no usable item id still lands on the fridge", () => {
  assert.deepEqual(
    routeFor(
      tapOn({ data: { pantrioReminder: REMINDER_MARKER, kind: "daily" } })
    ),
    { kind: "fridge", itemId: null }
  );
  assert.deepEqual(
    routeFor(
      tapOn({
        data: {
          pantrioReminder: REMINDER_MARKER,
          kind: "expiration",
          itemId: "   ",
        },
      })
    ),
    { kind: "fridge", itemId: null }
  );
});

test("only items the current account owns are focused", () => {
  const route = { kind: "expiration", itemId: "milk" };

  assert.equal(resolveFocusedItemId(route, [{ id: "milk" }]), "milk");
  assert.equal(resolveFocusedItemId(route, [{ id: "eggs" }]), null);
  assert.equal(resolveFocusedItemId(route, []), null);
  assert.equal(resolveFocusedItemId({ kind: "fridge", itemId: null }, [{ id: "milk" }]), null);
  assert.equal(resolveFocusedItemId(null, [{ id: "milk" }]), null);
});
```

---

## 13. Rewritten — `tests/reminderPolicy.test.js`

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  buildExpirationReminderSchedule,
  buildReminderSyncSignature,
  canSynchronizeReminders,
} from "../utils/reminderPolicy.js";

test("reminders stay untouched when relevant storage hydration failed", () => {
  assert.equal(
    canSynchronizeReminders({
      storageHydrated: true,
      storageOwnerUid: "user-1",
      fridgeWriteEnabled: false,
      settingsWriteEnabled: true,
    }),
    false
  );
  assert.equal(
    canSynchronizeReminders({
      storageHydrated: true,
      storageOwnerUid: "user-1",
      fridgeWriteEnabled: true,
      settingsWriteEnabled: true,
    }),
    true
  );
});

test("reminder sync signature ignores unrelated settings and retired toggles", () => {
  const baseSettings = {
    notifications: { turnOn: true },
    expiration: { expirationAlerts: true, remindDays: 5 },
  };
  const first = buildReminderSyncSignature(baseSettings, [
    { id: "milk", name: "Milk", quantity: "1", expiresAt: "2026-08-20" },
  ]);
  const second = buildReminderSyncSignature(
    { ...baseSettings, ux: { darkMode: true, fontSize: 24 } },
    [{ id: "milk", name: "Whole milk", quantity: "2", expiresAt: "2026-08-20" }]
  );
  assert.equal(second, first);

  // The retired daily toggle must not be able to re-arm a schedule that no
  // screen can turn off any more.
  assert.equal(
    buildReminderSyncSignature(
      { ...baseSettings, notifications: { turnOn: true, dailyReminders: true } },
      [{ id: "milk", expiresAt: "2026-08-20" }]
    ),
    first
  );

  assert.notEqual(
    buildReminderSyncSignature(baseSettings, [
      { id: "milk", expiresAt: "2026-08-21" },
    ]),
    first
  );
});

test("expiration reminders are scheduled at 9 AM the configured days before", () => {
  const expiration = new Date(2026, 7, 20, 23, 59, 59, 999);
  const schedule = buildExpirationReminderSchedule(
    [{ id: "milk", expiresAt: expiration.toISOString() }],
    5,
    new Date(2026, 7, 10, 12)
  );
  assert.equal(schedule.length, 1);
  assert.equal(schedule[0].trigger.getDate(), 15);
  assert.equal(schedule[0].trigger.getHours(), 9);
});

test("an item already inside the window keeps the next 9 AM slot", () => {
  const schedule = buildExpirationReminderSchedule(
    [{ id: "leftovers", expiresAt: new Date(2026, 7, 12, 12).toISOString() }],
    5,
    new Date(2026, 7, 10, 12)
  );
  assert.equal(schedule.length, 1);
  assert.equal(schedule[0].trigger.getDate(), 11);
  assert.equal(schedule[0].trigger.getHours(), 9);
  assert.equal(schedule[0].trigger.getMinutes(), 0);
});

test("no reminder is scheduled after the food itself expires", () => {
  const now = new Date(2026, 7, 10, 12);
  assert.equal(
    buildExpirationReminderSchedule(
      [{ id: "fish", expiresAt: new Date(2026, 7, 10, 18).toISOString() }],
      5,
      now
    ).length,
    0
  );
});

test("already-expired items are skipped", () => {
  const now = new Date(2026, 7, 10, 12);
  assert.equal(
    buildExpirationReminderSchedule(
      [{ id: "old", expiresAt: new Date(2026, 7, 9, 12).toISOString() }],
      5,
      now
    ).length,
    0
  );
});

test("the 40 reminder cap keeps the soonest expiries", () => {
  const now = new Date(2026, 7, 10, 12);
  const items = [];
  for (let index = 0; index < 45; index += 1) {
    items.push({
      id: `item-${index}`,
      expiresAt: new Date(2026, 8, 1 + index, 12).toISOString(),
    });
  }
  const schedule = buildExpirationReminderSchedule(items, 5, now);
  assert.equal(schedule.length, 40);
  assert.equal(schedule[0].itemId, "item-0");
  assert.equal(schedule[39].itemId, "item-39");
});
```

Both test files were run in a scratch directory against this exact code before being written here: 12 tests, 12 passing. The two modules are plain ES modules with no native imports, which is what makes that possible.

---

## 14. Docs to refresh after the code lands (no code in them)

- `docs/CODE_FILE_INVENTORY.md`: the `api/reminderScheduler.js` entry (`:406-413`), the `utils/reminderPolicy.js` entry (`:1002-1010`), the settings-screen summary (`:187`), and a new entry for `utils/notificationRouting.js` + `hooks/useNotificationRouting.js`.
- `docs/CODEBASE_REPORT.md:223-225`: drop the "plus an optional daily 09:00 summary" clause.
- `README.md:17` and the settings feature list at `:331-332`.
- `design-plans/settings-option-titles-bold.md:29` cites the daily row's old line number. Historical, leave it.

---

## Not included — naming the item in the notification body

Optional, and it needs a decision rather than just code: each alert is now about one item and lands on it, but the shared body still says "Open Pantrio to review items expiring within {{days}} days", so a repeat for the same item reads as a duplicate. If you want it, the change is three pieces:

```js
// utils/reminderPolicy.js, in buildExpirationReminderSchedule's push:
    scheduled.push({
      itemId: String(item?.id || ""),
+      itemName: String(item?.name || "").trim(),
      trigger,
      expiresAt: expiration,
    });
```

```js
// api/reminderScheduler.js, in the content body:
-        body: i18next.t("notifications.reviewBody", {
+        body: i18next.t("notifications.reviewItemBody", {
+          name: reminder.itemName,
          days: Math.round(Number(remindDays) || 5),
        }),
```

```json
// locales/en.json + locales/zh.json, new pair
-    "reviewItemBody": "{{name}} is nearing expiration. Open Pantrio to review it.",
```

Carrying a caveat worth knowing before choosing it: the sync signature is built from `id:expiresAt` only, so renaming an item would not re-render the banner text until the next expiry or settings change. Including the name in the signature fixes that at the cost of rescheduling on every rename. And item names would then be readable on the lock screen.

---

## Applied as

Four new files (`utils/notificationRouting.js`, `hooks/useNotificationRouting.js`, `tests/notificationRouting.test.js`, and the rewritten `tests/reminderPolicy.test.js`) plus the eight edits above, in the order listed, except that the fridge focus logic landed in the render-phase form described under "Applied differences". The code blocks in this document are the code as written unless a line is marked otherwise.

Nothing here waits on a device pass for correctness, but two things can only be confirmed on hardware: that a real tap on a real reminder lands on the right row, and that the lock-screen banner text still reads well in both locales. Both are listed in the plan's verification section.
