// components/RecipeMissingItemsButton.js
//
// The per-card "add missing items to the shopping list" button.
//
// It renders nothing when the card has no structured missing items (cards
// persisted before the payload gained `missingItems`), reads as done when the
// list already holds everything, and otherwise adds what is left in one tap.
//
// Kept in its own file so RecipeResultCards only needs a two-line change to
// render it (see utils/recipeShoppingList.js for the integration notes).

import { useContext, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { useTranslation } from "react-i18next";
import { GlobalContext } from "../context/GlobalContext";
import {
  missingItemsStatus,
  planShoppingListAdditions,
  shoppingItemsForRecipe,
} from "../utils/recipeShoppingList";

export default function RecipeMissingItemsButton({ recipe, onAdded }) {
  const { t } = useTranslation();
  const {
    theme,
    shoppingListItems,
    addManyToShoppingList,
    inferFoodTypeLabelFromName,
  } = useContext(GlobalContext);

  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);

  const status = useMemo(
    () => missingItemsStatus(recipe, shoppingListItems),
    [recipe, shoppingListItems]
  );

  if (!status.hasItems) return null;

  const disabled = busy || status.allPresent;
  const label = status.allPresent
    ? t("messageList.recipes.alreadyOnList")
    : t("messageList.recipes.addMissingItemsCount", { count: status.absent });

  const handlePress = () => {
    if (disabled) return;
    setBusy(true);
    try {
      const incoming = shoppingItemsForRecipe(recipe, {
        inferFoodType: inferFoodTypeLabelFromName,
      });
      // Planned here as well as in the store, so a card cannot add the same
      // row twice even if the store has not adopted the dedupe yet.
      const { additions, skipped } = planShoppingListAdditions(
        shoppingListItems,
        incoming
      );
      const added =
        additions.length > 0 && typeof addManyToShoppingList === "function"
          ? addManyToShoppingList(additions)
          : [];
      setFeedback(
        skipped.length > 0
          ? t("messageList.recipes.addedSomeToShoppingList", {
              added: added.length,
              skipped: skipped.length,
            })
          : t("messageList.recipes.addedToShoppingList", { count: added.length })
      );
      onAdded?.(added);
    } catch {
      setFeedback(t("messageList.recipes.addToShoppingListFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Pressable
        onPress={handlePress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        accessibilityLabel={label}
        style={({ pressed }) => [
          styles.button,
          {
            borderColor: theme.accent ?? theme.textPrimary,
            opacity: disabled ? 0.55 : pressed ? 0.75 : 1,
          },
        ]}
      >
        <Text style={[styles.buttonText, { color: theme.accent ?? theme.textPrimary }]}>
          {label}
        </Text>
      </Pressable>
      {feedback ? (
        <Text style={[styles.feedback, { color: theme.textSecondary }]}>
          {feedback}
        </Text>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    marginTop: 8,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
  },
  buttonText: {
    fontSize: 14,
    fontWeight: "700",
  },
  feedback: {
    marginTop: 4,
    fontSize: 12,
    opacity: 0.85,
  },
});
