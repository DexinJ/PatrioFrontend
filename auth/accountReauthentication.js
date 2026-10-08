import { GoogleSignin } from "@react-native-google-signin/google-signin";
import i18next from "i18next";
import * as AppleAuthentication from "expo-apple-authentication";
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  reauthenticateWithCredential,
} from "firebase/auth";
import { Platform } from "react-native";
import {
  reauthenticateWithApple,
  tryLinkAppleAuthorizationToBackend,
} from "./appleAuth";
import { configureGoogleSignIn } from "./googleAuth";
import { extractGoogleIdTokenFromSignInResponse } from "./googleSignInResponse";

function providerIdsForUser(user) {
  return new Set(
    (user?.providerData || [])
      .map((provider) => String(provider?.providerId || "").trim())
      .filter(Boolean)
  );
}

async function appleReauthenticationAvailable() {
  if (Platform.OS !== "ios") return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

export async function getAccountDeletionReauthenticationMethod(user) {
  const providerIds = providerIdsForUser(user);

  // Prefer Apple when it is linked so this confirmation also produces the
  // fresh authorization code needed to repair a missing server revocation
  // credential before deletion.
  if (
    providerIds.has("apple.com") &&
    (await appleReauthenticationAvailable())
  ) {
    return "apple";
  }
  if (providerIds.has("google.com")) return "google";
  if (providerIds.has("password")) return "password";
  if (providerIds.has("apple.com")) return "apple_unavailable";
  return "unsupported";
}

async function reauthenticateWithGoogle(user) {
  configureGoogleSignIn();
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const response = await GoogleSignin.signIn();
  const idToken = await extractGoogleIdTokenFromSignInResponse(response, {
    getTokens: () => GoogleSignin.getTokens(),
    cancelledCode: "GOOGLE_REAUTHENTICATION_CANCELLED",
    cancelledMessage: i18next.t("errors.googleConfirmationCancelled"),
  });

  const credential = GoogleAuthProvider.credential(idToken);
  await reauthenticateWithCredential(user, credential);
  return { method: "google" };
}

export async function reauthenticateUser(user, options = {}) {
  if (!user) throw new Error(i18next.t("errors.signInBeforeDeletion"));

  const purpose =
    options.purpose === "email-change" ? "email-change" : "account-deletion";

  // An email change must be confirmed with the password credential itself. The
  // shared method chooser prefers Apple when it is linked, which would push a
  // password account into an unrelated Apple flow - and fail outright on a
  // device where Apple reauthentication is unavailable.
  const method =
    purpose === "email-change"
      ? "password"
      : await getAccountDeletionReauthenticationMethod(user);

  if (method === "apple") {
    const result = await reauthenticateWithApple(user);
    const appleLinkResult = await tryLinkAppleAuthorizationToBackend({
      user: result.user,
      authorizationCode: result.authorizationCode,
    });
    return { method, appleLinkResult };
  }

  if (method === "google") {
    return reauthenticateWithGoogle(user);
  }

  if (method === "password") {
    const password = String(options.password || "");
    if (!password) {
      // The account-deletion copy is intentionally unchanged; only the
      // email-change purpose gets a new message.
      const error = new Error(
        purpose === "email-change"
          ? i18next.t("auth.changeEmailPasswordRequired")
          : i18next.t("auth.reauthPasswordRequired")
      );
      error.code = "PASSWORD_REAUTHENTICATION_REQUIRED";
      throw error;
    }
    const email = String(user.email || "").trim();
    if (!email) throw new Error(i18next.t("auth.reauthNoEmail"));
    await reauthenticateWithCredential(
      user,
      EmailAuthProvider.credential(email, password)
    );
    return { method };
  }

  if (method === "apple_unavailable") {
    const error = new Error(
      i18next.t("auth.reauthAppleUnavailable")
    );
    error.code = "APPLE_REAUTHENTICATION_UNAVAILABLE";
    throw error;
  }

  const error = new Error(
    i18next.t("auth.reauthUnsupported")
  );
  error.code = "UNSUPPORTED_REAUTHENTICATION_PROVIDER";
  throw error;
}

// Existing callers keep the account-deletion entry point.
export function reauthenticateForAccountDeletion(user, options = {}) {
  return reauthenticateUser(user, { ...options, purpose: "account-deletion" });
}
