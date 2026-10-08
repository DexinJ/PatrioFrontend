// auth/authErrorMessages.js
// Maps Firebase Auth error codes to catalog keys so every auth surface shows
// translated copy instead of the SDK's English text. Email-enumeration
// protection collapsed several legacy codes into auth/invalid-credential, so
// both spellings intentionally resolve to the same message.

import i18next from "i18next";

// Exported for tests: check-i18n-keys.cjs only scans literal quoted translation
// calls, so a typo in these values would otherwise reach production as a raw
// key. (Avoid writing that call pattern in prose here - the scanner reads
// comments too.)
export const AUTH_ERROR_MESSAGE_KEYS = Object.freeze({
  "auth/invalid-credential": "auth.errorInvalidCredential",
  "auth/wrong-password": "auth.errorInvalidCredential",
  "auth/user-not-found": "auth.errorInvalidCredential",
  "auth/invalid-email": "auth.errorInvalidEmail",
  "auth/missing-email": "auth.errorInvalidEmail",
  "auth/missing-password": "auth.errorMissingPassword",
  "auth/weak-password": "auth.errorWeakPassword",
  "auth/email-already-in-use": "auth.errorEmailInUse",
  "auth/credential-already-in-use": "auth.errorEmailInUse",
  "auth/user-disabled": "auth.errorUserDisabled",
  "auth/requires-recent-login": "auth.errorRequiresRecentLogin",
  "auth/too-many-requests": "auth.errorTooManyRequests",
  "auth/network-request-failed": "auth.errorNetwork",
  "auth/user-mismatch": "auth.errorUserMismatch",
  "auth/operation-not-allowed": "auth.errorOperationNotAllowed",
});

export function authErrorMessageKey(error) {
  const code = String(error?.code || "").trim();
  return AUTH_ERROR_MESSAGE_KEYS[code] || null;
}

// For non-component callers. Components should pair authErrorMessageKey with
// useTranslation() so the message re-renders when the language changes.
export function authErrorMessage(error, fallbackMessage) {
  const key = authErrorMessageKey(error);
  if (key) return i18next.t(key);
  return fallbackMessage || i18next.t("common.unknownError");
}
