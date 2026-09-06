import assert from "node:assert/strict";
import test from "node:test";

import {
  bulkProposalActionKey,
  claimBulkProposalAction,
  createBulkProposalActionId,
  isBulkProposalActionConsumed,
  markBulkProposalActionConsumed,
  releaseBulkProposalAction,
} from "../utils/bulkProposal.js";

function makeAction(overrides = {}) {
  return {
    kind: "bulk_fridge_update",
    actionId: createBulkProposalActionId(),
    status: "pending",
    title: "Review changes",
    changes: [
      { id: "item-1", name: "milk", update: { quantity: "2" } },
      { id: "item-2", name: "eggs", remove: true },
    ],
    ...overrides,
  };
}

test("bulk proposal keys are stable and id-scoped", () => {
  const action = makeAction();
  assert.equal(bulkProposalActionKey(action), `id:${action.actionId}`);
  assert.equal(bulkProposalActionKey({ ...action }), `id:${action.actionId}`);

  const legacy = {
    kind: "bulk_fridge_update",
    title: "Review changes",
    changes: [{ id: "item-1", name: "milk", update: { quantity: "2" } }],
  };
  const legacyKey = bulkProposalActionKey(legacy);
  assert.ok(legacyKey.startsWith("legacy:"));
  assert.equal(
    bulkProposalActionKey({
      ...legacy,
      changes: [{ id: "item-1", name: "milk", update: { quantity: "2" } }],
    }),
    legacyKey
  );
});

test("a bulk proposal can be claimed once and released", () => {
  const claimed = new Set();
  const action = makeAction();

  assert.equal(claimBulkProposalAction(claimed, action), true);
  assert.equal(claimBulkProposalAction(claimed, action), false);

  releaseBulkProposalAction(claimed, action);
  assert.equal(claimBulkProposalAction(claimed, action), true);
});

test("consumed bulk proposals cannot be claimed", () => {
  const claimed = new Set();
  const action = makeAction({ status: "completed", consumed: true });
  assert.equal(claimBulkProposalAction(claimed, action), false);
  assert.equal(isBulkProposalActionConsumed(action), true);
});

test("markBulkProposalActionConsumed flags only the matching card", () => {
  const target = makeAction();
  const other = makeAction();
  const messages = [
    { id: "target", role: "assistant", type: "ui_action", action: target },
    { id: "other", role: "assistant", type: "ui_action", action: other },
    { id: "text", role: "assistant", content: [] },
  ];

  const next = markBulkProposalActionConsumed(messages, target);
  assert.equal(next[0].action.status, "completed");
  assert.equal(next[0].action.consumed, true);
  assert.equal(next[1].action.status, "pending");
  assert.equal(next[2].id, "text");
});
