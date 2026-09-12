// components/RecipeResultCards.js
// Renders recommendRecipes results as tappable cards inside the chat list.
// A card shows the recipe name, time/calories/source, ingredients the user
// already has, and the key missing ingredients (truncated with "..." when the
// recipe needs many). Tapping a card opens a modal with the full ingredients,
// publisher steps, and a link to the original recipe page.

import {
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { memo, useContext, useState } from "react";
import { useTranslation } from "react-i18next";
import { GlobalContext } from "../context/GlobalContext";
import { visibleMissingIngredients } from "../utils/recipeCards";
import RecipeMissingItemsButton from "./RecipeMissingItemsButton";

const MAX_CARD_USED_ITEMS = 4;

function useRecipeLabels() {
  const { t } = useTranslation();
  return {
    youHave: t("messageList.recipes.youHave"),
    missing: t("messageList.recipes.missing"),
    tapForDetails: t("messageList.recipes.tapForDetails"),
  };
}

function RecipeMetaLine({ recipe }) {
  const { t } = useTranslation();
  const { theme } = useContext(GlobalContext);
  const parts = [];

  if (Number.isFinite(recipe.totalMinutes)) {
    parts.push(t("messageList.recipes.minutes", { count: recipe.totalMinutes }));
  }
  if (Number.isFinite(recipe.caloriesPerServing)) {
    parts.push(
      t("messageList.recipes.calories", { count: recipe.caloriesPerServing })
    );
    if (recipe.nutritionConfidence === "ai_estimated") {
      parts[parts.length - 1] += t("messageList.recipes.estimatedSuffix");
    }
  }
  if (Number.isFinite(recipe.servings)) {
    parts.push(t("messageList.recipes.servings", { count: recipe.servings }));
  }
  if (recipe.source) parts.push(recipe.source);

  return parts.length ? (
    <Text
      style={[styles.metaText, { color: theme.textSecondary }]}
      numberOfLines={2}
    >
      {parts.join(" • ")}
    </Text>
  ) : null;
}

function IngredientSummaryRow({ label, items, moreCount }) {
  const { t } = useTranslation();
  const { theme } = useContext(GlobalContext);
  const more = moreCount > 0 ? ` ${t("messageList.recipes.haveMore", { count: moreCount })}` : "";
  if (items.length === 0) {
    return (
      <Text style={[styles.summaryLine, { color: theme.textSecondary }]}>
        <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>
          {label}:{" "}
        </Text>
        {t("common.none")}
      </Text>
    );
  }
  return (
    <Text
      style={[styles.summaryLine, { color: theme.textPrimary }]}
      numberOfLines={2}
    >
      <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>
        {label}:{" "}
      </Text>
      {items.join(", ")}
      {more}
    </Text>
  );
}

function RecipeCard({ recipe, onOpen }) {
  const { t } = useTranslation();
  const { theme } = useContext(GlobalContext);
  const labels = useRecipeLabels();
  const usedPreview = recipe.usedIngredients.slice(0, MAX_CARD_USED_ITEMS);
  const usedHidden = Math.max(0, recipe.usedIngredients.length - usedPreview.length);
  const missing = visibleMissingIngredients(recipe.missingIngredients);

  return (
    <Pressable
      onPress={() => onOpen(recipe)}
      accessibilityRole="button"
      accessibilityLabel={`${recipe.title}. ${labels.tapForDetails}`}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: theme.card,
          borderColor: theme.border ?? "rgba(0,0,0,0.12)",
          opacity: pressed ? 0.82 : 1,
        },
      ]}
    >
      <Text style={[styles.cardTitle, { color: theme.textPrimary }]} numberOfLines={2}>
        {recipe.title}
      </Text>
      <RecipeMetaLine recipe={recipe} />
      <IngredientSummaryRow
        label={labels.youHave}
        items={usedPreview}
        moreCount={usedHidden}
      />
      <IngredientSummaryRow
        label={labels.missing}
        items={missing.items}
        moreCount={missing.hiddenCount}
      />
      <RecipeMissingItemsButton recipe={recipe} />
      <Text style={[styles.cardHint, { color: theme.textSecondary }]}>
        {labels.tapForDetails}
      </Text>
    </Pressable>
  );
}

function SectionList({ title, items, numbered }) {
  const { theme } = useContext(GlobalContext);
  if (items.length === 0) return null;
  return (
    <View style={styles.modalSection}>
      <Text style={[styles.modalSectionTitle, { color: theme.textPrimary }]}>
        {title}
      </Text>
      {items.map((item, index) => (
        <View key={`${title}-${index}`} style={styles.modalRow}>
          {numbered ? (
            <Text style={[styles.stepNumber, { color: theme.textSecondary }]}>
              {index + 1}.
            </Text>
          ) : (
            <Text style={[styles.bullet, { color: theme.textSecondary }]}>•</Text>
          )}
          <Text style={[styles.modalRowText, { color: theme.textPrimary }]}>
            {item}
          </Text>
        </View>
      ))}
    </View>
  );
}

function RecipeDetailModal({ recipe, visible, onClose }) {
  const { t } = useTranslation();
  const { theme } = useContext(GlobalContext);
  if (!recipe) return null;

  const openRecipe = async () => {
    try {
      const supported = await Linking.canOpenURL(recipe.url);
      if (supported) await Linking.openURL(recipe.url);
    } catch {
      // Best-effort: a recipe page that cannot open should not crash chat.
    }
  };

  const stepsAvailable =
    Array.isArray(recipe.instructions) && recipe.instructions.length > 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.modalRoot}>
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t("common.close")}
        />
        <View
          style={[styles.modalSheet, { backgroundColor: theme.card }]}
        >
          <View
            style={[
              styles.modalHeader,
              { borderBottomColor: theme.border ?? "rgba(0,0,0,0.12)" },
            ]}
          >
            <View style={styles.modalHeaderText}>
              <Text
                style={[styles.modalTitle, { color: theme.textPrimary }]}
                numberOfLines={2}
              >
                {recipe.title}
              </Text>
              <RecipeMetaLine recipe={recipe} />
            </View>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={t("common.close")}
            >
              <Text style={[styles.closeText, { color: theme.accent }]}>
                {t("common.close")}
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.modalContent}>
            <SectionList
              title={t("messageList.recipes.youHave")}
              items={recipe.usedIngredients}
            />
            <SectionList
              title={t("messageList.recipes.missing")}
              items={recipe.missingIngredients}
            />
            <RecipeMissingItemsButton recipe={recipe} />
            {recipe.whyRecommended ? (
              <Text style={[styles.whyText, { color: theme.textSecondary }]}>
                {recipe.whyRecommended}
              </Text>
            ) : null}
            {stepsAvailable ? (
              <SectionList
                title={t("messageList.recipes.stepsTitle")}
                items={recipe.instructions}
                numbered
              />
            ) : (
              <Text style={[styles.noSteps, { color: theme.textSecondary }]}>
                {t("messageList.recipes.stepsNone")}
              </Text>
            )}
            <TouchableOpacity
              onPress={openRecipe}
              accessibilityRole="link"
              style={[
                styles.openButton,
                { borderColor: theme.textPrimary },
              ]}
            >
              <Text
                style={[styles.openButtonText, { color: theme.textPrimary }]}
              >
                {t("messageList.recipes.openRecipe")}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function RecipeResultCards({ recipes }) {
  const [selected, setSelected] = useState(null);
  const list = Array.isArray(recipes) ? recipes : [];
  if (list.length === 0) return null;

  return (
    <>
      <View style={styles.list}>
        {list.map((recipe) => (
          <RecipeCard
            key={`${recipe.url}-${recipe.title}`}
            recipe={recipe}
            onOpen={setSelected}
          />
        ))}
      </View>
      <RecipeDetailModal
        recipe={selected}
        visible={selected !== null}
        onClose={() => setSelected(null)}
      />
    </>
  );
}

export default memo(RecipeResultCards);

const styles = StyleSheet.create({
  list: {
    marginVertical: 6,
    gap: 8,
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 5,
    maxWidth: "100%",
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 21,
  },
  metaText: {
    fontSize: 13,
    opacity: 0.85,
  },
  summaryLine: {
    fontSize: 14,
    lineHeight: 20,
  },
  sectionLabel: {
    fontWeight: "700",
  },
  cardHint: {
    marginTop: 4,
    fontSize: 12,
    opacity: 0.8,
  },
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  modalSheet: {
    maxHeight: "86%",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    overflow: "hidden",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  modalHeaderText: {
    flex: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    lineHeight: 24,
  },
  closeText: {
    fontSize: 15,
    fontWeight: "700",
    paddingTop: 2,
  },
  modalContent: {
    padding: 16,
    paddingBottom: 32,
  },
  modalSection: {
    marginBottom: 14,
  },
  modalSectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 6,
  },
  modalRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 4,
    paddingRight: 8,
  },
  stepNumber: {
    width: 22,
    fontWeight: "700",
    textAlign: "right",
  },
  bullet: {
    width: 12,
  },
  modalRowText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 21,
  },
  whyText: {
    fontSize: 13,
    lineHeight: 18,
    opacity: 0.85,
    marginBottom: 14,
  },
  noSteps: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 14,
  },
  openButton: {
    marginTop: 6,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
  },
  openButtonText: {
    fontSize: 15,
    fontWeight: "800",
  },
});
