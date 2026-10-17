# Code preview — fridge add menu with photo capture

Status: **applied** to the working tree (uncommitted) on 2026-10-12. This is the
code as written, with one change from what revision 2 showed.

Applied difference: the reveal reset is a render-phase adjustment
(`previousReveal`), not a `useEffect`. The repo's lint rejects a synchronous
`setState` inside an effect (`react-hooks/set-state-in-effect`), and the
render-phase form is React's documented pattern for reacting to a prop change.

Post-application fixes to the "Add manually" row icon: it first used
`icon: "plus"`, which Ionicons does not ship (its plus glyph is `add`), so it
rendered a missing-glyph question mark on device. It is now `create-outline` -
Ionicons' compose variant, which reads "new entry" rather than "edit this item"
the way the plain `pencil` this app already uses for Edit does. Both this test
file and `tests/chatSuggestions.test.js` check every icon name against the
installed Ionicons glyph map.

Revision 2 resolves the two items revision 1 left as open questions:

- the optional `expanded` prop on `FloatingAddButton` is now part of the design,
  not a deviation from it (section 3);
- focus restoration to the `+` button is dropped, with the reason recorded under
  the component notes - plumbing a ref through `components/TutorialTarget.js`
  would silently replace its own `ref={setRef}` and break every coach-mark
  anchor in the app.

Written against the current working tree at `8615c7b` plus the uncommitted
`hooks/usePhotoCapture.js`, which this change consumes.

Files: 2 new, 8 edited. No file is deleted or renamed, and no shared component's
rendered output changes.

---

## 1. New — `components/FridgeAddMenu.js`

```jsx
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
```

Notes on the shape of that component:

- It returns a **Fragment**, not a `<View>`. `FloatingAddButton` positions
  itself with `position: "absolute"; bottom: 30; right: 20` relative to its
  parent, so wrapping it in a flow-positioned `<View>` would move the FAB. As a
  fragment, both the button and the dropdown stay children of the screen root
  and keep the offsets they have today.
- `plusMenu.takeAPhoto` and `plusMenu.pickFromGallery` are reused verbatim as
  the visible labels; only the accessibility labels are new and specific.
- Capture state deliberately lives on the screen, not in this component:
  `fridge.js` owns `usePhotoCapture` and the menu only calls into it. Every row
  press closes the menu before the camera opens, so a menu unmount must not be
  able to tear down an in-flight capture - and it cannot, because no capture
  state is held here.
- Focus is **not** restored to the `+` button when the menu closes. Restoring it
  needs a ref on the button itself, and `components/TutorialTarget.js` spreads
  unknown props on to its host `<View>` *after* its own `ref={setRef}`, so a ref
  passed through it would replace the tutorial's registration and break every
  coach-mark anchor in the app. That blast radius is not worth a focus nicety;
  revisit only if device testing shows the fallback is unusable.

## 2. New — `tests/fridgeAddMenu.test.js`

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

import { shouldRevealMenu } from "../utils/tabTutorials.js";

const require = createRequire(import.meta.url);
const en = require("../locales/en.json");
const zh = require("../locales/zh.json");

const source = readFileSync(
  new URL("../components/FridgeAddMenu.js", import.meta.url),
  "utf8"
);

function resolveKey(catalog, key) {
  return key.split(".").reduce((node, part) => node?.[part], catalog);
}

test("the fridge add menu registers both tutorial targets", () => {
  assert.match(source, /"fridge\.addButton"/);
  assert.match(source, /"fridge\.addOptions"/);
});

test("the fridge add menu keeps the reviewed row order", () => {
  const photo = source.indexOf('t("plusMenu.takeAPhoto")');
  const gallery = source.indexOf('t("plusMenu.pickFromGallery")');
  const manual = source.indexOf('t("fridge.addManually")');

  assert.ok(photo >= 0 && gallery >= 0 && manual >= 0);
  assert.ok(photo < gallery, "Take a photo comes before Choose from gallery");
  assert.ok(gallery < manual, "Choose from gallery comes before Add manually");
});

test("the new fridge copy exists in every locale", () => {
  const keys = [
    "fridge.addManually",
    "fridge.takePhotoA11y",
    "fridge.pickPhotoA11y",
    "fridge.photoPrompt",
    "fridge.photoDisplayText",
    "fridge.photoTitle",
    "fridge.photoFailed",
    "tutorial.tabs.fridge.addOptions.title",
    "tutorial.tabs.fridge.addOptions.body",
  ];

  for (const key of keys) {
    for (const [locale, catalog] of Object.entries({ en, zh })) {
      const value = resolveKey(catalog, key);
      assert.equal(typeof value, "string", `${locale} missing ${key}`);
      assert.ok(value.trim().length > 0, `${locale} blank ${key}`);
    }
  }
});

test("the reveal helper covers the fridge add step", () => {
  assert.equal(shouldRevealMenu("fridge", "addOptions"), true);
  assert.equal(shouldRevealMenu("fridge", "addButton"), false);
});
```

## 3. Edit — `components/FloatingAddButton.js`

One optional prop so the trigger can report that its menu is open. The component
has exactly one consumer (`app/(tabs)/fridge.js`) and the prop defaults to
`undefined`, so its rendered output is identical for every existing caller: the
diff touches only the accessibility state, never size, colour, position,
disabled handling or press behaviour.

```diff
 export default function FloatingAddButton({
   onPress,
   disabled = false,
   theme,
   icon = "add",
   size = 28,
+  expanded,
   style,
   testID,
   accessibilityLabel,
   tutorialTargetId,
 }) {
@@
         onPress={disabled ? undefined : onPress}
         activeOpacity={0.85}
         accessibilityRole="button"
         accessibilityLabel={accessibilityLabel}
-        accessibilityState={{ disabled }}
+        accessibilityState={{
+          disabled,
+          ...(typeof expanded === "boolean" ? { expanded } : {}),
+        }}
       >
```

## 4. Edit — `app/(tabs)/fridge.js`

```diff
@@ imports
 import { useGpt } from "../../api/gpt";
 import ActionGridPopover from "../../components/ActionGridPopover";
 import FilterTabsRow from "../../components/FilterTabsRow";
-import FloatingAddButton from "../../components/FloatingAddButton";
+import FridgeAddMenu from "../../components/FridgeAddMenu";
 import { HeaderWithButton } from "../../components/Header";
 import InventoryListItem from "../../components/InventoryListItem";
 import ItemFormModal from "../../components/ItemFormModal";
 import SearchAndSortBar from "../../components/SearchAndSortBar";
 import SectionHeaderPill from "../../components/SectionHeaderPill";
 import SelectionActionBar from "../../components/SelectionActionBar";
 import SortSheetModal from "../../components/SortSheetModal";
 import TutorialTarget from "../../components/TutorialTarget";
 import { GlobalContext } from "../../context/GlobalContext";
+import { useTabTutorial } from "../../context/TabTutorialContext";
+import usePhotoCapture from "../../hooks/usePhotoCapture";
 import { buildTagMaps, makeGetTagLabelByType, makeLabelToTagId, makeLabelsFromTagIds } from "../../utils/itemTagLabels";
 import { joinList } from "../../utils/localeList.js";
+import { shouldRevealMenu } from "../../utils/tabTutorials";

@@ hooks, next to the existing useGpt() call
   const navigation = useNavigation();
   const { streamMessage } = useGpt();
+  const { currentStep, isActive } = useTabTutorial();

@@ between openRecipesForItems and addItemsToShopList
         if (recipeGenerationRef.current === generation) {
           recipeBusyRef.current = false;
         }
       }
     },
     [streamMessage, t]
   );
 
+  // "Add from a photo": same launch as openRecipesForItems - go to Chat, send
+  // the real prompt with the image, and let the assistant propose items through
+  // the existing add_all_to_fridge card. Deliberately no `uiAction`, so the
+  // model actually reads the image instead of being handed a canned action.
+  const handlePhotoCaptured = useCallback(
+    async ({ imageUri, imageRequestUri }) => {
+      if (!imageUri) return;
+      try {
+        router.push("/chat");
+        await streamMessage({
+          text: t("fridge.photoPrompt"),
+          displayText: t("fridge.photoDisplayText"),
+          imageUri,
+          imageRequestUri,
+        });
+      } catch (e) {
+        if (e?.code !== "REQUEST_CANCELLED" && mountedRef.current) {
+          Alert.alert(
+            t("fridge.photoTitle"),
+            e?.message || t("fridge.photoFailed")
+          );
+        }
+      }
+    },
+    [streamMessage, t]
+  );
+
+  const { busy: photoBusy, takePhoto, pickPhoto } = usePhotoCapture({
+    onCapture: handlePhotoCaptured,
+  });
+
+  // The fridge tour reveals the add menu the same way the chat tour reveals
+  // the attach menu.
+  const revealAddMenu = isActive && shouldRevealMenu("fridge", currentStep?.id);
+
   const addItemsToShopList = useCallback(

@@ render, replacing the bare FAB (currently lines 619-631)
-      {/* FAB */}
-      <FloatingAddButton
-        theme={theme}
-        disabled={editMode}
-        accessibilityLabel={t("common.addItem")}
-        tutorialTargetId="fridge.addButton"
-        onPress={() => {
-          if (editMode) return;
-          setAddModalVisible(true);
-        }}
-      />
+      {/* Add control: + button and its menu */}
+      <FridgeAddMenu
+        disabled={editMode}
+        busy={photoBusy}
+        revealOptions={revealAddMenu}
+        onTakePhoto={takePhoto}
+        onPickPhoto={pickPhoto}
+        onAddManually={() => setAddModalVisible(true)}
+      />
```

The `addToFridge` / `addManyToShoppingList` / `editFridgeItem` /
`removeManyFromFridge` destructuring and every other line of the file are
untouched. `theme` is still destructured and still used by the list, header and
modals; the menu reads it from context itself.

## 5. Edit — `utils/tabTutorials.js`

```diff
 // Bumped whenever any tab's steps change.
-export const TAB_TUTORIAL_VERSION = 2;
+export const TAB_TUTORIAL_VERSION = 3;

 export const TAB_TUTORIAL_TAB_VERSIONS = Object.freeze({
   home: 1,
   chat: 2,
-  fridge: 2,
+  fridge: 3,
   list: 1,
   settings: 1,
 });

@@ the fridge step list
     {
       id: "addButton",
       targetId: "fridge.addButton",
       titleKey: "tutorial.tabs.fridge.addButton.title",
       bodyKey: "tutorial.tabs.fridge.addButton.body",
     },
+    {
+      id: "addOptions",
+      targetId: "fridge.addOptions",
+      titleKey: "tutorial.tabs.fridge.addOptions.title",
+      bodyKey: "tutorial.tabs.fridge.addOptions.body",
+    },
     {
       id: "editButton",
       targetId: "fridge.editButton",
       titleKey: "tutorial.tabs.fridge.editButton.title",
       bodyKey: "tutorial.tabs.fridge.editButton.body",
     },

@@ the reveal helper
 // Steps whose host control has to reveal itself while the step is showing: the
-// overlay is modal and swallows the tap that would normally open it.
-export function shouldRevealAttachMenu(tabKey, stepId) {
-  return tabKey === "chat" && stepId === "attachOptions";
-}
+// overlay is modal and swallows the tap that would normally open it. Both are
+// dropdowns hidden behind a tap: the chat attach menu and the fridge add menu.
+export function shouldRevealMenu(tabKey, stepId) {
+  return (
+    (tabKey === "chat" && stepId === "attachOptions") ||
+    (tabKey === "fridge" && stepId === "addOptions")
+  );
+}
```

`shouldRevealAttachMenu` is renamed, not duplicated: keeping the chat-specific
name for a function that now serves two tabs would be the kind of drift that
made the original helper necessary. Two consumers need the rename, below.

## 6. Edit — `components/MessageInput.js`

```diff
 import { isChatStreaming } from "../utils/composerActions";
-import { shouldRevealAttachMenu } from "../utils/tabTutorials";
+import { shouldRevealMenu } from "../utils/tabTutorials";
@@
   const revealAttachOptions =
-    isActive && shouldRevealAttachMenu("chat", currentStep?.id);
+    isActive && shouldRevealMenu("chat", currentStep?.id);
```

## 7. Edit — `tests/tabTutorials.test.js`

```diff
   normalizeSeenTabs,
-  shouldRevealAttachMenu,
+  shouldRevealMenu,
 } from "../utils/tabTutorials.js";
@@
-test("the photo-options reveal is scoped to the chat attach step", () => {
-  assert.equal(shouldRevealAttachMenu("chat", "attachOptions"), true);
-  assert.equal(shouldRevealAttachMenu("chat", "attach"), false);
-  assert.equal(shouldRevealAttachMenu("fridge", "attachOptions"), false);
-  assert.equal(shouldRevealAttachMenu("chat", undefined), false);
-});
+test("the reveal helper is scoped to the two dropdown steps", () => {
+  assert.equal(shouldRevealMenu("chat", "attachOptions"), true);
+  assert.equal(shouldRevealMenu("fridge", "addOptions"), true);
+  assert.equal(shouldRevealMenu("chat", "attach"), false);
+  assert.equal(shouldRevealMenu("fridge", "addButton"), false);
+  assert.equal(shouldRevealMenu("fridge", "attachOptions"), false);
+  assert.equal(shouldRevealMenu("chat", "addOptions"), false);
+  assert.equal(shouldRevealMenu("chat", undefined), false);
+});
```

## 8. Edit — `locales/en.json`

```diff
@@ fridge
     "emptyFridge": "👇 Your fridge is empty. Add some items!",
-    "noMatches": "No matches. Try a different search or tab."
+    "noMatches": "No matches. Try a different search or tab.",
+    "addManually": "Add manually",
+    "takePhotoA11y": "Take a photo of your fridge, a shelf, or a receipt",
+    "pickPhotoA11y": "Choose a photo of your fridge, a shelf, or a receipt",
+    "photoPrompt": "Add everything you can identify in this photo to my fridge. If a quantity or expiry date is unclear, make a reasonable guess.",
+    "photoDisplayText": "Add items from a photo",
+    "photoTitle": "Add from a photo",
+    "photoFailed": "Couldn't read that photo. Try again, or add the items by hand."
   },

@@ tutorial.tabs.fridge
         "addButton": {
           "title": "Add to your inventory",
-          "body": "Tap the plus button to log a new item: name, quantity, storage, food type, and expiry date, with tags suggested as you type. You can also ask AI to add the item for you."
+          "body": "Tap the plus button to open the add menu: take a photo, choose one from your gallery, or add an item by hand."
+        },
+        "addOptions": {
+          "title": "Add by photo or by hand",
+          "body": "Take a live photo of a shelf, a receipt, or your fridge - or choose one you already have. The assistant reads it and adds what it finds. You can still add an item by hand."
         },
```

## 9. Edit — `locales/zh.json`

```diff
@@ fridge
     "emptyFridge": "冰箱还空着，先加点东西吧 👇",
-    "noMatches": "没找到，换个关键词或标签页试试。"
+    "noMatches": "没找到，换个关键词或标签页试试。",
+    "addManually": "手动添加",
+    "takePhotoA11y": "拍一张冰箱、货架或小票的照片",
+    "pickPhotoA11y": "从相册选一张冰箱、货架或小票的照片",
+    "photoPrompt": "把这张照片里能看出来的食材都加进我的冰箱；数量或保质期看不清的话，可以估算。",
+    "photoDisplayText": "从照片添加食材",
+    "photoTitle": "从照片添加",
+    "photoFailed": "这张照片读不出来，再试一次，或手动添加。"
   },

@@ tutorial.tabs.fridge
         "addButton": {
           "title": "添加食材",
-          "body": "点加号记录新食材：名称、数量、存放位置、类型和保质期，输入时应用会自动推荐标签。也可以直接让 AI 帮你添加。"
+          "body": "点加号打开添加菜单：拍张照片、从相册选一张，或手动添加。"
+        },
+        "addOptions": {
+          "title": "拍照添加或手动添加",
+          "body": "拍一张货架、小票或冰箱的照片，或从相册选一张；助手会读出里面的食材并加进冰箱。也可以手动逐项添加。"
         },
```

---

## 10. Edit — `components/PlusMenu.js` (comment only)

The rename leaves one stale reference: the comment above `menuVisible` cites a
function that no longer exists, and repeats the false "closes again as soon as
the step moves on" claim. Comment only - no behavior change.

```diff
   // The tour cannot tap the button, so it forces the options open instead
-  // (see shouldRevealAttachMenu). The user's own toggle is left untouched, so
-  // the menu closes again as soon as the step moves on.
+  // (see shouldRevealMenu). The user's own toggle is left untouched.
   const menuVisible = menuOpen || revealOptions;
```

---

## Deliberate non-changes

Checklist for reading the diff for unintended changes:

- The FAB keeps its icon, colour, size, position, `fridge.addButton` tutorial id
  and `common.addItem` label - only its `onPress` target changes.
- Edit mode still disables add: `disabled={editMode}` is passed through, and the
  button no-ops when disabled, so the menu cannot open in edit mode.
- The list, its `paddingBottom: editMode ? 170 : 110`, search, filter tabs, sort
  sheet, long-press menu, `SelectionActionBar`, `ItemFormModal`, empty state and
  the edit header are untouched.
- No `uiAction` is passed on the photo path - that is what makes the assistant
  read the image rather than apply a canned action.
- `plusMenu.takeAPhoto`, `plusMenu.pickFromGallery` and
  `plusMenu.chooseFromGallery` are read, never rewritten, so the composer's
  attach menu is unchanged.
- No existing locale key is renamed, reworded or removed. Only
  `tutorial.tabs.fridge.addButton.body` changes, because it described a `+`
  button that no longer opens the form directly.
- The Shopping List, Home, chat composer and the shared capture hook are not
  touched.

## Problems caught while writing it out

1. **The FAB would have moved.** A first draft wrapped both the button and the
   dropdown in one `<View>`. `FloatingAddButton` positions itself absolutely
   relative to its parent, so that wrapper - a zero-height flow element - would
   have dragged the FAB up into the list. The component returns a fragment
   instead, so both stay children of the screen root with today's offsets.
2. **Stale menu offset.** `PlusMenu`'s `bottom: 50` is measured for the composer.
   Here the FAB spans 30-88 from the bottom, so the menu uses `bottom: 96`; 50
   would have drawn the menu on top of the button.
3. **`expanded` was not expressible.** `FloatingAddButton` hard-codes
   `accessibilityState={{ disabled }}`, so the trigger could not report that the
   menu is open. Handled with the optional prop in section 3, which the plan now
   treats as part of the design rather than an exception.
4. **The existing fridge tour copy goes stale.** `addButton.body` currently
   promises the form opens on tap. Once `+` opens a menu, that step is wrong, so
   it is reworded and the detail moves to the new `addOptions` step.
5. **The reveal helper is chat-named.** `shouldRevealAttachMenu` cannot honestly
   serve the fridge, so it is renamed - which pulls in `MessageInput.js` and the
   existing test as a third and fourth file rather than the two the plan implied.
6. **Row order is now load-bearing.** The order was a decision, so
   `tests/fridgeAddMenu.test.js` asserts it against source order.
7. **The rename left a stale symbol and a false comment.** `PlusMenu.js` cites
   `shouldRevealAttachMenu` by name, and its comment claims "the menu closes
   again as soon as the step moves on" - which is not true, because nothing
   resets `menuOpen` when `revealOptions` clears. Section 10 fixes the comment
   and drops the false claim; the underlying leak stays a follow-on, the same
   way the chat menu's missing accessibility semantics do.
8. **The obvious way to restore focus would have broken the tour.** Passing a
   ref through `components/TutorialTarget.js` looks free, but that component
   spreads `...rest` on to its host `<View>` after `ref={setRef}`, so the passed
   ref would win and the anchor would stop registering - silently turning every
   coach mark in the app into a centered card. Focus restoration is dropped
   rather than plumbed, and the plan records why.

## Open items to verify on a device, not assumed

- `findNodeHandle` is already used in `components/ItemFormModal.js:16`, so it
  exists in this React Native version, but `AccessibilityInfo.setAccessibilityFocus`
  has no precedent in the codebase. If VoiceOver does not move to the first row,
  fall back to `AccessibilityInfo.announceForAccessibility` with a short string.
- On Android, `accessibilityLiveRegion="polite"` is expected to announce the
  three rows as they appear. Verify; if it stays silent, add an explicit
  announcement in the same effect.
- `displayText` is only proven in the recipe flow. If it is not honoured on this
  path the transcript shows the raw `photoPrompt` instead of "Add items from a
  photo" - cosmetic, not a bug, but worth confirming.
- Tapping a row closes the menu before the camera opens. Verify that the
  permission prompt and the picker are not affected by the menu unmounting.
- Where focus lands after the menu closes, since no restore is implemented. If
  iOS strands the user at the top of the screen, that is the signal to revisit -
  with a ref threaded properly, not spread through `TutorialTarget`.

## Verification once applied

- `npm run test:unit` - all pass except the pre-existing
  `tests/aiProviderSlotComparison.test.js` failure (missing `refactor/` module).
- `npm run lint` - no new errors.
- Manual: fridge `+` opens the menu; each row works; edit mode disables it;
  Settings - Preferences - Replay page tutorials re-runs the fridge tour and the
  new step reveals the menu.
