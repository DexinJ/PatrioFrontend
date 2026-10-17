import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import {
  PRIVACY_POLICY_URL,
  TERMS_OF_USE_URL,
  openLegalUrl,
} from "../utils/legalLinks";

// `colors` is passed in rather than read from GlobalContext so the same row can
// render on the sign-up screen (themed) and on the acceptance gate, which
// renders above the theme provider.
export default function TermsAcceptanceRow({
  checked,
  onToggle,
  colors,
  fontSize,
  disabled = false,
}) {
  const { t } = useTranslation();

  // The 《》 brackets around the linked text are locale-specific, which is why
  // each label goes through its own key instead of being concatenated here.
  const legalLink = (name) => t("auth.legalLinkLabel", { name });

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{
          checked: Boolean(checked),
          disabled: Boolean(disabled),
        }}
        accessibilityLabel={t("auth.termsAgreementA11y")}
        onPress={disabled ? undefined : () => onToggle(!checked)}
        hitSlop={10}
        style={[
          styles.box,
          {
            borderColor: colors.border,
            backgroundColor: checked ? colors.accent : "transparent",
            opacity: disabled ? 0.5 : 1,
          },
        ]}
      >
        {checked ? (
          <Text style={[styles.tick, { color: colors.tick }]}>✓</Text>
        ) : null}
      </Pressable>

      <Text style={[styles.label, { color: colors.text, fontSize }]}>
        {t("auth.termsAgreementPrefix")}
        <Text
          accessibilityRole="link"
          style={[styles.link, { color: colors.link }]}
          onPress={() => void openLegalUrl(TERMS_OF_USE_URL)}
        >
          {legalLink(t("settings.termsOfUse"))}
        </Text>
        {t("auth.termsAgreementMiddle")}
        <Text
          accessibilityRole="link"
          style={[styles.link, { color: colors.link }]}
          onPress={() => void openLegalUrl(PRIVACY_POLICY_URL)}
        >
          {legalLink(t("settings.privacyPolicy"))}
        </Text>
        {t("auth.termsAgreementSuffix")}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  box: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  tick: { fontSize: 14, fontWeight: "900", lineHeight: 18 },
  label: { flex: 1, lineHeight: 21 },
  link: { fontWeight: "700", textDecorationLine: "underline" },
});
