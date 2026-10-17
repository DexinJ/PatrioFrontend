// Example items and one example conversation, shown only while a tab's
// first-run tour is running and the real collection is still empty.
//
// Why: four tutorial steps point at content (fridge items, the first item row,
// shopping list rows, the message area). On a fresh account there is nothing
// there, so the spotlight either covers an empty screen or - for the item-row
// step - has no anchor at all and the card floats over nothing.
//
// Contract, true for every consumer:
// - Render only. Nothing here is written into GlobalContext / ChatContext
//   state, persisted, mutated, or sent to the AI.
// - Shown only while that tab's tour session is active AND the real collection
//   is empty (shouldShowTabSamples).
// - Always labelled in the UI with TUTORIAL_ITEMS_NOTICE_KEY /
//   TUTORIAL_CHAT_NOTICE_KEY, so it cannot be mistaken for the user's own data.
// - Ids carry TUTORIAL_SAMPLE_ID_PREFIX, so a handler can tell a sample apart
//   from a real row without inspecting the payload.

export const TUTORIAL_SAMPLE_ID_PREFIX = "tutorial-sample-";
export const TUTORIAL_ITEMS_NOTICE_KEY = "tutorial.samples.itemsNotice";
export const TUTORIAL_CHAT_NOTICE_KEY = "tutorial.samples.chatNotice";

const DAY_MS = 24 * 60 * 60 * 1000;

export function isTutorialSampleId(id) {
  return String(id || "").startsWith(TUTORIAL_SAMPLE_ID_PREFIX);
}

// The gate every screen uses. `itemCount` is the real collection size, so a
// tab stops showing samples the moment the user adds one real row.
export function shouldShowTabSamples({ isActive, activeTabKey, tabKey, itemCount }) {
  if (isActive !== true) return false;
  if (String(activeTabKey || "") !== String(tabKey || "")) return false;
  // An unknown count means "not measured yet", not "empty": staying off is the
  // safe default, because the worst case is a tour step without a spotlight
  // rather than samples drawn over the user's real data.
  return Number.isFinite(itemCount) && itemCount === 0;
}

// Fridge samples: one expired (so the list sorts it into its own section and
// the "expired and expiring items are pinned to the top" step is true), one
// expiring tomorrow, and one fresh in a second storage location so the storage
// pills show real counts.
export const TUTORIAL_FRIDGE_SAMPLES = Object.freeze([
  Object.freeze({
    id: `${TUTORIAL_SAMPLE_ID_PREFIX}fridge-yogurt`,
    nameKey: "tutorial.samples.fridge.yogurt.name",
    quantity: "1",
    expiresInDays: -2,
    // Resolved through the live preset tags by the caller, so the labels and
    // tag ids always match whatever the account is using.
    tagLabels: Object.freeze({
      storage: "Fridge",
      urgency: "Expired",
      food_type: "Dairy",
      state: "Opened",
    }),
  }),
  Object.freeze({
    id: `${TUTORIAL_SAMPLE_ID_PREFIX}fridge-spinach`,
    nameKey: "tutorial.samples.fridge.spinach.name",
    quantity: "1",
    expiresInDays: 1,
    tagLabels: Object.freeze({
      storage: "Fridge",
      urgency: "Eat first",
      food_type: "Produce",
      state: "Opened",
    }),
  }),
  Object.freeze({
    id: `${TUTORIAL_SAMPLE_ID_PREFIX}fridge-peas`,
    nameKey: "tutorial.samples.fridge.peas.name",
    quantity: "1",
    expiresInDays: 180,
    tagLabels: Object.freeze({
      storage: "Freezer",
      urgency: "Long keeper",
      food_type: "Frozen",
      state: "Unopened",
    }),
  }),
]);

// Shopping list samples: three different aisles, so the category pills and the
// aisle grouping are both visible in the tour.
export const TUTORIAL_SHOPPING_SAMPLES = Object.freeze([
  Object.freeze({
    id: `${TUTORIAL_SAMPLE_ID_PREFIX}list-milk`,
    nameKey: "tutorial.samples.list.milk.name",
    quantity: "1",
    categoryLabel: "Dairy",
  }),
  Object.freeze({
    id: `${TUTORIAL_SAMPLE_ID_PREFIX}list-apples`,
    nameKey: "tutorial.samples.list.apples.name",
    quantity: "6",
    categoryLabel: "Produce",
  }),
  Object.freeze({
    id: `${TUTORIAL_SAMPLE_ID_PREFIX}list-bread`,
    nameKey: "tutorial.samples.list.bread.name",
    quantity: "1",
    categoryLabel: "Bakery",
  }),
]);

// Text-only on purpose: a sample must never render an action card ("add all to
// fridge" and friends) over data that does not exist.
export const TUTORIAL_SAMPLE_CHAT = Object.freeze([
  Object.freeze({
    id: `${TUTORIAL_SAMPLE_ID_PREFIX}chat-user`,
    role: "user",
    contentKey: "tutorial.samples.chat.user",
  }),
  Object.freeze({
    id: `${TUTORIAL_SAMPLE_ID_PREFIX}chat-assistant`,
    role: "assistant",
    contentKey: "tutorial.samples.chat.assistant",
  }),
]);

function resolveNow(now) {
  return now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
}

function resolveTagIds(labels, labelToTagId) {
  if (typeof labelToTagId !== "function") return [];
  return Object.values(labels).map((label) => labelToTagId(label)).filter(Boolean);
}

export function buildTutorialFridgeItems({ now, labelToTagId, t } = {}) {
  const base = resolveNow(now);
  const createdAt = base.toISOString();
  return TUTORIAL_FRIDGE_SAMPLES.map((sample) => ({
    id: sample.id,
    name: t(sample.nameKey),
    quantity: sample.quantity,
    createdAt,
    expiresAt: new Date(base.getTime() + sample.expiresInDays * DAY_MS).toISOString(),
    tagIds: resolveTagIds(sample.tagLabels, labelToTagId),
  }));
}

export function buildTutorialShoppingItems({ now, labelToTagId, t } = {}) {
  const base = resolveNow(now);
  const createdAt = base.toISOString();
  return TUTORIAL_SHOPPING_SAMPLES.map((sample) => ({
    id: sample.id,
    name: t(sample.nameKey),
    quantity: sample.quantity,
    createdAt,
    tagIds: resolveTagIds([sample.categoryLabel], labelToTagId),
  }));
}

export function buildTutorialSampleChat(t) {
  return TUTORIAL_SAMPLE_CHAT.map((message) => ({
    id: message.id,
    role: message.role,
    content: t(message.contentKey),
  }));
}
