import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import i18next from "i18next";
import React, { useContext, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  Platform, // ✅ CHANGED: needed to show Apple only on iOS
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  createUserWithEmailAndPassword,
  deleteUser,
  signOut as firebaseSignOut,
} from "firebase/auth";

import {
  signInWithApple,
  tryLinkAppleAuthorizationToBackend,
} from "../../auth/appleAuth"; // ✅ CHANGED: Apple login helper
import {
  bindAuthProvisioningUser,
  clearAuthProvisioningIntent,
  markAuthProvisioningStarted,
} from "../../api/authProvisioningStorage";
import { API_BASE_URL } from "../../api/backendConfig";
import { fetchWithTimeout } from "../../api/fetchWithTimeout";
import { auth } from "../../auth/firebaseClient";
import {
  signInWithGoogleNative,
  signOutFromGoogleNative,
} from "../../auth/googleAuth";
import { useAuth } from "../../auth/useAuth";
import { GlobalContext } from "../../context/GlobalContext";

const PROFILE_REQUEST_TIMEOUT_MS = 15000;

function accountSetupCancelledError() {
  const error = new Error("Account setup was cancelled.");
  error.code = "ACCOUNT_SETUP_CANCELLED";
  return error;
}

async function saveUserProfileToBackend({ idToken, username, signal }) {
  let resp;

  try {
    resp = await fetchWithTimeout(
      `${API_BASE_URL}/api/users`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ username }),
        signal,
      },
      {
        timeoutMs: PROFILE_REQUEST_TIMEOUT_MS,
        timeoutMessage: i18next.t("errors.accountSetupTimedOut"),
      }
    );
  } catch (error) {
    if (error?.name === "AbortError" && signal?.aborted) {
      throw accountSetupCancelledError();
    }
    throw error;
  }

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(
      i18next.t("errors.backendSaveFailed", {
        status: resp.status,
        message: text.slice(0, 200),
      })
    );
  }

  return resp.json().catch(() => ({}));
}

function makeFallbackUsername(user, typedUsername = "") {
  // ✅ CHANGED: shared fallback username helper for Google + Apple
  return (
    typedUsername.trim() ||
    user?.displayName?.replace(/\s+/g, "").slice(0, 20) ||
    user?.email?.split("@")[0].slice(0, 20) ||
    "user"
  );
}

export default function SignUpScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const {
    abortProvisioning,
    beginProvisioning,
    completeProvisioning,
  } = useAuth();

  const { theme, settings, setUsername: setUsernameInApp } =
    useContext(GlobalContext);

  const fontSize = settings?.ux?.fontSize || 16;

  const [username, setUsernameInput] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false); // ✅ CHANGED
  const mountedRef = useRef(true);
  const activeProvisioningRef = useRef(null);
  const activeProvisioningProviderRef = useRef(null);
  const profileRequestControllerRef = useRef(null);
  const operationBusyRef = useRef(false);

  const ensureProvisioningIsActive = (generation) => {
    if (
      !mountedRef.current ||
      activeProvisioningRef.current !== generation
    ) {
      throw accountSetupCancelledError();
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      profileRequestControllerRef.current?.abort();
      const generation = activeProvisioningRef.current;
      if (generation !== null) {
        void abortProvisioning(generation, {
          provider: activeProvisioningProviderRef.current,
        }).catch(() => {});
      }
    };
  }, [abortProvisioning]);

  const isBusy = loading || googleLoading || appleLoading; // ✅ CHANGED

  const submit = async () => {
    const e = email.trim();
    const u = username.trim();

    if (!u || !e || !pw || !pw2) {
      return Alert.alert(t("auth.missingInfo"), t("auth.fillAllFields"));
    }
    if (u.length < 2 || u.length > 20) {
      return Alert.alert(t("auth.username"), t("auth.usernameRules"));
    }
    if (pw !== pw2) {
      return Alert.alert(
        t("auth.passwordsDontMatch"),
        t("auth.retypePassword")
      );
    }
    if (pw.length < 6) {
      return Alert.alert(
        t("auth.weakPassword"),
        t("auth.passwordMinLength")
      );
    }
    if (operationBusyRef.current) return;

    operationBusyRef.current = true;
    setLoading(true);
    let generation = null;
    let markerStarted = false;
    let createdUser = null;
    let backendProfileSaved = false;
    let firebaseUserDeleted = false;
    try {
      generation = beginProvisioning();
      activeProvisioningRef.current = generation;
      activeProvisioningProviderRef.current = null;
      await markAuthProvisioningStarted("password");
      markerStarted = true;
      if (!mountedRef.current) {
        return;
      }

      const cred = await createUserWithEmailAndPassword(auth, e, pw);
      createdUser = cred.user;
      ensureProvisioningIsActive(generation);
      await bindAuthProvisioningUser(cred.user.uid);
      ensureProvisioningIsActive(generation);
      const idToken = await cred.user.getIdToken();
      ensureProvisioningIsActive(generation);

      const profileController = new AbortController();
      profileRequestControllerRef.current = profileController;
      try {
        await saveUserProfileToBackend({
          idToken,
          username: u,
          signal: profileController.signal,
        });
      } finally {
        if (profileRequestControllerRef.current === profileController) {
          profileRequestControllerRef.current = null;
        }
      }
      backendProfileSaved = true;
      await clearAuthProvisioningIntent().catch(() => {});
      ensureProvisioningIsActive(generation);

      if (mountedRef.current) setUsernameInApp(u);
      activeProvisioningRef.current = null;
      activeProvisioningProviderRef.current = null;
      completeProvisioning(generation);
    } catch (err) {
      if (createdUser && !backendProfileSaved) {
        try {
          await deleteUser(createdUser);
          firebaseUserDeleted = true;
        } catch {
          // Keep the durable marker. A later sign-in will verify whether this
          // Firebase account ever received its backend profile.
        }
      }
      if (generation !== null) {
        await abortProvisioning(generation).catch(() => false);
      }
      if (!mountedRef.current) {
        await firebaseSignOut(auth).catch(() => {});
      }
      if (markerStarted && (backendProfileSaved || firebaseUserDeleted)) {
        await clearAuthProvisioningIntent().catch(() => {});
      }
      activeProvisioningRef.current = null;
      activeProvisioningProviderRef.current = null;
      if (mountedRef.current && err?.code !== "ACCOUNT_SETUP_CANCELLED") {
        Alert.alert(t("auth.signUpFailed"), err?.message || t("common.unknownError"));
      }
    } finally {
      profileRequestControllerRef.current = null;
      operationBusyRef.current = false;
      if (mountedRef.current) setLoading(false);
    }
  };

  const onPressGoogle = async () => {
    const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
    if (!webClientId) {
      return Alert.alert(
        t("auth.googleNotConfigured"),
        t("auth.googleNotConfiguredMessage")
      );
    }
    if (operationBusyRef.current) return;

    operationBusyRef.current = true;
    setGoogleLoading(true);
    let generation = null;
    let signedInUser = null;
    let backendProfileSaved = false;
    try {
      generation = beginProvisioning();
      activeProvisioningRef.current = generation;
      activeProvisioningProviderRef.current = "google";
      await markAuthProvisioningStarted("google");
      if (!mountedRef.current) {
        return;
      }

      const userCred = await signInWithGoogleNative(auth);
      signedInUser = userCred?.user || null;
      ensureProvisioningIsActive(generation);
      if (!userCred?.user) {
        await abortProvisioning(generation, { provider: "google" });
        await clearAuthProvisioningIntent().catch(() => {});
        activeProvisioningRef.current = null;
        activeProvisioningProviderRef.current = null;
        return;
      }

      await bindAuthProvisioningUser(userCred.user.uid);
      ensureProvisioningIsActive(generation);
      const fallbackUsername = makeFallbackUsername(userCred.user, username);
      const firebaseIdToken = await userCred.user.getIdToken();
      ensureProvisioningIsActive(generation);

      const profileController = new AbortController();
      profileRequestControllerRef.current = profileController;
      try {
        await saveUserProfileToBackend({
          idToken: firebaseIdToken,
          username: fallbackUsername,
          signal: profileController.signal,
        });
      } finally {
        if (profileRequestControllerRef.current === profileController) {
          profileRequestControllerRef.current = null;
        }
      }
      backendProfileSaved = true;
      await clearAuthProvisioningIntent().catch(() => {});
      ensureProvisioningIsActive(generation);

      if (mountedRef.current) setUsernameInApp(fallbackUsername);
      activeProvisioningRef.current = null;
      activeProvisioningProviderRef.current = null;
      completeProvisioning(generation);
    } catch (err) {
      if (generation !== null) {
        await abortProvisioning(generation, { provider: "google" }).catch(
          () => false
        );
      }
      if (backendProfileSaved) {
        await clearAuthProvisioningIntent().catch(() => {});
      }
      if (!mountedRef.current && signedInUser) {
        await firebaseSignOut(auth).catch(() => {});
        await signOutFromGoogleNative().catch(() => {});
      }
      activeProvisioningRef.current = null;
      activeProvisioningProviderRef.current = null;
      if (mountedRef.current && err?.code !== "ACCOUNT_SETUP_CANCELLED") {
        Alert.alert(
          t("auth.googleSignInFailed"),
          err?.message || t("common.unknownError")
        );
      }
    } finally {
      profileRequestControllerRef.current = null;
      operationBusyRef.current = false;
      if (mountedRef.current) setGoogleLoading(false);
    }
  };

  // ✅ CHANGED: Apple sign-up/sign-in handler
  const onPressApple = async () => {
    if (operationBusyRef.current) return;

    operationBusyRef.current = true;
    setAppleLoading(true);
    let generation = null;
    let markerStarted = false;
    let signedInUser = null;
    let backendProfileSaved = false;
    try {
      generation = beginProvisioning();
      activeProvisioningRef.current = generation;
      activeProvisioningProviderRef.current = "apple";
      await markAuthProvisioningStarted("apple");
      markerStarted = true;
      if (!mountedRef.current) {
        return;
      }

      const result = await signInWithApple();
      signedInUser = result?.user || null;
      ensureProvisioningIsActive(generation);
      if (!result?.user) {
        await abortProvisioning(generation);
        await clearAuthProvisioningIntent().catch(() => {});
        activeProvisioningRef.current = null;
        activeProvisioningProviderRef.current = null;
        return;
      }

      await bindAuthProvisioningUser(result.user.uid);
      ensureProvisioningIsActive(generation);
      const appleName = result.appleCredential?.fullName;
      const displayNameFromApple = appleName
        ? `${appleName.givenName || ""}${appleName.familyName || ""}`.trim()
        : "";

      const fallbackUsername = makeFallbackUsername(
        {
          ...result.user,
          displayName: result.user?.displayName || displayNameFromApple,
        },
        username
      );

      const firebaseIdToken = await result.user.getIdToken();
      ensureProvisioningIsActive(generation);

      const profileController = new AbortController();
      profileRequestControllerRef.current = profileController;
      try {
        await saveUserProfileToBackend({
          idToken: firebaseIdToken,
          username: fallbackUsername,
          signal: profileController.signal,
        });
      } finally {
        if (profileRequestControllerRef.current === profileController) {
          profileRequestControllerRef.current = null;
        }
      }
      backendProfileSaved = true;
      await tryLinkAppleAuthorizationToBackend({
        user: result.user,
        authorizationCode: result.authorizationCode,
      });
      await clearAuthProvisioningIntent().catch(() => {});
      ensureProvisioningIsActive(generation);

      if (mountedRef.current) setUsernameInApp(fallbackUsername);
      activeProvisioningRef.current = null;
      activeProvisioningProviderRef.current = null;
      completeProvisioning(generation);
    } catch (err) {
      if (generation !== null) {
        await abortProvisioning(generation).catch(() => false);
      }
      if (backendProfileSaved) {
        await clearAuthProvisioningIntent().catch(() => {});
      }
      if (!mountedRef.current && signedInUser) {
        await firebaseSignOut(auth).catch(() => {});
      }
      if (markerStarted && err?.code === "ERR_REQUEST_CANCELED") {
        await clearAuthProvisioningIntent().catch(() => {});
      }
      activeProvisioningRef.current = null;
      activeProvisioningProviderRef.current = null;
      if (err?.code === "ERR_REQUEST_CANCELED") return;
      if (mountedRef.current && err?.code !== "ACCOUNT_SETUP_CANCELLED") {
        Alert.alert(
          t("auth.appleSignInFailed"),
          err?.message || t("common.unknownError")
        );
      }
    } finally {
      profileRequestControllerRef.current = null;
      operationBusyRef.current = false;
      if (mountedRef.current) setAppleLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Text
        style={[
          styles.title,
          { color: theme.textPrimary, fontSize: fontSize * 1.6 },
        ]}
      >
        {t("auth.createAccount")}
      </Text>

      <Text style={[styles.label, { color: theme.textSecondary }]}>
        {t("auth.username")}
      </Text>
      <TextInput
        value={username}
        onChangeText={setUsernameInput}
        autoCapitalize="none"
        placeholder={t("auth.usernamePlaceholder")}
        placeholderTextColor={theme.textPlaceholder}
        style={[
          styles.input,
          {
            backgroundColor: theme.inputBackground,
            borderColor: theme.border,
            color: theme.inputText,
            fontSize,
          },
        ]}
      />

      <Text style={[styles.label, { color: theme.textSecondary }]}>
        {t("auth.email")}
      </Text>
      <TextInput
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        placeholder={t("auth.emailPlaceholder")}
        placeholderTextColor={theme.textPlaceholder}
        style={[
          styles.input,
          {
            backgroundColor: theme.inputBackground,
            borderColor: theme.border,
            color: theme.inputText,
            fontSize,
          },
        ]}
      />

      <Text style={[styles.label, { color: theme.textSecondary }]}>
        {t("auth.password")}
      </Text>
      <TextInput
        value={pw}
        onChangeText={setPw}
        secureTextEntry
        placeholder="••••••••"
        placeholderTextColor={theme.textPlaceholder}
        style={[
          styles.input,
          {
            backgroundColor: theme.inputBackground,
            borderColor: theme.border,
            color: theme.inputText,
            fontSize,
          },
        ]}
      />

      <Text style={[styles.label, { color: theme.textSecondary }]}>
        {t("auth.confirmPassword")}
      </Text>
      <TextInput
        value={pw2}
        onChangeText={setPw2}
        secureTextEntry
        placeholder="••••••••"
        placeholderTextColor={theme.textPlaceholder}
        style={[
          styles.input,
          {
            backgroundColor: theme.inputBackground,
            borderColor: theme.border,
            color: theme.inputText,
            fontSize,
          },
        ]}
      />

      <Pressable
        style={[
          styles.button,
          {
            backgroundColor: theme.actionButton,
            opacity: isBusy ? 0.6 : 1,
          },
        ]}
        onPress={submit}
        disabled={isBusy}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={[styles.buttonText, { fontSize }]}>
            {t("auth.createAccount")}
          </Text>
        )}
      </Pressable>

      <View style={styles.oauthRowWrap}>
        <Text style={[styles.oauthLabel, { color: theme.textSecondary }]}>
          {t("auth.orContinueWith")}
        </Text>

        <View style={styles.oauthRow}>
          <Pressable
            style={[
              styles.oauthIconButton,
              {
                backgroundColor: theme.card,
                borderColor: theme.border,
                opacity: isBusy ? 0.35 : 1,
              },
            ]}
            onPress={onPressGoogle}
            disabled={isBusy}
            accessibilityRole="button"
            accessibilityLabel={t("auth.continueWithGoogle")}
          >
            {googleLoading ? (
              <ActivityIndicator color={theme.accent} />
            ) : (
              <Ionicons name="logo-google" size={22} color={theme.accent} />
            )}
          </Pressable>

          {/* ✅ CHANGED: Apple is now enabled on iOS */}
          {Platform.OS === "ios" && (
            <Pressable
              style={[
                styles.oauthIconButton,
                {
                  backgroundColor: theme.card,
                  borderColor: theme.border,
                  opacity: isBusy ? 0.35 : 1,
                },
              ]}
              onPress={onPressApple}
              disabled={isBusy}
              accessibilityRole="button"
              accessibilityLabel={t("auth.continueWithApple")}
            >
              {appleLoading ? (
                <ActivityIndicator color={theme.accent} />
              ) : (
                <Ionicons
                  name="logo-apple"
                  size={22}
                  color={theme.textPrimary}
                />
              )}
            </Pressable>
          )}

          <Pressable
            style={[
              styles.oauthIconButton,
              {
                backgroundColor: theme.card,
                borderColor: theme.border,
                opacity: 0.35,
              },
            ]}
            disabled
            accessibilityLabel={t("auth.facebookComingSoon")}
          >
            <Ionicons name="logo-facebook" size={22} color={theme.textSecondary} />
          </Pressable>
        </View>
      </View>

      <Text style={[styles.footer, { color: theme.textSecondary }]}>
        {t("auth.alreadyHaveAccount")}{" "}
        <Text
          style={[
            styles.link,
            { color: theme.accent, opacity: isBusy ? 0.45 : 1 },
          ]}
          onPress={isBusy ? undefined : () => router.push("/(auth)/sign-in")}
          accessibilityRole="link"
          accessibilityState={{ disabled: isBusy }}
        >
          {t("auth.logIn")}
        </Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, justifyContent: "center", gap: 10 },
  title: { fontWeight: "700", marginBottom: 16 },
  label: { fontSize: 14, opacity: 0.9 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  button: {
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    marginTop: 8,
  },
  buttonText: { color: "#fff", fontWeight: "700" },

  oauthRowWrap: {
    marginTop: 10,
    gap: 10,
    alignItems: "center",
  },
  oauthLabel: { fontSize: 12, fontWeight: "700", opacity: 0.7 },
  oauthRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  oauthIconButton: {
    width: 48,
    height: 48,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  footer: { marginTop: 16, textAlign: "center" },
  link: { fontWeight: "700" },
});
