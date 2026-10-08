// components/EmailVerificationPrompt.js
// The soft nudge. Three actions, because "resend" alone strands anyone whose
// address is wrong: resend into a mailbox that is not theirs, forever.

import { Ionicons } from "@expo/vector-icons";
import React, { useContext, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useEmailVerification } from "../context/EmailVerificationContext";
import { GlobalContext } from "../context/GlobalContext";
import { suggestEmailCorrection } from "../utils/emailVerificationPolicy";

export default function EmailVerificationPrompt() {
  const { t } = useTranslation();
  const { theme, settings } = useContext(GlobalContext);
  const fontSize = settings?.ux?.fontSize || 16;
  const {
    busy,
    clearError,
    closePrompt,
    dismissPrompt,
    email,
    error,
    passwordRequired,
    promptVisible,
    sendVerification,
    submitEmailChange,
  } = useEmailVerification();

  const [mode, setMode] = useState("nudge");
  const [newEmail, setNewEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [resent, setResent] = useState(false);

  // Reset whenever the modal opens, so a reopen never resumes a stale
  // sub-form. This runs from the Modal's own lifecycle callback rather than an
  // effect, because synchronously setting state in an effect body triggers a
  // cascading render.
  const resetLocalState = () => {
    setMode("nudge");
    setNewEmail("");
    setPassword("");
    setSentTo("");
    setResent(false);
  };

  const suggestion = suggestEmailCorrection(newEmail);
  const canSubmit = !busy && newEmail.trim().length > 0;

  const inputStyle = {
    backgroundColor: theme.inputBackground,
    borderColor: theme.border,
    color: theme.inputText,
    fontSize,
  };

  const onResend = async () => {
    setResent(await sendVerification());
  };

  const onSubmitChange = async () => {
    const target = newEmail.trim();
    if (!target) return;
    if (await submitEmailChange({ newEmail: target, password })) {
      setSentTo(target);
    }
  };

  const openChangeMode = () => {
    clearError();
    setMode("change");
  };

  const backToNudge = () => {
    clearError();
    setMode("nudge");
  };

  return (
    <Modal
      visible={promptVisible}
      animationType="fade"
      transparent
      onShow={resetLocalState}
      // Android requires a function here; a no-op is safer than undefined.
      onRequestClose={busy ? () => {} : closePrompt}
    >
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: theme.card }]}>
          {mode === "nudge" ? (
            <>
              <Ionicons name="mail-outline" size={28} color={theme.accent} />
              <Text
                style={[
                  styles.title,
                  { color: theme.textPrimary, fontSize: fontSize * 1.15 },
                ]}
              >
                {t("auth.verifyEmailTitle")}
              </Text>
              <Text
                style={[styles.body, { color: theme.textSecondary, fontSize }]}
              >
                {t("auth.verifyEmailMessage", { email })}
              </Text>

              {resent ? (
                <Text
                  accessibilityLiveRegion="polite"
                  style={[styles.note, { color: theme.accent, fontSize }]}
                >
                  {t("auth.verifyEmailResent", { email })}
                </Text>
              ) : null}
              {error ? (
                <Text
                  accessibilityRole="alert"
                  style={[styles.note, { color: theme.danger, fontSize }]}
                >
                  {error}
                </Text>
              ) : null}

              <Pressable
                onPress={busy ? undefined : onResend}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={t("auth.verifyEmailResend")}
                style={[
                  styles.primary,
                  {
                    backgroundColor: theme.actionButton,
                    opacity: busy ? 0.6 : 1,
                  },
                ]}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryText}>
                    {t("auth.verifyEmailResend")}
                  </Text>
                )}
              </Pressable>

              <Pressable
                onPress={busy ? undefined : openChangeMode}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={t("auth.verifyEmailWrongAddress")}
                style={[styles.secondary, { borderColor: theme.accent }]}
              >
                <Text style={[styles.secondaryText, { color: theme.accent }]}>
                  {t("auth.verifyEmailWrongAddress")}
                </Text>
              </Pressable>

              <Pressable
                onPress={busy ? undefined : dismissPrompt}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={t("auth.verifyEmailLater")}
              >
                <Text
                  style={[styles.link, { color: theme.textSecondary, fontSize }]}
                >
                  {t("auth.verifyEmailLater")}
                </Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text
                style={[
                  styles.title,
                  { color: theme.textPrimary, fontSize: fontSize * 1.15 },
                ]}
              >
                {t("auth.changeEmailTitle")}
              </Text>

              {sentTo ? (
                <>
                  <Text
                    style={[
                      styles.body,
                      { color: theme.textSecondary, fontSize },
                    ]}
                  >
                    {t("auth.changeEmailSentMessage", { email: sentTo })}
                  </Text>
                  <Pressable
                    onPress={closePrompt}
                    accessibilityRole="button"
                    accessibilityLabel={t("common.close")}
                    style={[
                      styles.primary,
                      { backgroundColor: theme.actionButton },
                    ]}
                  >
                    <Text style={styles.primaryText}>{t("common.close")}</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Text
                    style={[
                      styles.body,
                      { color: theme.textSecondary, fontSize },
                    ]}
                  >
                    {t("auth.changeEmailBody", { email })}
                  </Text>

                  <Text style={[styles.label, { color: theme.textSecondary }]}>
                    {t("auth.changeEmailNewEmail")}
                  </Text>
                  <TextInput
                    value={newEmail}
                    onChangeText={setNewEmail}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    editable={!busy}
                    placeholder={t("auth.emailPlaceholder")}
                    placeholderTextColor={theme.textPlaceholder}
                    style={[styles.input, inputStyle]}
                  />

                  {suggestion ? (
                    <Pressable
                      onPress={() => setNewEmail(suggestion)}
                      accessibilityRole="button"
                      accessibilityLabel={t("auth.emailTypoSuggestion", {
                        email: suggestion,
                      })}
                    >
                      <Text
                        style={[
                          styles.link,
                          { color: theme.accent, fontSize },
                        ]}
                      >
                        {t("auth.emailTypoSuggestion", { email: suggestion })}
                      </Text>
                    </Pressable>
                  ) : null}

                  {passwordRequired ? (
                    <>
                      <Text
                        style={[styles.label, { color: theme.textSecondary }]}
                      >
                        {t("auth.changeEmailPassword")}
                      </Text>
                      <TextInput
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry
                        autoCapitalize="none"
                        editable={!busy}
                        placeholder="••••••••"
                        placeholderTextColor={theme.textPlaceholder}
                        style={[styles.input, inputStyle]}
                      />
                    </>
                  ) : null}

                  {error ? (
                    <Text
                      accessibilityRole="alert"
                      style={[styles.note, { color: theme.danger, fontSize }]}
                    >
                      {error}
                    </Text>
                  ) : null}

                  <Pressable
                    onPress={canSubmit ? onSubmitChange : undefined}
                    disabled={!canSubmit}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !canSubmit }}
                    accessibilityLabel={t("auth.changeEmailSubmit")}
                    style={[
                      styles.primary,
                      {
                        backgroundColor: theme.actionButton,
                        opacity: canSubmit ? 1 : 0.5,
                      },
                    ]}
                  >
                    {busy ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.primaryText}>
                        {t("auth.changeEmailSubmit")}
                      </Text>
                    )}
                  </Pressable>

                  <Pressable
                    onPress={busy ? undefined : backToNudge}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel={t("common.cancel")}
                    style={[styles.secondary, { borderColor: theme.border }]}
                  >
                    <Text
                      style={[
                        styles.secondaryText,
                        { color: theme.textSecondary },
                      ]}
                    >
                      {t("common.cancel")}
                    </Text>
                  </Pressable>
                </>
              )}
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.45)",
    padding: 24,
  },
  card: { borderRadius: 16, padding: 20 },
  title: { fontWeight: "700", marginTop: 10 },
  body: { marginTop: 8, lineHeight: 22 },
  note: { marginTop: 10, lineHeight: 20 },
  label: { marginTop: 14, fontSize: 13, fontWeight: "600" },
  input: { borderWidth: 1, borderRadius: 12, marginTop: 6, padding: 12 },
  primary: { alignItems: "center", borderRadius: 12, marginTop: 18, padding: 14 },
  primaryText: { color: "#fff", fontWeight: "700" },
  secondary: {
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 10,
    padding: 12,
  },
  secondaryText: { fontWeight: "700" },
  link: { marginTop: 14, textAlign: "center", fontWeight: "600" },
});
