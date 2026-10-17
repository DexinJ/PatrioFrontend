// utils/aiDisclosurePolicy.cjs
//
// Whether the account has agreed to have its messages and photos processed by
// Pantrio's servers and a third-party AI provider.
//
// Kept pure and CommonJS so the Node unit tests can require it directly, the
// same pattern as guestStoragePolicy.cjs and termsAcceptancePolicy.cjs.
//
// The acknowledgement is stored per account inside `settings.chat`, which is
// namespaced per user id and is removed by the account-deletion purge, so a new
// account is asked again. A version constant rides along with the flag: bumping
// it re-asks everyone, which is what a material change to the disclosure
// requires.

const AI_DISCLOSURE_SETTINGS_VERSION = 1;

function chatSettingsOf(settings) {
  if (!settings || typeof settings !== "object") return {};
  const chat = settings.chat;
  return chat && typeof chat === "object" && !Array.isArray(chat) ? chat : {};
}

// Only an explicit `true` at the current version counts. A missing key, a
// string "true" from a hand-edited store, or an older version all fail closed
// and ask again rather than assuming consent.
function isAiDisclosureAcknowledged(settings) {
  const chat = chatSettingsOf(settings);
  return (
    chat.aiDisclosureAcknowledged === true &&
    chat.aiDisclosureVersion === AI_DISCLOSURE_SETTINGS_VERSION
  );
}

function needsAiDisclosure(settings) {
  return !isAiDisclosureAcknowledged(settings);
}

module.exports = {
  AI_DISCLOSURE_SETTINGS_VERSION,
  isAiDisclosureAcknowledged,
  needsAiDisclosure,
};
