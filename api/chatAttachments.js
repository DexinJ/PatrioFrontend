import * as FileSystem from "expo-file-system/legacy";
import i18next from "i18next";

const ROOT_DIRECTORY = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}pantrio-chat-attachments/`
  : null;

function safeUserDirectoryName(uid) {
  return encodeURIComponent(String(uid || "anonymous").trim() || "anonymous");
}

function userDirectory(uid) {
  return ROOT_DIRECTORY
    ? `${ROOT_DIRECTORY}${safeUserDirectoryName(uid)}/`
    : null;
}

export function isManagedChatAttachment(uri) {
  return Boolean(
    ROOT_DIRECTORY &&
      typeof uri === "string" &&
      uri.startsWith(ROOT_DIRECTORY)
  );
}

const DATA_IMAGE_PREFIX = "data:image/";

// Turns a transcript image reference back into something a model can read.
//
// The chat stores a photo as its durable managed attachment (a `file://` path
// inside the app sandbox), because storing the base64 data URL is exactly what
// `utils/chatStoragePolicy.js` refuses to do. A retry therefore has to read the
// bytes back: a `file://` URL is meaningless to the backend and to OpenAI, and
// the on-device Apple provider drops anything that is not a data URL
// (api/gpt.js#extractAppleImageBase64).
//
// Any local `file://` path is accepted, not just the managed attachment
// directory: with incognito on, the chat keeps the image manipulator's temporary
// capture file instead of copying it into the managed directory, and that file is
// still readable while it exists. The transcript is the only source of these
// strings, and the app wrote every one of them.
//
// Returns "" whenever the bytes cannot be produced — an unreadable path, a pruned
// attachment, a remote URI with nothing local to read — so the caller can choose
// between a text-only retry and refusing it. Never throws.
export async function toRequestImageUri(uri) {
  const normalized = String(uri || "").trim();
  if (!normalized) return "";
  if (normalized.toLowerCase().startsWith(DATA_IMAGE_PREFIX)) return normalized;
  if (!normalized.toLowerCase().startsWith("file://")) return "";

  try {
    const base64 = await FileSystem.readAsStringAsync(normalized, {
      encoding: "base64",
    });
    return base64 ? `data:image/jpeg;base64,${base64}` : "";
  } catch {
    return "";
  }
}

export async function persistChatAttachment(uid, sourceUri) {
  const normalizedSource = String(sourceUri || "").trim();
  if (!normalizedSource) throw new Error(i18next.t("chat.errors.imageMissing"));
  if (
    !ROOT_DIRECTORY
  ) return normalizedSource;
  if (isManagedChatAttachment(normalizedSource)) return normalizedSource;

  const directory = userDirectory(uid);
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const filename = `${Date.now()}-${Math.random().toString(16).slice(2)}.jpg`;
  const destination = `${directory}${filename}`;
  await FileSystem.copyAsync({ from: normalizedSource, to: destination });
  return destination;
}

export async function deleteChatAttachments(uid) {
  const directory = userDirectory(uid);
  if (!directory) return;
  await FileSystem.deleteAsync(directory, { idempotent: true });
}

export async function pruneChatAttachments(uid, retainedUris = []) {
  const directory = userDirectory(uid);
  if (!directory) return;

  const directoryInfo = await FileSystem.getInfoAsync(directory);
  if (!directoryInfo.exists) return;

  const retained = new Set(
    (Array.isArray(retainedUris) ? retainedUris : []).filter((uri) =>
      isManagedChatAttachment(uri)
    )
  );
  const filenames = await FileSystem.readDirectoryAsync(directory);
  await Promise.allSettled(
    filenames.map((filename) => {
      const uri = `${directory}${filename}`;
      return retained.has(uri)
        ? Promise.resolve()
        : FileSystem.deleteAsync(uri, { idempotent: true });
    })
  );
}
