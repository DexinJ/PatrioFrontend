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
  assert.equal(routeFor(tapOn({ data, actionIdentifier: "dismiss" })), null);
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
  assert.equal(
    resolveFocusedItemId({ kind: "fridge", itemId: null }, [{ id: "milk" }]),
    null
  );
  assert.equal(resolveFocusedItemId(null, [{ id: "milk" }]), null);
});
