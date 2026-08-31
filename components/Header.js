import { Ionicons } from "@expo/vector-icons";
import React, { useContext, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GlobalContext } from "../context/GlobalContext";

// The old headers added all of this extra space below the content band, which
// pushed the title and buttons up against the status bar. Splitting the same
// total padding evenly above and below keeps each header's height identical
// while vertically centering its content.
const HEADER_BAND_EXTRA = 15;
const HEADER_BAND_EXTRA_HALF = HEADER_BAND_EXTRA / 2;
const ICON_HEADER_BAND_EXTRA = 12;
const ICON_HEADER_BAND_EXTRA_HALF = ICON_HEADER_BAND_EXTRA / 2;

// The title (not the buttons) defines the header band height, so its full
// line box is always visible. These insets reserve symmetric space so the
// centered title never collides with the absolutely-positioned side controls:
// header horizontal padding (20) + the control's max footprint
// (90 left button / 70 right button / 24 back icon).
const HEADER_HORIZONTAL_PADDING = 20;
const LEFT_BUTTON_MAX_WIDTH = 90;
const RIGHT_BUTTON_MAX_WIDTH = 70;
const TITLE_LEFT_BUTTON_INSET = HEADER_HORIZONTAL_PADDING + LEFT_BUTTON_MAX_WIDTH;
const TITLE_RIGHT_BUTTON_INSET = HEADER_HORIZONTAL_PADDING + RIGHT_BUTTON_MAX_WIDTH;
const TITLE_BACK_ICON_INSET = HEADER_HORIZONTAL_PADDING + 24;

export function PlainHeader({ title }) {
  const { theme } = useContext(GlobalContext);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  return (
    <View
      style={[
        styles.plain_header,
        {
          paddingTop: insets.top + HEADER_BAND_EXTRA_HALF,
          paddingBottom: HEADER_BAND_EXTRA_HALF,
          backgroundColor: theme.card,
          borderBottomColor: theme.border,
        },
      ]}
    >
      <Text style={[styles.headerText, { fontSize: width * 0.05, color: theme.textPrimary }]}>
        {title}
      </Text>
    </View>
  );
}

/**
 * General-purpose icon header: centered title with optional icon-button
 * groups on the left and right.
 *
 * Each item: { icon, label, onPress, color?, size? } where `label` is used as
 * the accessibility label. Kept purely presentational so any screen can reuse
 * it without chat-specific knowledge.
 */
function IconHeaderButton({
  icon,
  label,
  onPress,
  color,
  size = 24,
  rotateOnPress = false,
}) {
  const { theme } = useContext(GlobalContext);
  const [pressScale] = useState(() => new Animated.Value(1));
  const [pressRotate] = useState(() => new Animated.Value(0));

  const animatePress = (pressed) => {
    Animated.parallel([
      Animated.spring(pressScale, {
        toValue: pressed ? 0.82 : 1,
        speed: pressed ? 40 : 18,
        bounciness: pressed ? 0 : 10,
        useNativeDriver: true,
      }),
      Animated.spring(pressRotate, {
        toValue: pressed ? 1 : 0,
        speed: pressed ? 40 : 18,
        bounciness: pressed ? 0 : 10,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const transform = [
    { scale: pressScale },
    ...(rotateOnPress
      ? [
          {
            rotate: pressRotate.interpolate({
              inputRange: [0, 1],
              outputRange: ["0deg", "45deg"],
            }),
          },
        ]
      : []),
  ];

  return (
    <TouchableOpacity
      onPress={onPress}
      onPressIn={() => animatePress(true)}
      onPressOut={() => animatePress(false)}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Animated.View style={{ transform }}>
        <Ionicons name={icon} size={size} color={color || theme.accent} />
      </Animated.View>
    </TouchableOpacity>
  );
}

export function IconHeader({ title, leftItems = [], rightItems = [] }) {
  const { theme } = useContext(GlobalContext);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const renderItem = (item) => <IconHeaderButton key={item.label} {...item} />;

  return (
    <View
      style={[
        styles.iconHeaderRow,
        {
          paddingTop: insets.top + ICON_HEADER_BAND_EXTRA_HALF,
          paddingBottom: ICON_HEADER_BAND_EXTRA_HALF,
          backgroundColor: theme.card,
          borderBottomColor: theme.border,
        },
      ]}
    >
      <View style={styles.iconHeaderSide}>
        {(Array.isArray(leftItems) ? leftItems : []).map(renderItem)}
      </View>
      <Text
        style={[
          styles.headerText,
          styles.iconHeaderTitle,
          { fontSize: width * 0.05, color: theme.textPrimary },
        ]}
        numberOfLines={1}
      >
        {title}
      </Text>
      <View style={[styles.iconHeaderSide, styles.iconHeaderSideRight]}>
        {(Array.isArray(rightItems) ? rightItems : []).map(renderItem)}
      </View>
    </View>
  );
}

/**
 * ✅ Minimal, backward-compatible upgrade:
 * - Existing screens can keep using: <HeaderWithButton title buttonLabel onPress />
 * - New optional props enable: [Left Button]  Title  [Right Button]
 *
 * New props (optional):
 * - leftButtonLabel?: string
 * - onLeftPress?: () => void
 * - showLeftButton?: boolean
 */
export function HeaderWithButton({
  title,
  buttonLabel,
  onPress,
  leftButtonLabel,
  onLeftPress,
  showLeftButton = false,
}) {
  const { theme } = useContext(GlobalContext);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  // ✅ keep title size as-is, but cap button sizes so "Select All" doesn't get huge
  const buttonFont = Math.min(17, Math.max(14, width * 0.042)); // iOS-ish 14–17

  return (
    <View
      style={[
        styles.header,
        {
          paddingTop: insets.top + HEADER_BAND_EXTRA_HALF,
          paddingBottom: HEADER_BAND_EXTRA_HALF,
          backgroundColor: theme.card,
          borderBottomColor: theme.border,
        },
      ]}
    >
      {/* LEFT: optional Select All / Clear — absolute, centered in the title band */}
      {showLeftButton && (
        <TouchableOpacity
          onPress={onLeftPress}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel={leftButtonLabel}
          style={[
            styles.headerSideButton,
            styles.leftBtnWrap,
            { top: insets.top + HEADER_BAND_EXTRA_HALF, bottom: HEADER_BAND_EXTRA_HALF },
          ]}
        >
          <Text
            style={[styles.editButton, { fontSize: buttonFont, color: theme.accent }]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {leftButtonLabel}
          </Text>
        </TouchableOpacity>
      )}

      {/* CENTER: in-flow title defines the band height, so its full line box is visible */}
      <View
        pointerEvents="none"
        style={[
          styles.headerTitleWrap,
          {
            paddingHorizontal: showLeftButton ? TITLE_LEFT_BUTTON_INSET : TITLE_RIGHT_BUTTON_INSET,
          },
        ]}
      >
        <Text
          style={[
            styles.headerText,
            {
              fontSize: width * 0.05,
              color: theme.textPrimary,
              textAlign: "center",
            },
          ]}
          numberOfLines={1}
        >
          {title}
        </Text>
      </View>

      {/* RIGHT: existing button (Edit / Done) — absolute, centered in the title band */}
      <TouchableOpacity
        onPress={onPress}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityRole="button"
        accessibilityLabel={buttonLabel}
        style={[
          styles.headerSideButton,
          styles.rightBtnWrap,
          { top: insets.top + HEADER_BAND_EXTRA_HALF, bottom: HEADER_BAND_EXTRA_HALF },
        ]}
      >
        <Text style={[styles.editButton, { fontSize: buttonFont, color: theme.accent }]}>
          {buttonLabel}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

export function HeaderWithHiddenButton({ title, onPress, hideButton = true }) {
  const { t } = useTranslation();
  const { theme } = useContext(GlobalContext);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  return (
    <>
      {!hideButton && (
        <View
          style={[
            styles.hide_header,
            {
              paddingTop: insets.top + HEADER_BAND_EXTRA_HALF,
              paddingBottom: HEADER_BAND_EXTRA_HALF,
              backgroundColor: theme.card,
              borderBottomColor: theme.border,
            },
          ]}
        >
          <TouchableOpacity
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={t("header.goBack")}
            style={[
              styles.headerSideButton,
              styles.backBtnWrap,
              { top: insets.top + HEADER_BAND_EXTRA_HALF, bottom: HEADER_BAND_EXTRA_HALF },
            ]}
          >
            <Ionicons name="arrow-back" size={24} color={theme.accent} />
          </TouchableOpacity>
          <View
            pointerEvents="none"
            style={[styles.headerTitleWrap, { paddingHorizontal: TITLE_BACK_ICON_INSET }]}
          >
            <Text
              style={[
                styles.headerText,
                {
                  fontSize: width * 0.05,
                  color: theme.textPrimary,
                  textAlign: "center",
                },
              ]}
              numberOfLines={1}
            >
              {title}
            </Text>
          </View>
        </View>
      )}
      {hideButton && (
        <View
          style={[
            styles.plain_header,
            {
              paddingTop: insets.top + HEADER_BAND_EXTRA_HALF,
              paddingBottom: HEADER_BAND_EXTRA_HALF,
              backgroundColor: theme.card,
              borderBottomColor: theme.border,
            },
          ]}
        >
          <Text style={[styles.headerText, { fontSize: width * 0.05, color: theme.textPrimary }]}>
            {title}
          </Text>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingVertical: 15,
    paddingHorizontal: HEADER_HORIZONTAL_PADDING,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center", // the title is the only in-flow child and defines the band
  },
  plain_header: {
    paddingVertical: 15,
    paddingHorizontal: HEADER_HORIZONTAL_PADDING,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "center",
  },
  hide_header: {
    paddingVertical: 15,
    paddingHorizontal: HEADER_HORIZONTAL_PADDING,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center", // the title is the only in-flow child and defines the band
  },
  headerText: {
    fontWeight: "600",
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  editButton: {
    fontWeight: "600",
    alignSelf: "flex-end", // ✅ you asked to keep this
  },

  // Side controls are absolutely positioned and stretched to the title band
  // (top/bottom are supplied by the component to match the header padding),
  // then vertically centered via justifyContent.
  headerSideButton: {
    position: "absolute",
    justifyContent: "center",
  },
  leftBtnWrap: {
    left: HEADER_HORIZONTAL_PADDING,
    maxWidth: LEFT_BUTTON_MAX_WIDTH, // keep Select All/Clear from looking huge
  },
  rightBtnWrap: {
    right: HEADER_HORIZONTAL_PADDING,
    maxWidth: RIGHT_BUTTON_MAX_WIDTH, // keeps "Done" / "Edit" tidy
    alignItems: "flex-end",
  },
  backBtnWrap: {
    left: HEADER_HORIZONTAL_PADDING,
  },
  iconHeaderRow: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  iconHeaderSide: {
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
    minWidth: 56,
  },
  iconHeaderSideRight: {
    justifyContent: "flex-end",
  },
  iconHeaderTitle: {
    flex: 1,
    textAlign: "center",
    paddingHorizontal: 8,
  },
});
