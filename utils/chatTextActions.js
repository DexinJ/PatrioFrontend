// utils/chatTextActions.js
// Clipboard + share helpers for the chat message actions menu.

import * as Clipboard from "expo-clipboard";
import { Share } from "react-native";

export async function copyTextToClipboard(text) {
  const value = String(text ?? "").trim();
  if (!value) return false;
  await Clipboard.setStringAsync(value);
  return true;
}

export async function shareChatText(text) {
  const value = String(text ?? "").trim();
  if (!value) return;
  await Share.share({ message: value });
}
