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
