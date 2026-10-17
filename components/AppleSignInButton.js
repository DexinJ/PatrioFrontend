// components/AppleSignInButton.js
//
// Apple's own Sign in with Apple control.
//
// A hand-built button using an Apple glyph is the sort of thing review pushes
// back on: Apple's guidelines for this feature expect the system control (or
// artwork that follows the same rules). `AppleAuthenticationButton` renders
// ASAuthorizationAppleIDButton, so the title, logo, colours, proportions, and
// localisation are Apple's and cannot be wrong.
//
// Two native constraints, both handled here: the button is invisible unless
// `style` carries a width and height, and `style` must not set
// `backgroundColor` or `borderRadius` — use `buttonStyle` and `cornerRadius`
// for those.

import * as AppleAuthentication from "expo-apple-authentication";
import React, { useEffect, useState } from "react";
import { StyleSheet } from "react-native";

export default function AppleSignInButton({
  onPress,
  disabled = false,
  style,
  buttonType,
}) {
  // Availability is a device/OS question, not a platform question: the module
  // reports false on Android, in Expo Go, and on devices without the feature.
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    let active = true;
    AppleAuthentication.isAvailableAsync()
      .then((value) => {
        if (active) setAvailable(value === true);
      })
      .catch(() => {
        if (active) setAvailable(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (!available) return null;

  return (
    <AppleAuthentication.AppleAuthenticationButton
      buttonType={
        buttonType ?? AppleAuthentication.AppleAuthenticationButtonType.CONTINUE
      }
      buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE_OUTLINE}
      cornerRadius={12}
      style={[styles.button, disabled && styles.disabled, style]}
      onPress={disabled ? () => {} : onPress}
    />
  );
}

const styles = StyleSheet.create({
  button: {
    width: "100%",
    height: 50,
  },
  disabled: {
    opacity: 0.5,
  },
});
