// components/AiDataConsentCard.js
//
// The one-time disclosure an account must acknowledge before its first chat
// turn. It replaces the suggestion chips in the empty chat state and is the
// only way forward until it is accepted, so the app can show that permission
// for third-party AI processing was given rather than assumed.
//
// Copy lives in `chat.aiConsent*`; the acknowledgement itself is recorded by
// the caller (see utils/aiDisclosurePolicy.cjs).

import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";

import { PRIVACY_POLICY_URL, openLegalUrl } from "../utils/legalLinks";

export default function AiDataConsentCard({
  onAcknowledge,
  theme,
  fontSize = 16,
}) {
  const { t } = useTranslation();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme?.card,
          borderColor: theme?.border ?? "rgba(0,0,0,0.12)",
        },
      ]}
      accessibilityLabel={t("chat.aiConsentA11y")}
    >
      <Text
        style={[
          styles.title,
          { color: theme?.textPrimary, fontSize: fontSize + 2 },
        ]}
      >
        {t("chat.aiConsentTitle")}
      </Text>

      <Text
        style={[
          styles.body,
          {
            color: theme?.textSecondary,
            fontSize: Math.max(13, fontSize - 1),
          },
        ]}
      >
        {t("chat.aiConsentBody")}
      </Text>

      {PRIVACY_POLICY_URL ? (
        <TouchableOpacity
          onPress={() => void openLegalUrl(PRIVACY_POLICY_URL)}
          accessibilityRole="link"
          accessibilityLabel={t("settings.privacyPolicy")}
          style={styles.link}
        >
          <Text
            style={[
              styles.linkText,
              { color: theme?.accent, fontSize: Math.max(13, fontSize - 1) },
            ]}
          >
            {t("settings.privacyPolicy")}
          </Text>
        </TouchableOpacity>
      ) : null}

      <TouchableOpacity
        onPress={onAcknowledge}
        accessibilityRole="button"
        accessibilityLabel={t("chat.aiConsentAccept")}
        style={[styles.primary, { backgroundColor: theme?.actionButton }]}
      >
        <Text style={[styles.primaryText, { fontSize }]}>
          {t("chat.aiConsentAccept")}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: "stretch",
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    gap: 10,
  },
  title: {
    fontWeight: "700",
    textAlign: "center",
  },
  body: {
    lineHeight: 20,
    textAlign: "center",
  },
  link: {
    alignSelf: "center",
    paddingVertical: 2,
  },
  linkText: {
    fontWeight: "600",
    textDecorationLine: "underline",
  },
  primary: {
    alignItems: "center",
    borderRadius: 10,
    marginTop: 2,
    paddingVertical: 13,
  },
  primaryText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
});
