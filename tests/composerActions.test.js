import assert from "node:assert/strict";
import test from "node:test";

import {
  COMPOSER_ACTION_SEND,
  COMPOSER_ACTION_STOP,
  isChatStreaming,
  resolveComposerAction,
} from "../utils/composerActions.js";

test("an idle composer offers Send", () => {
  assert.equal(isChatStreaming({ receiving: false, waiting: false }), false);
  assert.equal(
    resolveComposerAction({ receiving: false, waiting: false }),
    COMPOSER_ACTION_SEND
  );
});

test("both streaming phases offer Stop", () => {
  // `waiting` is the pre-first-token window; the control must not flip back to
  // Send once the first token lands and only `receiving` remains true.
  assert.equal(
    resolveComposerAction({ receiving: true, waiting: true }),
    COMPOSER_ACTION_STOP
  );
  assert.equal(
    resolveComposerAction({ receiving: true, waiting: false }),
    COMPOSER_ACTION_STOP
  );
  assert.equal(
    resolveComposerAction({ receiving: false, waiting: true }),
    COMPOSER_ACTION_STOP
  );
});

test("missing state is treated as idle instead of crashing", () => {
  assert.equal(isChatStreaming(), false);
  assert.equal(resolveComposerAction(), COMPOSER_ACTION_SEND);
  assert.equal(resolveComposerAction({ receiving: undefined }), COMPOSER_ACTION_SEND);
});
