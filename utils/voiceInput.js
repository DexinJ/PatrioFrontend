// Composer text helpers shared by the message input and its unit tests.

export function normalizeComposerText(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function shouldShowSendButton(value) {
  return normalizeComposerText(value).length > 0;
}
