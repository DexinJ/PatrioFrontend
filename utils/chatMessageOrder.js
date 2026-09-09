// utils/chatMessageOrder.js

/**
 * Insert a new assistant message directly above the pending action card for
 * the same request, so the card renders below the assistant's text. Falls back
 * to appending when no action card is tracked for the request.
 */
export function insertAssistantAboveActionCard(
  previous,
  message,
  actionMessageId
) {
  const prev = Array.isArray(previous) ? previous : [];
  if (!actionMessageId) return [...prev, message];

  const cardIndex = prev.findIndex((entry) => entry?.id === actionMessageId);
  if (cardIndex < 0) return [...prev, message];

  const updated = [...prev];
  updated.splice(cardIndex, 0, message);
  return updated;
}

/**
 * Insert a new assistant message above the earliest structured message in a
 * list of ids (recipe card message, confirmation card, etc.). This keeps the
 * assistant's streamed summary above recipe cards even when a follow-up
 * confirmation card was appended later in the same request.
 */
export function insertAssistantAboveStructuredMessage(
  previous,
  message,
  structuredMessageIds = []
) {
  const prev = Array.isArray(previous) ? previous : [];
  const ids = Array.isArray(structuredMessageIds)
    ? structuredMessageIds
    : [structuredMessageIds];
  const indexes = ids
    .filter((id) => id)
    .map((id) => prev.findIndex((entry) => entry?.id === id))
    .filter((index) => index >= 0);
  if (indexes.length === 0) return [...prev, message];

  const updated = [...prev];
  updated.splice(Math.min(...indexes), 0, message);
  return updated;
}
