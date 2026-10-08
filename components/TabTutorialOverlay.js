// The one-time, per-tab coach-mark overlay.
//
// Dims the screen, cuts a spotlight around the current step's anchor (when it
// has one), and walks the user through the page with a small card. Rendered by
// app/(tabs)/_layout.js above the tab bar, so the whole screen is covered.

import React, { useContext, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GlobalContext } from "../context/GlobalContext";
import { useTabTutorial } from "../context/TabTutorialContext";

const DIM_COLOR = "rgba(0, 0, 0, 0.68)";
const SPOTLIGHT_PADDING = 8;
const SPOTLIGHT_RADIUS = 18;
const CARD_GAP = 16;
const CARD_MAX_WIDTH = 400;
// Used only until the card has rendered once and reported its real height.
const CARD_HEIGHT_ESTIMATE = 220;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export default function TabTutorialOverlay() {
  const { t } = useTranslation();
  const { settings, theme } = useContext(GlobalContext);
  const { height: screenHeight, width: screenWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [cardHeight, setCardHeight] = useState(0);
  const {
    currentStep,
    stepIndex,
    totalSteps,
    spot,
    advance,
    dismiss,
    isActive,
  } = useTabTutorial();

  const fontSize = settings?.ux?.fontSize || 16;
  const measuredCardHeight = cardHeight || CARD_HEIGHT_ESTIMATE;

  const layout = useMemo(() => {
    if (!currentStep) return null;

    const cardWidth = Math.max(
      220,
      Math.min(screenWidth - 32, CARD_MAX_WIDTH)
    );
    const cardLeft = Math.max(16, (screenWidth - cardWidth) / 2);

    if (!spot) {
      return {
        cardLeft,
        cardWidth,
        placement: "center",
        cardTop: null,
        cardBottom: null,
        spot: null,
      };
    }

    const spotlight = {
      x: clamp(spot.x - SPOTLIGHT_PADDING, 0, Math.max(0, screenWidth - 1)),
      y: clamp(spot.y - SPOTLIGHT_PADDING, 0, Math.max(0, screenHeight - 1)),
    };
    spotlight.width = Math.max(
      0,
      Math.min(spot.width + SPOTLIGHT_PADDING * 2, screenWidth - spotlight.x)
    );
    spotlight.height = Math.max(
      0,
      Math.min(spot.height + SPOTLIGHT_PADDING * 2, screenHeight - spotlight.y)
    );

    // Only place the card beside the spotlight when the whole card fits there.
    // Otherwise it is centered, which is the safe fallback for tall targets
    // (a full item list or the message area) where neither side has room.
    const needed = measuredCardHeight + CARD_GAP;
    const spaceBelow =
      screenHeight - (spotlight.y + spotlight.height) - insets.bottom;
    const spaceAbove = spotlight.y - insets.top;
    const fitsBelow = spaceBelow >= needed;
    const fitsAbove = spaceAbove >= needed;

    let placement = "center";
    if (fitsBelow && fitsAbove) placement = spaceBelow >= spaceAbove ? "below" : "above";
    else if (fitsBelow) placement = "below";
    else if (fitsAbove) placement = "above";

    return {
      cardLeft,
      cardWidth,
      placement,
      cardTop: placement === "below" ? spotlight.y + spotlight.height + CARD_GAP : null,
      cardBottom: placement === "above" ? screenHeight - spotlight.y + CARD_GAP : null,
      spot: spotlight,
    };
  }, [
    currentStep,
    insets.bottom,
    insets.top,
    measuredCardHeight,
    screenHeight,
    screenWidth,
    spot,
  ]);

  if (!isActive || !currentStep || !layout) return null;

  const isLastStep = stepIndex >= totalSteps - 1;
  const spotlight = layout.spot;
  const card = (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.card,
          borderColor: theme.border,
          width: layout.cardWidth,
        },
      ]}
      accessibilityViewIsModal
      onLayout={(event) =>
        setCardHeight(Math.round(event.nativeEvent.layout.height))
      }
    >
      <Text
        style={[
          styles.stepLabel,
          {
            color: theme.textSecondary,
            fontSize: Math.max(11, fontSize * 0.72),
          },
        ]}
      >
        {t("tutorial.stepOf", { current: stepIndex + 1, total: totalSteps })}
      </Text>

      <Text
        accessibilityRole="header"
        style={[
          styles.title,
          { color: theme.textPrimary, fontSize: fontSize * 1.15 },
        ]}
      >
        {t(currentStep.titleKey)}
      </Text>

      <Text
        style={[
          styles.body,
          {
            color: theme.textSecondary,
            fontSize: fontSize * 0.95,
            lineHeight: fontSize * 1.4,
          },
        ]}
      >
        {t(currentStep.bodyKey)}
      </Text>

      <View style={styles.dots}>
        {Array.from({ length: totalSteps }, (_, index) => (
          <View
            key={index}
            style={[
              styles.dot,
              {
                backgroundColor:
                  index === stepIndex ? theme.actionButton : theme.border,
                width: index === stepIndex ? 18 : 8,
              },
            ]}
          />
        ))}
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={dismiss}
          accessibilityRole="button"
          accessibilityLabel={t("tutorial.a11y.skip")}
          hitSlop={8}
          style={({ pressed }) => [styles.skipBtn, pressed && styles.pressed]}
        >
          <Text
            style={{
              color: theme.textSecondary,
              fontSize,
              fontWeight: "600",
            }}
          >
            {t("tutorial.skip")}
          </Text>
        </Pressable>

        <Pressable
          onPress={advance}
          accessibilityRole="button"
          accessibilityLabel={
            isLastStep ? t("tutorial.a11y.finish") : t("tutorial.a11y.next")
          }
          style={({ pressed }) => [
            styles.nextBtn,
            { backgroundColor: theme.actionButton },
            pressed && styles.pressed,
          ]}
        >
          <Text
            style={{
              color: theme.actionButtonText || "#ffffff",
              fontSize,
              fontWeight: "700",
            }}
          >
            {isLastStep ? t("tutorial.done") : t("tutorial.next")}
          </Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={dismiss}
      supportedOrientations={["portrait", "landscape"]}
    >
      <View style={styles.root}>
        {/* Tap anywhere outside the card to move to the next step. */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={advance}
          accessibilityRole="button"
          accessibilityLabel={
            isLastStep ? t("tutorial.a11y.finish") : t("tutorial.a11y.next")
          }
        />

        {spotlight ? (
          <>
            <View
              pointerEvents="none"
              style={[
                styles.dim,
                { left: 0, right: 0, top: 0, height: spotlight.y },
              ]}
            />
            <View
              pointerEvents="none"
              style={[
                styles.dim,
                {
                  left: 0,
                  right: 0,
                  top: spotlight.y + spotlight.height,
                  bottom: 0,
                },
              ]}
            />
            <View
              pointerEvents="none"
              style={[
                styles.dim,
                {
                  left: 0,
                  top: spotlight.y,
                  width: spotlight.x,
                  height: spotlight.height,
                },
              ]}
            />
            <View
              pointerEvents="none"
              style={[
                styles.dim,
                {
                  left: spotlight.x + spotlight.width,
                  right: 0,
                  top: spotlight.y,
                  height: spotlight.height,
                },
              ]}
            />
            <View
              pointerEvents="none"
              style={[
                styles.ring,
                {
                  left: spotlight.x,
                  top: spotlight.y,
                  width: spotlight.width,
                  height: spotlight.height,
                  borderColor: theme.actionButton,
                },
              ]}
            />
          </>
        ) : (
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.dim]} />
        )}

        {layout.placement === "center" ? (
          <View style={styles.centerWrap} pointerEvents="box-none">
            {card}
          </View>
        ) : (
          <View
            pointerEvents="box-none"
            style={[
              styles.cardWrap,
              {
                left: layout.cardLeft,
                top: layout.cardTop ?? undefined,
                bottom: layout.cardBottom ?? undefined,
              },
            ]}
          >
            {card}
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  dim: {
    position: "absolute",
    backgroundColor: DIM_COLOR,
  },
  ring: {
    position: "absolute",
    borderWidth: 2,
    borderRadius: SPOTLIGHT_RADIUS,
  },
  centerWrap: {
    // React Native 0.86 no longer exports `absoluteFillObject`; spreading a
    // missing export is a silent no-op, which left this wrapper unpositioned
    // and pinned the card to the top of the screen.
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  cardWrap: {
    position: "absolute",
    alignItems: "center",
  },
  card: {
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 8,
  },
  stepLabel: {
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  title: {
    fontWeight: "800",
    marginTop: 6,
  },
  body: {
    marginTop: 8,
  },
  dots: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 16,
  },
  dot: {
    height: 8,
    borderRadius: 999,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 14,
  },
  skipBtn: {
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  nextBtn: {
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 22,
  },
  pressed: {
    opacity: 0.75,
  },
});
