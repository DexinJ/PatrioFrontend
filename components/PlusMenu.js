import { Ionicons } from "@expo/vector-icons";
import React, { useContext, useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { GlobalContext } from "../context/GlobalContext";
import usePhotoCapture from "../hooks/usePhotoCapture";
import TutorialTarget from "./TutorialTarget";

export default function PlusMenu({ onSend, revealOptions = false }) {
  const { t } = useTranslation();
  const { settings, theme } = useContext(GlobalContext);
  const fontSize = settings?.ux?.fontSize || 16;
  const [menuOpen, setMenuOpen] = useState(false);
  const { busy, takePhoto, pickPhoto } = usePhotoCapture({
    onCapture: onSend,
    onFinished: () => setMenuOpen(false),
  });

  // The tour cannot tap the button, so it forces the options open instead
  // (see shouldRevealMenu). The user's own toggle is left untouched.
  const menuVisible = menuOpen || revealOptions;

  return (
    <View>
      {/* Floating + button */}
        <TouchableOpacity
        style={[
            styles.plusButton,
            {
            padding: fontSize * 0.6,
            backgroundColor: theme.actionButton, // ✅ use from theme
            },
        ]}
        onPress={() => setMenuOpen((open) => !open)}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={
          menuVisible ? t("plusMenu.closeMenu") : t("plusMenu.addPhoto")
        }
        accessibilityState={{ disabled: busy, expanded: menuVisible }}
        >
        <Ionicons
            name="add"
            size={fontSize * 1.2}
            color="#fff" // always white for contrast
        />
        </TouchableOpacity>

      {/* Dropdown menu */}
      {menuVisible && (
        <TutorialTarget
          id="chat.attachOptions"
          style={[
            styles.menu,
            { backgroundColor: theme.card, minWidth: Math.max(fontSize * 10, 140) },
          ]}
        >
          <TouchableOpacity
            style={[
              styles.menuItem,
              {
                paddingVertical: fontSize * 0.6,
                paddingHorizontal: fontSize * 0.5,
                backgroundColor: theme.background,
              },
            ]}
            onPress={takePhoto}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={t("plusMenu.takeAPhoto")}
            accessibilityState={{ disabled: busy }}
          >
            <Ionicons name="camera" size={fontSize} color={theme.textPrimary} />
            <Text style={[styles.menuText, { fontSize, color: theme.textPrimary }]} numberOfLines={1}>
              {t("plusMenu.takeAPhoto")}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.menuItem,
              {
                paddingVertical: fontSize * 0.6,
                paddingHorizontal: fontSize * 0.5,
                backgroundColor: theme.background,
              },
            ]}
            onPress={pickPhoto}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={t("plusMenu.chooseFromGallery")}
            accessibilityState={{ disabled: busy }}
          >
            <Ionicons name="image" size={fontSize} color={theme.textPrimary} />
            <Text style={[styles.menuText, { fontSize, color: theme.textPrimary }]} numberOfLines={1}>
              {t("plusMenu.pickFromGallery")}
            </Text>
          </TouchableOpacity>
        </TutorialTarget>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  plusButton: {
    borderRadius: 20,
    marginRight: 5,
  },
  menu: {
    position: "absolute",
    bottom: 50,
    left: 10,
    borderRadius: 8,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 5,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 6,
  },
  menuText: {
    marginLeft: 12,
    flexGrow: 1,
    flexShrink: 0,
  },
});
