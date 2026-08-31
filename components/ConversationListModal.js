import { Ionicons } from "@expo/vector-icons";
import i18next from "i18next";
import { useContext, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Animated,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GlobalContext } from "../context/GlobalContext";

function formatRelativeTime(iso) {
  if (!iso) return "";
  const timestamp = Date.parse(iso);
  if (!Number.isFinite(timestamp)) return "";

  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return i18next.t("conversations.justNow");

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return i18next.t("conversations.minutesAgo", { count: minutes });

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return i18next.t("conversations.hoursAgo", { count: hours });

  const days = Math.floor(hours / 24);
  if (days < 7) return i18next.t("conversations.daysAgo", { count: days });

  return new Date(timestamp).toLocaleDateString();
}

export default function ConversationDrawer({
  progress,
  open,
  drawerWidth,
  onClose,
  conversations = [],
  activeConversationId = null,
  onSelect,
  onNewChat,
}) {
  const { t } = useTranslation();
  const { theme } = useContext(GlobalContext);
  const insets = useSafeAreaInsets();
  const [addButtonScale] = useState(() => new Animated.Value(1));
  const [addButtonRotate] = useState(() => new Animated.Value(0));
  const [newChatRowScale] = useState(() => new Animated.Value(1));
  const items = useMemo(
    () => (Array.isArray(conversations) ? conversations : []),
    [conversations]
  );

  const animateAddButton = (pressed) => {
    Animated.parallel([
      Animated.spring(addButtonScale, {
        toValue: pressed ? 0.82 : 1,
        speed: pressed ? 40 : 18,
        bounciness: pressed ? 0 : 10,
        useNativeDriver: true,
      }),
      Animated.spring(addButtonRotate, {
        toValue: pressed ? 1 : 0,
        speed: pressed ? 40 : 18,
        bounciness: pressed ? 0 : 10,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const animateNewChatRow = (pressed) => {
    Animated.spring(newChatRowScale, {
      toValue: pressed ? 0.97 : 1,
      speed: pressed ? 40 : 18,
      bounciness: pressed ? 0 : 10,
      useNativeDriver: true,
    }).start();
  };

  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-drawerWidth, 0],
  });
  const drawerPointerEvents = open ? "auto" : "none";

  const renderRow = ({ item }) => {
    const isActive = item.id === activeConversationId;
    return (
      <TouchableOpacity
        onPress={() => onSelect?.(item.id)}
        accessibilityRole="button"
        accessibilityLabel={t("conversations.openConversation", {
          title: item.title || t("tabs.chat"),
        })}
        accessibilityState={{ selected: isActive }}
        style={[
          styles.row,
          isActive && { backgroundColor: theme.inputBackground },
        ]}
      >
        <View style={styles.rowBody}>
          <Text
            style={[
              styles.rowTitle,
              { color: isActive ? theme.accent : theme.textPrimary },
            ]}
            numberOfLines={1}
          >
            {item.title || t("tabs.chat")}
          </Text>
          <Text style={[styles.rowMeta, { color: theme.textSecondary }]}>
            {formatRelativeTime(item.updatedAt || item.createdAt)}
          </Text>
        </View>
        {isActive ? (
          <Ionicons name="checkmark-circle" size={20} color={theme.accent} />
        ) : null}
      </TouchableOpacity>
    );
  };

  return (
    <>
      <Animated.View
        pointerEvents={drawerPointerEvents}
        style={StyleSheet.absoluteFill}
      >
        <Pressable
          style={styles.backdropTouch}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t("conversations.closeConversations")}
        />
      </Animated.View>

      <Animated.View
        pointerEvents={drawerPointerEvents}
        style={[
          styles.drawer,
          {
            width: drawerWidth,
            backgroundColor: theme.card,
            paddingTop: insets.top + 8,
            paddingBottom: insets.bottom + 12,
            transform: [{ translateX }],
          },
        ]}
      >
        <View style={styles.drawerHeader}>
          <Text style={[styles.drawerTitle, { color: theme.textPrimary }]}>
            {t("conversations.chats")}
          </Text>
          <TouchableOpacity
            onPress={onNewChat}
            onPressIn={() => animateAddButton(true)}
            onPressOut={() => animateAddButton(false)}
            accessibilityRole="button"
            accessibilityLabel={t("conversations.newChat")}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Animated.View
              style={{
                transform: [
                  { scale: addButtonScale },
                  {
                    rotate: addButtonRotate.interpolate({
                      inputRange: [0, 1],
                      outputRange: ["0deg", "45deg"],
                    }),
                  },
                ],
              }}
            >
              <Ionicons name="add" size={26} color={theme.accent} />
            </Animated.View>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          onPress={onNewChat}
          onPressIn={() => animateNewChatRow(true)}
          onPressOut={() => animateNewChatRow(false)}
          accessibilityRole="button"
          accessibilityLabel={t("conversations.startNewChat")}
          style={[
            styles.newChatRow,
            { backgroundColor: theme.inputBackground },
          ]}
        >
          <Animated.View
            style={[styles.newChatRowInner, { transform: [{ scale: newChatRowScale }] }]}
          >
            <Ionicons name="create-outline" size={20} color={theme.accent} />
            <Text style={[styles.newChatText, { color: theme.accent }]}>
              {t("conversations.newChat")}
            </Text>
          </Animated.View>
        </TouchableOpacity>

        {items.length === 0 ? (
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            {t("conversations.noConversations")}
          </Text>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderRow}
            style={styles.list}
            contentContainerStyle={styles.listContent}
          />
        )}
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  backdropTouch: {
    flex: 1,
  },
  drawer: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 2, height: 0 },
    elevation: 12,
  },
  drawerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  drawerTitle: {
    fontSize: 22,
    fontWeight: "700",
  },
  newChatRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 10,
  },
  newChatRowInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  newChatText: {
    fontSize: 15,
    fontWeight: "600",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderRadius: 10,
    marginHorizontal: 10,
    marginVertical: 2,
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: "600",
  },
  rowMeta: {
    fontSize: 12,
  },
  emptyText: {
    textAlign: "center",
    marginTop: 28,
    fontSize: 14,
  },
  list: {
    flex: 1,
    marginTop: 6,
  },
  listContent: {
    paddingBottom: 12,
  },
});
