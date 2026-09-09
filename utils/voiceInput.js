// ============================================================================
// VOICE RECOGNITION DISABLED
// ----------------------------------------------------------------------------
// Only the generic composer helpers below are active. The voice-specific
// helpers (transcript merging and audio upload FormData) are commented out and
// can be restored if voice input is re-enabled.
// ============================================================================

export function normalizeComposerText(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function shouldShowSendButton(value) {
  return normalizeComposerText(value).length > 0;
}

// [VOICE DISABLED] Merges a spoken transcript into the composer draft.
// export function mergeTranscriptIntoComposer(currentValue, transcript) {
//   const current = normalizeComposerText(currentValue);
//   const spoken = normalizeComposerText(transcript);
//
//   if (!spoken) return current;
//   return current ? `${current} ${spoken}` : spoken;
// }

// [VOICE DISABLED] Builds the multipart body for the transcription upload.
// export async function buildVoiceUploadFormData(
//   uri,
//   {
//     FormDataImpl = globalThis.FormData,
//   } = {}
// ) {
//   const recordingUri = typeof uri === "string" ? uri.trim() : "";
//   if (!recordingUri) {
//     throw new Error("The recording did not produce a file.");
//   }
//   if (typeof FormDataImpl !== "function") {
//     throw new Error("Audio uploads are not supported on this device.");
//   }
//
//   const formData = new FormDataImpl();
//
//   // React Native's FormData implementation recognizes this file descriptor
//   // and streams the file URI instead of serializing the object as text.
//   formData.append("file", {
//     uri: recordingUri,
//     type: "audio/m4a",
//     name: "recording.m4a",
//   });
//   return formData;
// }
