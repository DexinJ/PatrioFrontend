// api/emailVerificationStorage.js
// Device-local state for the soft verification gate.
//
// The "prompt request" is deliberately memory-only. Sign-in writes it and the
// prompt consumer reads it in the same JS runtime, so a synchronous flag has no
// ordering assumption to lose - whereas an AsyncStorage write races the
// auth-state reconciliation that mounts the consumer. It also means the nudge
// is never replayed on a cold launch, which is the behaviour we want: a fresh
// sign-in is the moment a typo is worth mentioning.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { getUserStorageKeys } from "./storageKeys";

let pendingPromptUid = null;

function normalizeUid(uid) {
  return String(uid || "").trim();
}

export function requestEmailVerificationPrompt(uid) {
  const normalized = normalizeUid(uid);
  if (!normalized) return;
  pendingPromptUid = normalized;
}

// Consumes the request at most once, and only for the account that asked. A
// stale flag can never prompt a different user because the uid must match.
export function takeEmailVerificationPromptRequest(uid) {
  const normalized = normalizeUid(uid);
  if (!normalized || pendingPromptUid !== normalized) return false;
  pendingPromptUid = null;
  return true;
}

export function clearEmailVerificationPromptRequest(uid) {
  const normalized = normalizeUid(uid);
  if (!normalized) return;
  if (pendingPromptUid === normalized) pendingPromptUid = null;
}

// Only the snooze persists, and it is uid-scoped.
export async function getEmailVerificationSnoozeUntil(uid) {
  const normalized = normalizeUid(uid);
  if (!normalized) return null;
  const stored = await AsyncStorage.getItem(
    getUserStorageKeys(normalized).emailVerificationSnooze
  );
  const value = Number(stored);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export async function snoozeEmailVerificationPrompt(uid, untilMs) {
  const normalized = normalizeUid(uid);
  if (!normalized) return;
  await AsyncStorage.setItem(
    getUserStorageKeys(normalized).emailVerificationSnooze,
    String(Number(untilMs))
  );
}

export async function clearEmailVerificationSnooze(uid) {
  const normalized = normalizeUid(uid);
  if (!normalized) return;
  await AsyncStorage.removeItem(
    getUserStorageKeys(normalized).emailVerificationSnooze
  );
}
