import { Ionicons } from "@expo/vector-icons";
import i18next from "i18next";
import { useContext, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Animated,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import ActionGridPopover from "./ActionGridPopover";
import { GlobalContext } from "../context/GlobalContext";

const ARCHIVED_HEADER_KEY = "__archived_header__";

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

function isArchivedItem(item) {
  return item?.status === "archived" || Boolean(item?.archivedAt);
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
  onArchive,
  onRestore,
  onDelete,
}) {
  const { t } = useTranslation();
  const { theme } = useContext(GlobalContext);
  const insets = useSafeAreaInsets();
  const rowRefs = useRef(new Map());
  const [addButtonScale] = useState(() => new Animated.Value(1));
  const [addButtonRotate] = useState(() => new Animated.Value(0));
  const [newChatRowScale] = useState(() => new Animated.Value(1));
  const [showArchived, setShowArchived] = useState(false);
  const [menuTarget, setMenuTarget] = useState(null);

  const activeItems = useMemo(
    () =>
      (Array.isArray(conversations) ? conversations : []).filter(
        (item) => !isArchivedItem(item)
      ),
    [conversations]
  );
  const archivedItems = useMemo(
    () =>
      (Array.isArray(conversations) ? conversations : []).filter((item) =>
        isArchivedItem(item)
      ),
    [conversations]
  );

  const listData = useMemo(() => {
    if (archivedItems.length === 0) return activeItems;
    return [
      ...activeItems,
      { id: ARCHIVED_HEADER_KEY, __archivedHeader: true },
      ...(showArchived ? archivedItems : []),
    ];
  }, [activeItems, archivedItems, showArchived]);

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

  const openRowMenu = (item) => {
    const node = rowRefs.current.get(item.id);
    if (!node || typeof node.measureInWindow !== "function") return;
    node.measureInWindow((x, y, width, height) => {
      setMenuTarget({
        id: item.id,
        title: item.title || t("tabs.chat"),
        archived: isArchivedItem(item),
        rect: { x, y, width, height },
      });
    });
  };

  const closeMenu = () => setMenuTarget(null);

  const handleClose = () => {
    setMenuTarget(null);
    onClose?.();
  };

  const confirmDelete = (item) => {
    const title = item.title || t("tabs.chat");
    Alert.alert(
      t("conversations.deleteChatTitle"),
      t("conversations.deleteChatBody", { title }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("conversations.deleteChat"),
          style: "destructive",
          onPress: () => onDelete?.(item.id),
        },
      ]
    );
  };

  const handleMenuAction = (action) => {
    if (!menuTarget) return;
    const itemId = menuTarget.id;
    const title = menuTarget.title;
    closeMenu();
    if (action === "archive") onArchive?.(itemId);
    else if (action === "restore") onRestore?.(itemId);
    else if (action === "delete") {
      confirmDelete({ id: itemId, title });
    }
  };

  const menuActions = menuTarget
    ? menuTarget.archived
      ? [
          {
            key: "restore",
            icon: "refresh",
            label: t("conversations.restoreChat"),
            onPress: () => handleMenuAction("restore"),
          },
          {
            key: "delete",
            icon: "trash-outline",
            label: t("conversations.deleteChat"),
            danger: true,
            onPress: () => handleMenuAction("delete"),
          },
        ]
      : [
          {
            key: "archive",
            icon: "archive-outline",
            label: t("conversations.archiveChat"),
            onPress: () => handleMenuAction("archive"),
          },
          {
            key: "delete",
            icon: "trash-outline",
            label: t("conversations.deleteChat"),
            danger: true,
            onPress: () => handleMenuAction("delete"),
          },
        ]
    : [];

  const renderConversationRow = (item, archived) => {
    const isActive = item.id === activeConversationId && !archived;
    const rowTitle = item.title || t("tabs.chat");
    const metaTime = archived
      ? item.archivedAt || item.updatedAt || item.createdAt
      : item.updatedAt || item.createdAt;

    return (
      <View
        collapsable={false}
        ref={(node) => {
          if (node) rowRefs.current.set(item.id, node);
          else rowRefs.current.delete(item.id);
        }}
        style={[
          styles.rowWrap,
          isActive && { backgroundColor: theme.inputBackground },
        ]}
      >
        <TouchableOpacity
          onPress={() => onSelect?.(item.id)}
          activeOpacity={0.72}
          accessibilityRole="button"
          accessibilityLabel={t("conversations.openConversation", {
            title: rowTitle,
          })}
          accessibilityState={{ selected: isActive }}
          style={styles.rowTouch}
        >
          <View style={styles.rowBody}>
            <Text
              style={[
                styles.rowTitle,
                {
                  color: isActive ? theme.accent : theme.textPrimary,
                  opacity: archived ? 0.78 : 1,
                },
              ]}
              numberOfLines={1}
            >
              {rowTitle}
            </Text>
            <Text
              style={[styles.rowMeta, { color: theme.textSecondary }]}
              numberOfLines={1}
            >
              {formatRelativeTime(metaTime)}
            </Text>
          </View>
          {isActive ? (
            <Ionicons name="checkmark-circle" size={20} color={theme.accent} />
          ) : null}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => openRowMenu(item)}
          hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={t("conversations.rowActions", {
            title: rowTitle,
          })}
          style={styles.rowMenuButton}
        >
          <Ionicons
            name="ellipsis-horizontal"
            size={19}
            color={theme.textSecondary}
          />
        </TouchableOpacity>
      </View>
    );
  };

  const renderRow = ({ item }) => {
    if (item.__archivedHeader) {
      const count = archivedItems.length;
      return (
        <Pressable
          onPress={() => setShowArchived((previous) => !previous)}
          accessibilityRole="button"
          accessibilityLabel={t(
            showArchived ? "conversations.hideArchived" : "conversations.openArchived"
          )}
          style={styles.archivedHeader}
        >
          <Ionicons
            name="archive-outline"
            size={16}
            color={theme.textSecondary}
          />
          <Text
            style={[styles.archivedHeaderText, { color: theme.textSecondary }]}
          >
            {t("conversations.archivedSection", { count })}
          </Text>
          <Ionicons
            name={showArchived ? "chevron-up" : "chevron-down"}
            size={16}
            color={theme.textSecondary}
          />
        </Pressable>
      );
    }
    return renderConversationRow(item, isArchivedItem(item));
  };

  const hasAnyConversations = activeItems.length > 0 || archivedItems.length > 0;

  return (
    <>
      <Animated.View
        pointerEvents={drawerPointerEvents}
        style={StyleSheet.absoluteFill}
      >
        <Pressable
          style={styles.backdropTouch}
          onPress={handleClose}
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
            style={[
              styles.newChatRowInner,
              { transform: [{ scale: newChatRowScale }] },
            ]}
          >
            <Ionicons name="create-outline" size={20} color={theme.accent} />
            <Text style={[styles.newChatText, { color: theme.accent }]}>
              {t("conversations.newChat")}
            </Text>
          </Animated.View>
        </TouchableOpacity>

        {!hasAnyConversations ? (
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            {t("conversations.noConversations")}
          </Text>
        ) : (
          <FlatList
            data={listData}
            keyExtractor={(item) =>
              item.__archivedHeader ? ARCHIVED_HEADER_KEY : String(item.id)
            }
            renderItem={renderRow}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
          />
        )}
      </Animated.View>

      <ActionGridPopover
        visible={Boolean(menuTarget)}
        fromRect={menuTarget?.rect}
        onRequestClose={closeMenu}
        onCloseComplete={closeMenu}
        actions={menuActions}
        theme={theme}
        placement="bottom"
      />
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
  rowWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 2,
    borderRadius: 10,
    marginHorizontal: 10,
    marginVertical: 2,
  },
  rowTouch: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 11,
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
  rowMenuButton: {
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  archivedHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    marginTop: 6,
  },
  archivedHeaderText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
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
