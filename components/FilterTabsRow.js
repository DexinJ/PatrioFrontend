import React from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, StyleSheet, Text, TouchableOpacity } from "react-native";

/**
 * Reusable horizontal tabs row (pill buttons).
 *
 * tabs: [{ key, label, count? }]
 */
export default function FilterTabsRow({
  tabs = [],
  activeKey,
  onChange,
  theme,
  fontSize = 16,
  style,
}) {
  const { t } = useTranslation();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.content}
      style={style}
    >
      {tabs.map((tab) => {
        const selected = tab.key === activeKey;
        return (
          <TouchableOpacity
            key={tab.key}
            style={[
              styles.pill,
              {
                backgroundColor: selected ? theme?.card : "transparent",
                borderColor: theme?.border,
              },
            ]}
            onPress={() => onChange?.(tab.key)}
            activeOpacity={0.85}
            accessibilityRole="tab"
            accessibilityLabel={
              typeof tab.count === "number"
                ? t("filterTabs.tabA11y", {
                    label: tab.label,
                    count: tab.count,
                  })
                : tab.label
            }
            accessibilityState={{ selected }}
          >
            <Text
              style={{
                fontSize: fontSize * 0.9,
                fontWeight: selected ? "700" : "600",
                color: selected ? theme?.textPrimary : theme?.textSecondary,
              }}
            >
              {tab.label}
              {typeof tab.count === "number" ? ` ${tab.count}` : ""}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    alignItems: "center",
    paddingRight: 6,
    gap: 8,
  },
  pill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
});
