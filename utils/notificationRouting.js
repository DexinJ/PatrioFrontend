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
