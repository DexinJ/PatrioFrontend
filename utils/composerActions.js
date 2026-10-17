// Composer primary-button mode, shared by the message input and its tests.
//
// While a reply is streaming, the composer's primary control becomes a Stop
// button. That is possible because the cancellation path already exists:
// `cancelAllActiveRequests` in api/gpt.js is exposed as `cancelAll` by
// `useGpt()`, and the send path already swallows REQUEST_CANCELLED. `waiting`
// is the pre-first-token window of the same request, so it counts as streaming
// too — otherwise the control would flip back to Send mid-request.

export const COMPOSER_ACTION_SEND = "send";
export const COMPOSER_ACTION_STOP = "stop";

export function isChatStreaming({ receiving, waiting } = {}) {
  return Boolean(receiving || waiting);
}

export function resolveComposerAction({ receiving, waiting } = {}) {
  return isChatStreaming({ receiving, waiting })
    ? COMPOSER_ACTION_STOP
    : COMPOSER_ACTION_SEND;
}
