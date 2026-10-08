// Marks a region of a screen as a coach-mark anchor.
//
// Renders a plain host View so the tutorial overlay can measure it with
// measureInWindow(). `collapsable={false}` matters on Android: without it the
// view can be flattened away by the layout optimizer and measuring fails, in
// which case the overlay silently falls back to a centered card.
//
// Keep the wrapper's style identical to the element it replaces when the
// target needs to take part in layout (for example `style={{ flex: 1 }}`).

import React, { useCallback } from "react";
import { View } from "react-native";
import { useTabTutorial } from "../context/TabTutorialContext";

export default function TutorialTarget({ id, style, children, ...rest }) {
  const { registerTarget } = useTabTutorial();

  const setRef = useCallback(
    (node) => {
      registerTarget(id, node);
    },
    [id, registerTarget]
  );

  return (
    <View ref={setRef} collapsable={false} style={style} {...rest}>
      {children}
    </View>
  );
}
