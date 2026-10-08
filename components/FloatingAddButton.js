import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, TouchableOpacity } from "react-native";
import TutorialTarget from "./TutorialTarget";

/**
 * Reusable floating action button (FAB).
 *
 * `tutorialTargetId` registers the button with the per-tab tutorial overlay;
 * the absolutely positioned wrapper carries the offset so the FAB still sits
 * in the same corner while staying measurable.
 */
export default function FloatingAddButton({
  onPress,
  disabled = false,
  theme,
  icon = "add",
  size = 28,
  style,
  testID,
  accessibilityLabel,
  tutorialTargetId,
}) {
  return (
    <TutorialTarget id={tutorialTargetId} style={[styles.fabWrap, style]}>
      <TouchableOpacity
        testID={testID}
        style={[
          styles.fab,
          {
            backgroundColor: theme?.actionButton ?? "#4CAF50",
            opacity: disabled ? 0.35 : 1,
          },
        ]}
        onPress={disabled ? undefined : onPress}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled }}
      >
        <Ionicons name={icon} size={size} color="#fff" />
      </TouchableOpacity>
    </TutorialTarget>
  );
}

const styles = StyleSheet.create({
  fabWrap: {
    position: "absolute",
    bottom: 30,
    right: 20,
  },
  fab: {
    borderRadius: 30,
    padding: 15,
    elevation: 4,
    alignItems: "center",
    justifyContent: "center",
  },
});
