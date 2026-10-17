// A failed chat turn renders as a notice instead of an assistant bubble, and
// the notice offers to re-send the turn it failed to answer.
//
// Notices are only ever produced by the composer flow in app/(tabs)/chat.js,
// which sends text and/or an image and no uiAction. The retry payload is
// therefore rebuilt from the user turn that precedes the notice rather than
// stored on the notice itself, so it survives a reload without new persisted
// shape. See design-plans/chat-failed-turn-card.md.

// "The recipe search timed out. Showing what was found." is a partial result
// rather than a dead end, so it earns the softer warning treatment.
export const SOFT_ERROR_CODES = new Set(["RECIPE_RECOMMENDATION_TIMEOUT"]);

// sanitizeMessage (utils/chatStoragePolicy.js) rewrites images it cannot keep
// as this placeholder text. Sending it back would ask the model about a
// literal "[image]", so it counts as no text at all.
const IMAGE_PLACEHOLDER_TEXT = "[image]";

export function noticeToneForErrorCode(code) {
  return SOFT_ERROR_CODES.has(String(code || "").trim()) ? "warning" : "error";
}

function isNotice(message) {
  return Boolean(
    message && typeof message === "object" && message.isError === true
  );
}

function messageText(message) {
  return typeof message?.text === "string" ? message.text : "";
}

function partText(part) {
  return part && typeof part.text === "string" ? part.text : "";
}

function partImageUri(part) {
  const value = part?.image_url ?? part?.imageUri ?? part?.imageUrl;
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object" && typeof value.url === "string") {
    return value.url.trim();
  }
  return "";
}

// Rebuilds the request a user turn would have produced. Returns null when the
// turn has nothing left to send (for example an image-only turn whose photo was
// not durable enough to persist).
function payloadFromUserMessage(message) {
  if (
    !message ||
    typeof message !== "object" ||
    message.role !== "user"
  ) {
    return null;
  }

  let text = "";
  let imageUri = "";

  for (const part of Array.isArray(message.content) ? message.content : []) {
    const partTextValue = partText(part).trim();
    if (partTextValue && !text) text = partTextValue;
    const partImage = partImageUri(part);
    if (partImage && !imageUri) imageUri = partImage;
  }

  if (!text) text = messageText(message).trim();
  if (!imageUri) {
    imageUri = typeof message.imageUri === "string" ? message.imageUri.trim() : "";
  }

  if (
    text === IMAGE_PLACEHOLDER_TEXT ||
    text.startsWith("[fromTool]")
  ) {
    text = "";
  }
  if (!text && !imageUri) return null;

  return { text, imageUri, imageRequestUri: imageUri };
}

/**
 * The request to re-send for a notice, or null when there is nothing to retry.
 *
 * Only the newest notice is retryable: the request history has to end with the
 * turn being re-sent, and once the user has moved on to another turn the
 * transcript tail no longer matches this notice.
 */
export function retryPayloadFromMessages(messages, noticeId) {
  const list = Array.isArray(messages) ? messages : [];
  const noticeIndex = list.findIndex(
    (message) => isNotice(message) && message.id === noticeId
  );
  if (noticeIndex < 0 || noticeIndex !== list.length - 1) return null;

  for (let index = noticeIndex - 1; index >= 0; index -= 1) {
    const payload = payloadFromUserMessage(list[index]);
    if (payload) return payload;
  }
  return null;
}

// The retry's request payload can only be built with the image bytes, and the
// transcript never stores them: `utils/chatStoragePolicy.js` deliberately drops
// data URLs and keeps the durable managed attachment path instead. So the caller
// materialises the data URL from that file first (see
// api/chatAttachments.js#toRequestImageUri) and hands it in here.
//
// Pure on purpose, so the "can this turn be re-sent, and as what" rule is
// unit-testable without a file system.
export const RETRY_MODE_FULL = "full";
export const RETRY_MODE_TEXT_ONLY = "text-only";
export const RETRY_MODE_BLOCKED = "blocked";

export function planRetrySend(payload, imageDataUri = "") {
  const text = typeof payload?.text === "string" ? payload.text : "";
  const dataUri = String(imageDataUri || "").trim();

  if (dataUri) {
    return { mode: RETRY_MODE_FULL, text, imageRequestUri: dataUri };
  }
  if (text.trim()) {
    // The photo is gone (cleared cache, pruned attachment, another device), but
    // the words are not: re-sending the text alone is still a useful retry.
    return { mode: RETRY_MODE_TEXT_ONLY, text, imageRequestUri: "" };
  }
  // An image-only turn with no readable bytes has nothing to send. Sending the
  // dead path would ask the model about a file it cannot see.
  return { mode: RETRY_MODE_BLOCKED, text: "", imageRequestUri: "" };
}

export function removeNotice(messages, noticeId) {
  const list = Array.isArray(messages) ? messages : [];
  const next = list.filter(
    (message) => !(isNotice(message) && message.id === noticeId)
  );
  return next.length === list.length ? list : next;
}

/**
 * A turn can report failure twice (a retry that fails again). Replace the
 * notice sitting directly after the last user turn instead of stacking a
 * second one, and leave every other notice untouched.
 */
export function replaceTrailingNotice(messages, notice) {
  const list = Array.isArray(messages) ? messages : [];
  const lastUserIndex = list.reduce(
    (found, message, index) => (message?.role === "user" ? index : found),
    -1
  );
  const trailingIndex = lastUserIndex + 1;
  if (lastUserIndex >= 0 && isNotice(list[trailingIndex])) {
    const next = list.slice();
    next[trailingIndex] = notice;
    return next;
  }
  return [...list, notice];
}
