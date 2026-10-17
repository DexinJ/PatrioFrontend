// app/(auth)/forgot-password.js
// Password recovery. The confirmation is identical whether or not the address
// belongs to an account, so this screen never reveals who has one. Transport
// failures are the exception: an offline user must not be told to check an
// inbox that will stay empty.

import { useRouter } from "expo-router";
import { sendPasswordResetEmail } from "firebase/auth";
import React, { useContext, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { auth } from "../../auth/firebaseClient";
import { formatAuthErrorMessage } from "../../auth/authErrorMessages";
import { GlobalContext } from "../../context/GlobalContext";
import { attemptAuthEmailSend } from "../../utils/authEmailSend";
import {
  EMAIL_VERIFICATION_RESEND_COOLDOWN_MS,
  isValidEmailAddress,
} from "../../utils/emailVerificationPolicy";

// Codes that reveal whether an account exists. These keep the same
// confirmation the success path shows.
const RESET_MASKED_CODES = new Set([
  "auth/user-not-found",
  "auth/invalid-email",
  "auth/missing-email",
]);

export default function ForgotPasswordScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { theme, settings } = useContext(GlobalContext);
  const fontSize = settings?.ux?.fontSize || 16;

  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const lastSentAtRef = useRef(0);

  const goBack = () => {
    if (router.canGoBack?.()) router.back();
    else router.replace("/(auth)/sign-in");
  };

  const submit = async () => {
    const normalized = email.trim();

    if (!isValidEmailAddress(normalized)) {
      setError(t("auth.errorInvalidEmail"));
      return;
    }
    if (busy) return;
    if (
      lastSentAtRef.current &&
      Date.now() - lastSentAtRef.current <
        EMAIL_VERIFICATION_RESEND_COOLDOWN_MS
    ) {
      setError(t("auth.errorTooManyRequests"));
      return;
    }

    setBusy(true);
    setError("");
    try {
      const result = await attemptAuthEmailSend({
        scope: "password-reset",
        send: () => sendPasswordResetEmail(auth, normalized),
      });
      if (result.ok || RESET_MASKED_CODES.has(result.code)) {
        // Enumeration protection: an address with no account, or one Firebase
        // will not even look at, must stay indistinguishable from a real one.
        // Every other rejection is a request that never left, and the user is
        // told so instead of being sent to an empty inbox.
        lastSentAtRef.current = Date.now();
        setSent(true);
        return;
      }
      setError(
        formatAuthErrorMessage(t(result.messageKey), result.code, {
          isDev: __DEV__,
        })
      );
    } finally {
      setBusy(false);
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
        {sent
          ? t("auth.forgotPasswordSentTitle")
          : t("auth.forgotPasswordTitle")}
      </Text>

      <Text style={[styles.body, { color: theme.textSecondary, fontSize }]}>
        {sent
          ? t("auth.forgotPasswordSentMessage", { email: email.trim() })
          : t("auth.forgotPasswordBody")}
      </Text>

      {sent ? null : (
        <>
          <Text style={[styles.label, { color: theme.textSecondary }]}>
            {t("auth.email")}
          </Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            editable={!busy}
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

          {error ? (
            <Text
              accessibilityRole="alert"
              style={[styles.error, { color: theme.danger, fontSize }]}
            >
              {error}
            </Text>
          ) : null}

          <Pressable
            style={[
              styles.button,
              { backgroundColor: theme.actionButton, opacity: busy ? 0.6 : 1 },
            ]}
            onPress={busy ? undefined : submit}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={t("auth.forgotPasswordSend")}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={[styles.buttonText, { fontSize }]}>
                {t("auth.forgotPasswordSend")}
              </Text>
            )}
          </Pressable>
        </>
      )}

      <Text style={[styles.footer, { color: theme.textSecondary }]}>
        <Text
          style={[styles.link, { color: theme.accent }]}
          onPress={busy ? undefined : goBack}
          accessibilityRole="link"
        >
          {sent
            ? t("auth.forgotPasswordBackToSignIn")
            : t("common.cancel")}
        </Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, justifyContent: "center", gap: 10 },
  title: { fontWeight: "700", marginBottom: 8 },
  body: { lineHeight: 22, marginBottom: 8 },
  label: { fontSize: 14, opacity: 0.9 },
  input: { borderWidth: 1, borderRadius: 12, padding: 12 },
  error: { marginTop: 4, lineHeight: 20 },
  button: {
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    marginTop: 8,
  },
  buttonText: { color: "#fff", fontWeight: "700" },
  footer: { marginTop: 16, textAlign: "center" },
  link: { fontWeight: "700" },
});
