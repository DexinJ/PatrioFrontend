import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const inputSource = readFileSync(
  new URL("../components/MessageInput.js", import.meta.url),
  "utf8"
);
const chatSource = readFileSync(
  new URL("../app/(tabs)/chat.js", import.meta.url),
  "utf8"
);

test("the composer forwards focus so the socket can be warmed before sending", () => {
  assert.match(
    inputSource,
    /export default function MessageInput\(\{[^}]*onFocus[^}]*\}\)/
  );
  assert.match(inputSource, /onFocus=\{onFocus\}/);
});

test("the chat screen prewarms when the composer gains focus", () => {
  // Focus is the moment the user is actually about to write, so re-arming the
  // connection there keeps the 90-second idle close from costing the handshake.
  assert.match(chatSource, /const handleComposerFocus = useCallback\(/);
  assert.match(chatSource, /handleComposerFocus[\s\S]{0,200}prewarm\(\)/);
  assert.match(
    chatSource,
    /<MessageInput[\s\S]{0,200}onFocus=\{handleComposerFocus\}/
  );
});

test("the idle close window is unchanged", () => {
  const runtimeSource = readFileSync(
    new URL("../api/gpt.js", import.meta.url),
    "utf8"
  );
  assert.match(runtimeSource, /const WS_IDLE_CLOSE_MS = 90_000;/);
});
