// utils/emailVerificationPolicy.js
// Pure email rules for the soft verification gate and the recovery-address
// change flow. This module deliberately has no imports and no React Native
// dependencies: the auth modules resolve through Metro-only extensionless paths
// and pull in native provider packages, so they cannot load under Node. Keeping
// these rules here is what makes them unit-testable.

const PASSWORD_PROVIDER_ID = "password";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const EMAIL_VERIFICATION_PROMPT_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;
export const EMAIL_VERIFICATION_RESEND_COOLDOWN_MS = 60_000;

// Only unambiguous, common misspellings. A wrong suggestion is worse than no
// suggestion, so unusual domains are deliberately left alone.
const DOMAIN_CORRECTIONS = Object.freeze({
  "gmial.com": "gmail.com",
  "gmai.com": "gmail.com",
  "gamil.com": "gmail.com",
  "gmal.com": "gmail.com",
  "gmaill.com": "gmail.com",
  "gmail.co": "gmail.com",
  "gmail.con": "gmail.com",
  "gmail.cm": "gmail.com",
  "googlemail.co": "gmail.com",
  "hotmial.com": "hotmail.com",
  "hotmai.com": "hotmail.com",
  "hotmal.com": "hotmail.com",
  "homail.com": "hotmail.com",
  "hotmail.co": "hotmail.com",
  "outlok.com": "outlook.com",
  "outllok.com": "outlook.com",
  "outook.com": "outlook.com",
  "outlook.co": "outlook.com",
  "yaho.com": "yahoo.com",
  "yahooo.com": "yahoo.com",
  "yahoo.co": "yahoo.com",
  "icoud.com": "icloud.com",
  "icloud.co": "icloud.com",
  "icloud.con": "icloud.com",
  "qq.con": "qq.com",
  "protonmai.com": "protonmail.com",
});

function providerIds(user) {
  const fromList = (Array.isArray(user?.providerData) ? user.providerData : [])
    .map((provider) => String(provider?.providerId || "").trim())
    .filter(Boolean);

  if (fromList.length > 0) return fromList;
  const single = String(user?.providerId || "").trim();
  return single ? [single] : [];
}

export function isPasswordAccount(user) {
  return providerIds(user).includes(PASSWORD_PROVIDER_ID);
}

export function needsEmailVerification(user) {
  return Boolean(
    isPasswordAccount(user) &&
      String(user?.email || "").trim() &&
      user?.emailVerified !== true
  );
}

export function shouldPromptEmailVerification({
  user,
  snoozedUntilMs = null,
  now = Date.now(),
}) {
  if (!needsEmailVerification(user)) return false;
  const snooze = Number(snoozedUntilMs);
  if (!Number.isFinite(snooze) || snooze <= 0) return true;
  return Number(now) >= snooze;
}

// Returns the corrected address or null. The local part keeps the exact casing
// the user typed: only the domain is replaced, because lowercasing the whole
// address would silently rewrite a value the user chose.
export function suggestEmailCorrection(email) {
  const trimmed = String(email || "").trim();
  const atIndex = trimmed.lastIndexOf("@");
  if (atIndex <= 0) return null;

  const localPart = trimmed.slice(0, atIndex);
  const domain = trimmed.slice(atIndex + 1).toLowerCase();
  const correctedDomain = DOMAIN_CORRECTIONS[domain];
  if (!correctedDomain || !localPart) return null;

  return `${localPart}@${correctedDomain}`;
}

export function isValidEmailAddress(value) {
  return EMAIL_PATTERN.test(String(value || "").trim().toLowerCase());
}

export function normalizeNewEmail(value) {
  return String(value || "").trim();
}

// Returns "EMPTY" | "INVALID" | "UNCHANGED" | null. Comparison is
// case-insensitive because Firebase treats the address that way, but the value
// that is sent keeps the user's own casing.
export function emailChangeValidationError(newEmail, currentEmail) {
  const normalized = normalizeNewEmail(newEmail);
  if (!normalized) return "EMPTY";
  if (!isValidEmailAddress(normalized)) return "INVALID";
  if (
    normalizeNewEmail(currentEmail).toLowerCase() === normalized.toLowerCase()
  ) {
    return "UNCHANGED";
  }
  return null;
}
