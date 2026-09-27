import React from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import Popover from "react-native-popover-view";
import ActionTile from "./ActionTile";

const GRID_TILE_WIDTH = 80;
const GRID_GAP = 10;
const MENU_PADDING = 12;
// react-native-popover-view applies a 10px margin on the non-arrow sides.
const POPOVER_MARGIN = 10;
const HORIZONTAL_CHROME = MENU_PADDING * 2 + POPOVER_MARGIN * 2;

/**
 * Reusable grid popover for context actions (long-press menus).
 *
 * actions: Array of
 * {
 *   key: string,
 *   icon: string,
 *   label: string,
 *   onPress: () => void,
 *   danger?: boolean,
 *   disabled?: boolean,
 * }
 */
export default function ActionGridPopover({
  visible,
  fromRect,
  onRequestClose,
  onCloseComplete,
  actions = [],
  theme,
  placement = "top",
  backdrop = "rgba(0,0,0,0.25)",
  borderRadius = 14,
}) {
  const cardBg = theme?.card ?? "#fff";
  const { width: windowWidth } = useWindowDimensions();

  const desiredWidth =
    actions.length > 0
      ? actions.length * GRID_TILE_WIDTH + (actions.length - 1) * GRID_GAP
      : 0;
  const gridWidth =
    actions.length > 0
      ? Math.min(desiredWidth, Math.max(0, windowWidth - HORIZONTAL_CHROME))
      : 0;

  return (
    <Popover
      isVisible={!!visible && !!fromRect}
      from={fromRect}
      placement={placement}
      popoverStyle={{ backgroundColor: cardBg, borderRadius }}
      backgroundStyle={{ backgroundColor: backdrop }}
      onRequestClose={onRequestClose}
      onCloseComplete={onCloseComplete}
    >
      <View style={[styles.menu, { backgroundColor: cardBg, borderRadius }]}>
        <View
          style={[
            styles.grid,
            actions.length > 0 && gridWidth > 0 && { width: gridWidth },
          ]}
        >
          {actions.map((a) => (
            <ActionTile
              key={a.key}
              icon={a.icon}
              label={a.label}
              danger={!!a.danger}
              disabled={!!a.disabled}
              onPress={a.onPress}
              tint={theme?.textPrimary ?? "#333"}
              dangerTint={theme?.danger ?? "#ff4d4f"}
            />
          ))}
        </View>
      </View>
    </Popover>
  );
}

const styles = StyleSheet.create({
  menu: {
    padding: 12,
    minHeight: 76,
  },
  grid: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
});
