import assert from "node:assert/strict";
import test from "node:test";

import { shouldShowSendButton } from "../utils/voiceInput.js";

test("composer action switches to send only for meaningful text", () => {
  assert.equal(shouldShowSendButton(""), false);
  assert.equal(shouldShowSendButton("   \n"), false);
  assert.equal(shouldShowSendButton("  dinner ideas  "), true);
});

