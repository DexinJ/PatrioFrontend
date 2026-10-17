import { Ionicons } from "@expo/vector-icons";
import React, { useContext, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AccessibilityInfo,
  findNodeHandle,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { GlobalContext } from "../context/GlobalContext";
import FloatingAddButton from "./FloatingAddButton";
import TutorialTarget from "./TutorialTarget";

/**
 * The Fridge tab's add control: the floating + button and the menu it opens.
 *
 * A plain in-tree dropdown, not a Modal, because the tour overlay is itself
 * modal and can only reveal UI that renders beneath it - the same constraint
 * that shaped components/PlusMenu.js.
 */
export default function FridgeAddMenu({
  disabled = false,
  revealOptions = false,
  busy = false,
  onTakePhoto,
  onPickPhoto,
  onAddManually,
}) {
  const { t } = useTranslation();
  const { theme, settings } = useContext(GlobalContext);
  const fontSize = settings?.ux?.fontSize || 16;

  const [menuOpen, setMenuOpen] = useState(false);
  const firstRowRef = useRef(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // The tour forces the menu open; release the user's own toggle when it takes
  // over, so the dropdown cannot outlive the step. Adjusted during render rather
  // than in an effect (React's "storing information from previous renders"
  // pattern) because a cascading setState in an effect is a lint error here.
  // This is stricter than components/PlusMenu.js, which relies on menuOpen
  // already being false and never resets.
  const [previousReveal, setPreviousReveal] = useState(revealOptions);
  if (previousReveal !== revealOptions) {
    setPreviousReveal(revealOptions);
    if (revealOptions) setMenuOpen(false);
  }

  const menuVisible = menuOpen || revealOptions;

  // Screen readers: VoiceOver has to stay inside the open menu and land on the
  // first row; TalkBack gets the rows through the live region. Without this the
  // rows are never discovered at all.
  useEffect(() => {
    if (!menuVisible) return;
    if (Platform.OS !== "ios") return;
    const node = findNodeHandle(firstRowRef.current);
    if (node) AccessibilityInfo.setAccessibilityFocus(node);
  }, [menuVisible]);

  const closeMenu = () => {
    if (mountedRef.current) setMenuOpen(false);
  };

  // Order is a product decision: photo sources first (mirroring the chat attach
  // menu), manual add last, where it is also nearest the thumb.
  const rows = [
    {
      key: "photo",
      icon: "camera",
      label: t("plusMenu.takeAPhoto"),
      a11yLabel: t("fridge.takePhotoA11y"),
      onPress: onTakePhoto,
    },
    {
      key: "gallery",
      icon: "image",
      label: t("plusMenu.pickFromGallery"),
      a11yLabel: t("fridge.pickPhotoA11y"),
      onPress: onPickPhoto,
    },
    {
      key: "manual",
      // Ionicons' compose variant: a pen that reads "new entry" rather than
      // "edit this item". Plain "pencil" is already this app's Edit glyph in the
      // fridge item menu, and "add" would echo the + on the button that opened
      // this menu. (Ionicons has no "plus" glyph at all - it is "add".)
      icon: "create-outline",
      label: t("fridge.addManually"),
      a11yLabel: t("fridge.addManually"),
      onPress: onAddManually,
    },
  ];

  return (
    <>
      <FloatingAddButton
        theme={theme}
        disabled={disabled}
        expanded={menuVisible}
        accessibilityLabel={t("common.addItem")}
        tutorialTargetId="fridge.addButton"
        onPress={() => {
          if (disabled) return;
          setMenuOpen((open) => !open);
        }}
      />

      {menuVisible && (
        <TutorialTarget
          id="fridge.addOptions"
          style={[
            styles.menu,
            {
              backgroundColor: theme.card,
              minWidth: Math.max(fontSize * 11, 200),
            },
          ]}
        >
          <View accessibilityViewIsModal accessibilityLiveRegion="polite">
            {rows.map((row, index) => (
              <TouchableOpacity
                key={row.key}
                ref={index === 0 ? firstRowRef : undefined}
                style={[
                  styles.menuItem,
                  {
                    paddingVertical: fontSize * 0.6,
                    paddingHorizontal: fontSize * 0.5,
                    backgroundColor: theme.background,
                  },
                ]}
                onPress={() => {
                  closeMenu();
                  row.onPress?.();
                }}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={row.a11yLabel}
                accessibilityState={{ disabled: busy }}
              >
                <Ionicons name={row.icon} size={fontSize} color={theme.textPrimary} />
                <Text
                  style={[styles.menuText, { fontSize, color: theme.textPrimary }]}
                  numberOfLines={1}
                >
                  {row.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </TutorialTarget>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  // Anchored above the FAB. FloatingAddButton's wrapper is bottom:30/right:20
  // with a 58px button, so its top edge sits at 88 from the bottom; 96 clears
  // it by 8. (PlusMenu's bottom:50 is for the composer and would overlap here.)
  menu: {
    position: "absolute",
    right: 20,
    bottom: 96,
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
