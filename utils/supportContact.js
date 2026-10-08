// utils/supportContact.js
// Support runs through one general-purpose form: support questions, bug
// reports, privacy requests, and account-deletion requests from people who
// cannot sign in. The URL is supplied at build time so the form can be
// replaced without a code change; when it is missing we fall back to email so
// support is never unreachable.
import { Alert, Linking } from "react-native";

export const SUPPORT_EMAIL = "support.pantrio@gmail.com";

export const SUPPORT_FORM_URL = String(
  process.env.EXPO_PUBLIC_SUPPORT_FORM_URL || ""
).trim();

export function supportDestinationUrl() {
  return SUPPORT_FORM_URL || `mailto:${SUPPORT_EMAIL}`;
}

export async function openSupportContact({ title, failureMessage } = {}) {
  try {
    await Linking.openURL(supportDestinationUrl());
    return true;
  } catch {
    Alert.alert(
      title || "Contact support",
      failureMessage || `Could not open support. Email us at ${SUPPORT_EMAIL}.`
    );
    return false;
  }
}
