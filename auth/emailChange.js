// auth/emailChange.js
// Changing a wrong recovery address. verifyBeforeUpdateEmail is deliberate: the
// sign-in email only moves once the new address has been proven, so a second
// typo leaves the account exactly where it was.

import { verifyBeforeUpdateEmail } from "firebase/auth";
import i18next from "i18next";
import { normalizeNewEmail } from "../utils/emailVerificationPolicy";
import { reauthenticateUser } from "./accountReauthentication";

export async function changeAccountEmail(user, { newEmail, password } = {}) {
  if (!user) throw new Error(i18next.t("auth.changeEmailNoAccount"));

  const normalized = normalizeNewEmail(newEmail);
  try {
    await verifyBeforeUpdateEmail(user, normalized);
  } catch (error) {
    if (error?.code !== "auth/requires-recent-login") throw error;
    // Reauthentication must use the stored (wrong) address, not the corrected
    // one, or Firebase rejects it with auth/user-mismatch.
    await reauthenticateUser(user, { password, purpose: "email-change" });
    await verifyBeforeUpdateEmail(user, normalized);
  }

  return { email: normalized, pendingConfirmation: true };
}
