import { Ionicons } from "@expo/vector-icons";
import React, { memo, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { translateTagLabel } from "../utils/tagTranslation";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

/**
 * Reusable list item card for inventory-like items.
 * Works for fridge, pantry, shopping (with props controlling behavior).
 *
 * Expected item fields (flexible):
 * - id, name, quantity
 * - _expired, _almostExpired, _expiresAtMs, _daysUntilExpire
 * - _storageLabel, _stateLabel, _foodTypeLabel
 *
 * You can also pass your own computed strings:
 * - subtitleText
 * - metaText
 * - rightTopText
 */
function InventoryListItem({
  item,
  theme,
  fontSize = 16,

  // selection/edit mode
  editMode = false,
  selected = false,
  onToggleSelect,
  onPress,

  // long press / measurement
  onMeasuredLongPress, // receives (rect, item)
  longPressDelayMs = 200,

  // optional overrides
  subtitleText,
  metaText,
  rightTopText,
  rightBottomText,
}) {
  const { t } = useTranslation();
  const rowRef = useRef(null);

  const isExpired = !!item?._expired;
  const isAlmost = !!item?._almostExpired;

  const computedMeta = useMemo(() => {
    const meta = [
      translateTagLabel(item?._stateLabel, "state"),
      translateTagLabel(item?._storageLabel, "storage"),
    ]
      .filter(Boolean)
      .join(" • ");
    return meta;
  }, [item?._stateLabel, item?._storageLabel]);

  const computedRightTop = useMemo(
    () => translateTagLabel(item?._foodTypeLabel, "food_type"),
    [item?._foodTypeLabel]
  );

  const computedRightBottom = useMemo(() => String(item?.quantity ?? ""), [item?.quantity]);

  const formatLocalDate = (ms) => {
    if (!Number.isFinite(ms)) return null;
    const d = new Date(ms);
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  };

  const computedSubtitle = useMemo(() => {
    if (subtitleText) return subtitleText;

    if (isExpired) {
      const when = formatLocalDate(item?._expiresAtMs);
      return when ? t("inventoryItem.expiredOn", { date: when }) : t("tags.urgency.expired");
    }
    if (isAlmost) {
      const when = formatLocalDate(item?._expiresAtMs);
      const d = item?._daysUntilExpire;
      if (d === 0)
        return when
          ? t("inventoryItem.expiresTodayDate", { date: when })
          : t("inventoryItem.expiresToday");
      if (d === 1)
        return when
          ? t("inventoryItem.expiresTomorrowDate", { date: when })
          : t("inventoryItem.expiresTomorrow");
      if (typeof d === "number")
        return when
          ? t("inventoryItem.expiresInDays_other", { count: d, date: when })
          : t("inventoryItem.expiresInDaysNoDate_other", { count: d });
      return when
        ? t("inventoryItem.expiresSoon", { date: when })
        : t("inventoryItem.expiresSoonNoDate");
    }

    // fallback: show "Added today" style using createdAt if available
    const createdAtIso = item?.createdAt;
    const createdMs = createdAtIso ? new Date(createdAtIso).getTime() : 0;
    if (!createdMs) return t("inventoryItem.added");
    const created = new Date(createdMs);
    const now = new Date();

    const createdDate = new Date(created.getFullYear(), created.getMonth(), created.getDate());
    const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const diffMs = todayDate - createdDate;
    const days = Math.max(0, Math.round(diffMs / 86400000));

    if (days === 0) return t("inventoryItem.addedToday");
    if (days === 1) return t("inventoryItem.inInventory_one", { count: 1 });
    return t("inventoryItem.inInventory_other", { count: days });
  }, [subtitleText, isExpired, isAlmost, item?._expiresAtMs, item?._daysUntilExpire, item?.createdAt, t]);

  const bg = isExpired ? theme?.dangerBackground : isAlmost ? theme?.warningBackground : theme?.card;
  const border = isExpired ? theme?.danger : isAlmost ? theme?.warning : theme?.border;

  const statusColor = isExpired
    ? theme?.danger
    : isAlmost
    ? theme?.warning
    : theme?.textPrimary;

  const handleLongPress = () => {
    if (editMode) return;
    const node = rowRef.current;
    if (!node || typeof node.measureInWindow !== "function") return;

    node.measureInWindow((x, y, width, height) => {
      onMeasuredLongPress?.({ x, y, width, height }, item);
    });
  };

  const handlePress = () => {
    if (editMode) {
      onToggleSelect?.(item?.id);
      return;
    }
    onPress?.(item);
  };

  return (
    <View collapsable={false} ref={rowRef}>
      <TouchableOpacity
        activeOpacity={0.86}
        delayLongPress={longPressDelayMs}
        onLongPress={handleLongPress}
        onPress={handlePress}
        style={[styles.card, { backgroundColor: bg, borderColor: border }]}
        accessibilityRole={editMode ? "checkbox" : "button"}
        accessibilityLabel={t("inventoryItem.a11yItem", {
          name: item?.name || t("inventoryItem.item"),
          subtitle: computedSubtitle,
          count: computedRightBottom || t("inventoryItem.notSpecified"),
        })}
        accessibilityState={editMode ? { checked: selected } : undefined}
        accessibilityHint={
          editMode ? t("inventoryItem.togglesSelection") : t("inventoryItem.opensActions")
        }
      >
        {editMode && (
          <TouchableOpacity
            onPress={() => onToggleSelect?.(item?.id)}
            activeOpacity={0.8}
            style={styles.checkboxHit}
            accessibilityRole="checkbox"
            accessibilityLabel={t("inventoryItem.a11ySelect", {
              name: item?.name || t("inventoryItem.item"),
            })}
            accessibilityState={{ checked: selected }}
          >
            <Ionicons
              name={selected ? "checkbox" : "square-outline"}
              size={fontSize * 1.25}
              color={selected ? theme?.textPrimary : theme?.textSecondary}
            />
          </TouchableOpacity>
        )}

        <View style={styles.left}>
          <Text
            style={[styles.title, { fontSize: fontSize * 1.06, color: theme?.textPrimary }]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {item?.name}
          </Text>

          <Text
            style={[styles.subtitle, { fontSize: fontSize * 0.92, color: statusColor }]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {computedSubtitle}
          </Text>

          {!!(metaText ?? computedMeta) && (
            <Text
              style={[styles.meta, { fontSize: fontSize * 0.82, color: theme?.textSecondary }]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {metaText ?? computedMeta}
            </Text>
          )}
        </View>

        <View style={styles.right}>
          <Text
            style={[styles.rightTop, { fontSize: fontSize * 0.82, color: theme?.textSecondary }]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {rightTopText ?? computedRightTop}
          </Text>

          <View style={styles.rightBottomWrap}>
            <Text
              style={[styles.rightBottom, { fontSize: fontSize * 0.98, color: theme?.textPrimary }]}
              numberOfLines={1}
            >
              {rightBottomText ?? computedRightBottom}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  checkboxHit: {
    paddingRight: 12,
    paddingVertical: 6,
    alignSelf: "center",
  },
  card: {
    borderWidth: 1,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "stretch",
  },
  left: { flex: 1, minWidth: 0 },
  title: { fontWeight: "800", letterSpacing: 0.2 },
  subtitle: { marginTop: 8, fontWeight: "800" },
  meta: { marginTop: 6, fontWeight: "600" },
  right: {
    marginLeft: 12,
    alignItems: "flex-end",
    justifyContent: "space-between",
    minWidth: 90,
    paddingVertical: 2,
  },
  rightTop: { fontWeight: "700" },
  rightBottomWrap: {
    alignItems: "flex-end",
    justifyContent: "flex-end",
    gap: 8,
  },
  rightBottom: { fontWeight: "900" },
});

export default memo(InventoryListItem);
