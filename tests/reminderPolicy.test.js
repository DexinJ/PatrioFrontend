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
