import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { acceptTerms } from "../api/termsAcceptance";
import { makeFallbackUsername } from "../api/userProfile";
import { auth } from "../auth/firebaseClient";
import { useAuth } from "../auth/useAuth";
import TermsAcceptanceRow from "./TermsAcceptanceRow";

// Fixed palette on purpose: this renders above SessionBackedGlobalProvider, so
// no theme context is mounted yet. The neighbouring access-recovery screens in
// (tabs)/_layout.js do the same.
const COLORS = {
  background: "#F7F8FA",
  border: "#AEB4BE",
  text: "#1E2229",
  secondary: "#5F6672",
  accent: "#2563EB",
  tick: "#FFFFFF",
  link: "#0A7376",
  danger: "#B3261E",
};

export default function TermsAcceptanceGate({ termsVersion, refreshSession }) {
  const { t } = useTranslation();
  const { signOut } = useAuth();
  const [checked, setChecked] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  const accept = async () => {
    if (working || !checked) return;
    setError("");
    setWorking(true);
    try {
      const user = auth.currentUser;
      if (!user) {
        setError(t("errors.termsAcceptanceFailed"));
        return;
      }

      // The backend rejects usernames under two characters and this screen has
      // no username field, so a one-character display name or email prefix
      // would strand the user here with no way forward. The name is editable
      // later in Settings.
      const rawUsername = makeFallbackUsername(user).trim();
      const username = rawUsername.length >= 2 ? rawUsername : "user";

      await acceptTerms({
        idToken: await user.getIdToken(),
        username,
        timeoutMessage: t("errors.accountSetupTimedOut"),
      });

      // Publishing the session is what unmounts this gate, so a failure here
      // must not clear it.
      await refreshSession({ maxAgeMs: 0 });
    } catch (nextError) {
      setError(
        nextError?.code === "TERMS_ACCEPTANCE_REQUIRED"
          ? t("errors.termsAcceptanceFailed")
          : String(nextError?.message || t("errors.termsAcceptanceFailed"))
      );
    } finally {
      setWorking(false);
    }
  };

  const signOutAndLeave = async () => {
    if (working) return;
    setError("");
    setWorking(true);
    try {
      await signOut();
    } catch (nextError) {
      setError(String(nextError?.message || t("tabsLayout.couldNotLogOut")));
    } finally {
      setWorking(false);
    }
  };

  return (
    <View
      style={[styles.screen, { backgroundColor: COLORS.background }]}
      accessibilityLabel={t("auth.termsScreenTitle")}
    >
      <Text style={[styles.title, { color: COLORS.text }]}>
        {t("auth.termsScreenTitle")}
      </Text>
      <Text style={[styles.body, { color: COLORS.secondary }]}>
        {t("auth.termsScreenBody")}
      </Text>
      {termsVersion ? (
        <Text style={[styles.body, { color: COLORS.secondary }]}>
          {t("auth.termsVersionLabel", { version: termsVersion })}
        </Text>
      ) : null}

      <View style={styles.rowWrap}>
        <TermsAcceptanceRow
          checked={checked}
          onToggle={setChecked}
          colors={COLORS}
          fontSize={15}
          disabled={working}
        />
      </View>

      <Pressable
        onPress={() => void accept()}
        disabled={working || !checked}
        accessibilityRole="button"
        accessibilityLabel={t("auth.termsAcceptAndContinue")}
        style={({ pressed }) => [
          styles.primary,
          {
            backgroundColor: COLORS.accent,
            opacity: working || !checked ? 0.5 : pressed ? 0.75 : 1,
          },
        ]}
      >
        {working ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.primaryText}>
            {t("auth.termsAcceptAndContinue")}
          </Text>
        )}
      </Pressable>

      <Pressable
        onPress={() => void signOutAndLeave()}
        disabled={working}
        accessibilityRole="button"
        accessibilityLabel={t("auth.termsSignOut")}
        style={({ pressed }) => [
          styles.secondary,
          {
            borderColor: COLORS.border,
            opacity: working ? 0.5 : pressed ? 0.75 : 1,
          },
        ]}
      >
        <Text style={[styles.secondaryText, { color: COLORS.text }]}>
          {t("auth.termsSignOut")}
        </Text>
      </Pressable>

      {error ? (
        <Text
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={[styles.error, { color: COLORS.danger }]}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  title: { fontSize: 20, fontWeight: "700", textAlign: "center" },
  body: { marginTop: 10, fontSize: 15, lineHeight: 22, textAlign: "center" },
  rowWrap: { alignSelf: "stretch", marginTop: 20 },
  primary: {
    marginTop: 22,
    minWidth: 200,
    alignItems: "center",
    paddingHorizontal: 22,
    paddingVertical: 13,
    borderRadius: 10,
  },
  primaryText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  secondary: {
    marginTop: 12,
    minWidth: 200,
    alignItems: "center",
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  secondaryText: { fontSize: 16, fontWeight: "700" },
  error: { marginTop: 12, fontSize: 14, lineHeight: 20, textAlign: "center" },
});
