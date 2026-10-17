// utils/legalLinks.js
// One source for the public legal pages. Settings, the sign-up checkbox, and
// the acceptance gate all read these, so they cannot drift apart.
import { Linking } from "react-native";

const APPLE_STANDARD_EULA =
  "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/";

export const TERMS_OF_USE_URL =
  String(process.env.EXPO_PUBLIC_TERMS_OF_USE_URL || "").trim() ||
  APPLE_STANDARD_EULA;

export const PRIVACY_POLICY_URL = String(
  process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL || ""
).trim();

export async function openLegalUrl(url) {
  if (!url) return false;
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}
