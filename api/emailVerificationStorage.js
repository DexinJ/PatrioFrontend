// api/emailVerificationStorage.js
// Device-local state for the soft verification gate.
//
// The "prompt request" is deliberately memory-only. Sign-in writes it and the
// prompt consumer reads it in the same JS runtime, so a synchronous flag has no
// ordering assumption to lose - whereas an AsyncStorage write races the
// auth-state reconciliation that mounts the consumer. It also means the nudge
// is never replayed on a cold launch, which is the behaviour we want: a fresh
// sign-in is the moment a typo is worth mentioning.
//
// The request also carries the code from a rejected verification send, so the
// nudge that opens can say why no link arrived instead of appearing for no
// visible reason.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { getUserStorageKeys } from "./storageKeys";

let pendingPrompt = null;

function normalizeUid(uid) {
  return String(uid || "").trim();
}

function normalizeErrorCode(code) {
  return String(code || "").trim() || null;
}

export function requestEmailVerificationPrompt(uid, { sendErrorCode = null } = {}) {
  const normalized = normalizeUid(uid);
  if (!normalized) return;
  pendingPrompt = {
    uid: normalized,
    sendErrorCode: normalizeErrorCode(sendErrorCode),
  };
}

// Consumes the request at most once, and only for the account that asked. A
// stale flag can never prompt a different user because the uid must match.
// Returns null when there is nothing to take, so a caller can tell "no request"
// apart from "request with no failure attached".
export function takeEmailVerificationPromptRequest(uid) {
  const normalized = normalizeUid(uid);
  if (!normalized || pendingPrompt?.uid !== normalized) return null;
  const taken = pendingPrompt;
  pendingPrompt = null;
  return { sendErrorCode: taken.sendErrorCode };
}

export function clearEmailVerificationPromptRequest(uid) {
  const normalized = normalizeUid(uid);
  if (!normalized) return;
  if (pendingPrompt?.uid === normalized) pendingPrompt = null;
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
