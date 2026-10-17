import { useContext } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { GlobalContext } from "../context/GlobalContext";

// A failed turn renders as this notice instead of an assistant bubble, so a
// failure reads as a failure rather than a reply, and it carries the retry
// action. Colours come straight from the theme's danger/warning pairs; no new
// palette. See design-plans/chat-failed-turn-card.md.
const TONES = {
  error: { accent: "danger", surface: "dangerBackground", onAccent: null },
  warning: {
    accent: "warning",
    surface: "warningBackground",
    onAccent: "#3A2A14",
  },
};

// The GPT text view has no bubbles, so the notice keeps its rail, icon, title
// and actions but sheds its card chrome — the same way TypingIndicator does in
// MessageList. A translucent wash reads correctly on both transcript
// backgrounds, so it needs no light/dark branch.
const GPT_VIEW_WASH = {
  error: "rgba(229, 57, 53, 0.12)",
  warning: "rgba(255, 152, 0, 0.14)",
};

export default function ChatErrorNotice({
  text,
  tone = "error",
  chatgptStyle = false,
  disabled = false,
  canRetry = true,
  onRetry,
  onDismiss,
}) {
  const { t } = useTranslation();
  const { settings, theme } = useContext(GlobalContext);
  const fontSize = settings?.ux?.fontSize || 16;
  const tokens = TONES[tone] || TONES.error;
  const accent = theme?.[tokens.accent] ?? theme?.danger ?? "#E53935";
  const surface = theme?.[tokens.surface] ?? theme?.dangerBackground ?? "#FFE5E5";
  // theme.background is the app-wide "on action" colour: white in light mode,
  // #111 in dark, matching how the composer paints its send icon.
  const onAccent = tokens.onAccent ?? theme?.background ?? "#FFFFFF";
  const titleSize = Math.max(12, fontSize - 3);
  const bodySize = Math.max(12, fontSize - 2);
  const bodyLineHeight = Math.round(bodySize * 1.4);

  return (
    <View
      accessibilityRole="alert"
      style={
        chatgptStyle
          ? [
              styles.notice,
              styles.noticeChatgpt,
              {
                backgroundColor:
                  GPT_VIEW_WASH[tone] ?? GPT_VIEW_WASH.error,
                borderLeftColor: accent,
              },
            ]
          : [
              styles.notice,
              {
                backgroundColor: surface,
                borderColor: accent,
                borderLeftColor: accent,
              },
            ]
      }
    >
      <View style={styles.iconWrap}>
        <Ionicons name="alert-circle" size={20} color={accent} />
      </View>

      <View style={styles.body}>
        {/*
          The title stays in the theme's text colour: the tone colours are too
          light to read against their own tinted surface (danger is ~3.5:1 and
          warning ~1.9:1 at this size). The accent still carries the notice
          through the rail, the icon, and the primary action.
        */}
        <Text
          style={[
            styles.title,
            { color: theme?.textPrimary, fontSize: titleSize },
          ]}
        >
          {t("chat.errorNotice.title")}
        </Text>

        <Text
          style={[
            styles.detail,
            {
              color: theme?.textPrimary,
              fontSize: bodySize,
              lineHeight: bodyLineHeight,
            },
          ]}
        >
          {text}
        </Text>

        <View style={styles.actions}>
          {canRetry ? (
            <TouchableOpacity
              onPress={onRetry}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel={t("common.retry")}
              accessibilityState={{ disabled }}
              style={[
                styles.retryButton,
                { backgroundColor: accent },
                disabled ? styles.buttonDisabled : null,
              ]}
            >
              <Ionicons name="refresh" size={15} color={onAccent} />
              <Text
                style={[
                  styles.retryLabel,
                  { color: onAccent, fontSize: bodySize },
                ]}
              >
                {t("common.retry")}
              </Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            onPress={onDismiss}
            accessibilityRole="button"
            accessibilityLabel={t("chat.errorNotice.dismiss")}
            style={styles.dismissButton}
          >
            <Text
              style={[
                styles.dismissLabel,
                { color: theme?.textSecondary, fontSize: bodySize },
              ]}
            >
              {t("chat.errorNotice.dismiss")}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: 10,
    maxWidth: "94%",
    paddingLeft: 12,
    paddingRight: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderLeftWidth: 4,
    borderRadius: 14,
  },
  noticeChatgpt: {
    alignSelf: "stretch",
    maxWidth: "100%",
    paddingRight: 0,
    paddingVertical: 2,
    borderWidth: 0,
    borderLeftWidth: 3,
    borderRadius: 0,
  },
  iconWrap: {
    flexShrink: 0,
    marginTop: 1,
  },
  body: {
    flexShrink: 1,
  },
  title: {
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  detail: {
    marginTop: 4,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
  },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  retryLabel: {
    fontWeight: "700",
  },
  dismissButton: {
    height: 36,
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  dismissLabel: {
    fontWeight: "700",
  },
});
