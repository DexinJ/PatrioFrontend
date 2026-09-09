import assert from "node:assert/strict";
import test from "node:test";

import {
  // [VOICE DISABLED] Voice transcription helpers are commented out.
  //   buildVoiceUploadFormData,
  //   mergeTranscriptIntoComposer,
  shouldShowSendButton,
} from "../utils/voiceInput.js";

test("composer action switches to send only for meaningful text", () => {
  assert.equal(shouldShowSendButton(""), false);
  assert.equal(shouldShowSendButton("   \n"), false);
  assert.equal(shouldShowSendButton("  dinner ideas  "), true);
});

// [VOICE DISABLED] Voice transcription tests are commented out.
// test("voice transcription populates and preserves the editable draft", () => {
//   assert.equal(
//     mergeTranscriptIntoComposer("", "  Add milk to my fridge. "),
//     "Add milk to my fridge."
//   );
//   assert.equal(
//     mergeTranscriptIntoComposer("Please remember", " eggs and bread "),
//     "Please remember eggs and bread"
//   );
// });
//
// test("native transcription uploads retain the React Native file descriptor", async () => {
//   class FakeFormData {
//     entries = [];
//
//     append(...entry) {
//       this.entries.push(entry);
//     }
//   }
//
//   const formData = await buildVoiceUploadFormData(
//     "file:///cache/recording.m4a",
//     { FormDataImpl: FakeFormData }
//   );
//
//   assert.deepEqual(formData.entries, [
//     [
//       "file",
//       {
//         uri: "file:///cache/recording.m4a",
//         type: "audio/m4a",
//         name: "recording.m4a",
//       },
//     ],
//   ]);
// });
