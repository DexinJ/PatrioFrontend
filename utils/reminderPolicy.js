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
// item added inside its own notify window - short-dated food, most often - had
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
