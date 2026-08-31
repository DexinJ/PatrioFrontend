// components/ChatMessageActionsMenu.js
// iOS-only custom actions menu for chat message text (Copy / Select All /
// Share). Replaces the native copy-only context menu on iOS; Android keeps
// its native text selection.

import { Ionicons } from "@expo/vector-icons";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  copyTextToClipboard,
  shareChatText,
} from "../utils/chatTextActions";

export function useChatMessageActions() {
  const [target, setTarget] = useState(null);
  const [selectionMode, setSelectionMode] = useState(false);

  const openFor = useCallback((message) => {
    const text = String(message?.text ?? "").trim();
    if (!message?.id || !text) return;
    setTarget({ id: message.id, text });
    setSelectionMode(false);
  }, []);

  const dismiss = useCallback(() => {
    setTarget(null);
    setSelectionMode(false);
  }, []);

  const selectAll = useCallback(() => setSelectionMode(true), []);

  const copy = useCallback(async () => {
    const text = target?.text;
    dismiss();
    if (text) await copyTextToClipboard(text);
  }, [target, dismiss]);

  const share = useCallback(async () => {
    const text = target?.text;
    dismiss();
    if (text) await shareChatText(text);
  }, [target, dismiss]);

  return {
    target,
    selectionMode,
    selectedId: target?.id ?? null,
    openFor,
    dismiss,
    selectAll,
    copy,
    share,
  };
}

function MenuRow({ icon, label, onPress, danger = false, theme, fontSize }) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {icon ? (
        <Ionicons
          name={icon}
          size={fontSize * 1.15}
          color={danger ? theme?.danger : theme?.textPrimary}
        />
      ) : null}
      <Text
        style={[
          styles.rowText,
          {
            color: danger ? theme?.danger : theme?.textPrimary,
            fontSize,
          },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export default function ChatMessageActionsMenu({
  visible,
  selectionMode = false,
  onCopy,
  onSelectAll,
  onShare,
  onDismiss,
  theme,
  fontSize = 16,
}) {
  const { t } = useTranslation();
  const title = selectionMode
    ? t("chatActions.selected")
    : t("chatActions.title");

  return (
    <Modal
      transparent
      animationType="none"
      visible={!!visible}
      onRequestClose={onDismiss}
      statusBarTranslucent
      accessibilityViewIsModal
    >
      <Pressable style={styles.overlay} onPress={onDismiss} accessible={false}>
        <Pressable
          style={[styles.sheet, { backgroundColor: theme?.card }]}
          onPress={() => {}}
          accessibilityViewIsModal
          accessibilityRole="menu"
          accessibilityLabel={title}
        >
          <View
            style={[styles.header, { borderBottomColor: theme?.border }]}
          >
            <Text
              accessibilityRole="header"
              style={[
                styles.title,
                { color: theme?.textPrimary, fontSize: fontSize * 1.05 },
              ]}
            >
              {title}
            </Text>
            <TouchableOpacity
              onPress={onDismiss}
              style={styles.closeBtn}
              accessibilityRole="button"
              accessibilityLabel={t("common.close")}
            >
              <Ionicons
                name="close"
                size={fontSize * 1.2}
                color={theme?.textPrimary}
              />
            </TouchableOpacity>
          </View>

          <MenuRow
            icon="copy-outline"
            label={t("chatActions.copy")}
            onPress={onCopy}
            theme={theme}
            fontSize={fontSize}
          />
          {!selectionMode ? (
            <MenuRow
              icon="checkmark-done-outline"
              label={t("common.selectAll")}
              onPress={onSelectAll}
              theme={theme}
              fontSize={fontSize}
            />
          ) : null}
          <MenuRow
            icon="share-social-outline"
            label={t("chatActions.share")}
            onPress={onShare}
            theme={theme}
            fontSize={fontSize}
          />

          <View
            style={[styles.divider, { backgroundColor: theme?.border }]}
          />
          <MenuRow
            label={t("common.cancel")}
            onPress={onDismiss}
            theme={theme}
            fontSize={fontSize}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  sheet: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingBottom: 22,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  title: {
    fontWeight: "800",
  },
  closeBtn: {
    padding: 6,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowText: {
    fontWeight: "700",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 16,
    marginVertical: 4,
  },
});
