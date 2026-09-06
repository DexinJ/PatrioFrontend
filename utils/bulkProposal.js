// Bulk fridge update proposal helpers.
// Mirrors the add_all_to_fridge proposal lifecycle (utils/fridgeProposal.js)
// for the "bulk_fridge_update" UI action kind, so a bulk edit card can only
// be applied once and is marked consumed after the user confirms.

function clean(value, maxLength = 200) {
  return String(value ?? "").trim().slice(0, maxLength);
}

export function createBulkProposalActionId() {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  if (randomUuid) return `bulk-proposal-${randomUuid}`;
  return `bulk-proposal-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 12)}`;
}

function legacyActionFingerprint(action) {
  const changes = (Array.isArray(action?.changes) ? action.changes : []).map(
    (entry) => ({
      id: clean(entry?.id, 120),
      name: clean(entry?.name, 120),
      update: entry?.update && typeof entry.update === "object"
        ? Object.fromEntries(
            Object.entries(entry.update)
              .map(([key, value]) => [
                key,
                Array.isArray(value)
                  ? value.map((v) => clean(v, 80))
                  : clean(value, 160),
              ])
              .filter(([, value]) => value !== "")
          )
        : null,
      remove: entry?.remove === true,
    })
  );
  return JSON.stringify({
    kind: "bulk_fridge_update",
    title: clean(action?.title, 160),
    changes,
  });
}

export function bulkProposalActionKey(action) {
  const actionId = clean(action?.actionId, 200);
  if (actionId) return `id:${actionId}`;
  const carriedKey = String(action?.actionKey ?? "").trim();
  if (carriedKey) return carriedKey;
  return `legacy:${legacyActionFingerprint(action)}`;
}

export function isBulkProposalActionConsumed(action) {
  return (
    action?.status === "completed" ||
    action?.status === "applied" ||
    action?.consumed === true
  );
}

export function claimBulkProposalAction(claimedKeys, action) {
  if (!(claimedKeys instanceof Set) || isBulkProposalActionConsumed(action)) {
    return false;
  }
  const key = bulkProposalActionKey(action);
  if (claimedKeys.has(key)) return false;
  claimedKeys.add(key);
  return true;
}

export function releaseBulkProposalAction(claimedKeys, action) {
  if (claimedKeys instanceof Set) {
    claimedKeys.delete(bulkProposalActionKey(action));
  }
}

export function markBulkProposalActionConsumed(
  messages,
  targetAction,
  completedAt = new Date().toISOString()
) {
  const targetKey = bulkProposalActionKey(targetAction);
  return (Array.isArray(messages) ? messages : []).map((message) => {
    const action = message?.type === "ui_action" ? message.action : null;
    if (
      action?.kind !== "bulk_fridge_update" ||
      bulkProposalActionKey(action) !== targetKey ||
      isBulkProposalActionConsumed(action)
    ) {
      return message;
    }
    return {
      ...message,
      action: {
        ...action,
        status: "completed",
        consumed: true,
        completedAt,
      },
    };
  });
}
