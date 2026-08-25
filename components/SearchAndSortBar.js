import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, TextInput, TouchableOpacity, View } from "react-native";

/**
 * Reusable top search input + sort button.
 */
export default function SearchAndSortBar({
  search,
  onChangeSearch,
  onPressSort,
  theme,
  fontSize = 16,
  placeholder,
  sortIcon = "swap-vertical",
  style,
}) {
  const { t } = useTranslation();
  const resolvedPlaceholder = placeholder || t("common.searchPlaceholder");

  return (
    <View style={[styles.row, style]}>
      <View
        style={[
          styles.searchBox,
          { backgroundColor: theme?.inputBackground, borderColor: theme?.border },
        ]}
      >
        <TextInput
          value={search}
          onChangeText={onChangeSearch}
          placeholder={resolvedPlaceholder}
          placeholderTextColor={theme?.textPlaceholder}
          style={[styles.input, { fontSize, color: theme?.inputText }]}
          returnKeyType="search"
          accessibilityLabel={resolvedPlaceholder}
        />
      </View>

      <TouchableOpacity
        style={[
          styles.sortBtn,
          { backgroundColor: theme?.inputBackground, borderColor: theme?.border },
        ]}
        onPress={onPressSort}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={t("searchSort.changeSortOrder")}
      >
        <Ionicons name={sortIcon} size={fontSize * 1.2} color={theme?.textPrimary} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  searchBox: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  input: { padding: 0, margin: 0 },
  sortBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
