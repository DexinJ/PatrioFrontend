import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  Pressable,
  StyleSheet,
  TextInput,
  Animated,
  Easing,
} from "react-native";
import MessageBubble from "./MessageBubble";
import { ChatContext, GlobalContext } from "../context/GlobalContext";
import DropDownPicker from "react-native-dropdown-picker";
import { useTranslation } from "react-i18next";
import {
  fridgeProposalActionKey,
  isFridgeProposalActionConsumed,
  normalizeFridgeProposalCategories,
  normalizeFridgeProposalQuantity,
} from "../utils/fridgeProposal";
import { translateTagLabel } from "../utils/tagTranslation";

function toDisplayText(value) {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

function safeAction(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
}

/**
 * Renders a UI action card inside the chat list.
 */
function ActionCard({ action, onPress }) {
  const { t } = useTranslation();
  const normalizedAction = safeAction(action);
  if (!normalizedAction) return null;

  if (normalizedAction.kind === "add_all_to_fridge") {
    const items = Array.isArray(normalizedAction.items)
      ? normalizedAction.items
      : [];
    const title =
      toDisplayText(normalizedAction.title) || t("messageList.addAllToFridge");
    const consumed = isFridgeProposalActionConsumed(normalizedAction);

    return (
      <View
        style={{
          padding: 12,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: "#ccc",
          marginVertical: 6,
        }}
      >
        <Text style={{ fontWeight: "600", marginBottom: 6 }}>
          {t("messageList.foundItems", { count: items.length })}
        </Text>

        {items.slice(0, 6).map((it, idx) => (
          <Text key={idx} style={{ marginBottom: 2 }}>
            • {toDisplayText(it?.name) || t("common.unnamed")}
            {toDisplayText(it?.quantity)
              ? ` — ${toDisplayText(it?.quantity)}`
              : ""}
          </Text>
        ))}
        {items.length > 6 ? (
          <Text style={{ marginTop: 4, opacity: 0.7 }}>
            {t("messageList.more", { count: items.length - 6 })}
          </Text>
        ) : null}

        <TouchableOpacity
          onPress={consumed ? undefined : onPress}
          disabled={consumed}
          accessibilityRole="button"
          accessibilityState={{ disabled: consumed }}
          style={{
            marginTop: 10,
            paddingVertical: 10,
            borderRadius: 10,
            alignItems: "center",
            borderWidth: 1,
            borderColor: "#333",
            opacity: consumed ? 0.55 : 1,
          }}
        >
          <Text style={{ fontWeight: "700" }}>
            {consumed ? t("messageList.addedToFridge") : title}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (normalizedAction.kind === "recipe_preference_update") {
    const patch = safeAction(normalizedAction.patch) || {};
    const operation = ["merge", "remove", "replace"].includes(
      normalizedAction.operation
    )
      ? normalizedAction.operation
      : "merge";
    const labels = {
      preferredCuisines: t("messageList.preferCuisines"),
      dislikedCuisines: t("messageList.avoidCuisines"),
      allergens: t("messageList.allergens"),
      dietaryPatterns: t("messageList.diet"),
      excludedIngredients: t("messageList.neverInclude"),
      dislikedIngredients: t("messageList.dislike"),
      preferredEnergy: t("messageList.mealStyle"),
      maxCaloriesPerServing: t("messageList.caloriesPerServing"),
      maxPrepMinutes: t("messageList.maximumTime"),
      defaultServings: t("messageList.defaultServings"),
    };
    const changes = Object.entries(patch).map(([key, value]) => {
      const displayValue = Array.isArray(value)
        ? value.join(", ") || t("messageList.noneValue")
        : value === null
          ? t("messageList.noLimit")
          : key === "maxPrepMinutes"
            ? t("messageList.minSuffix", { count: value })
            : String(value);
      return t("messageList.changeLine", {
        label: labels[key] || key,
        value: displayValue,
      });
    });

    return (
      <View
        style={{
          padding: 12,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: "#ccc",
          marginVertical: 6,
        }}
      >
        <Text style={{ fontWeight: "600", marginBottom: 6 }}>
          {toDisplayText(normalizedAction.summary) ||
            (operation === "remove"
              ? t("messageList.removePreferences")
              : operation === "replace"
                ? t("messageList.replacePreferences")
                : t("messageList.savePreferences"))}
        </Text>
        {changes.slice(0, 8).map((change) => (
          <Text key={change} style={{ marginBottom: 2 }}>
            • {change}
          </Text>
        ))}
        <TouchableOpacity
          onPress={onPress}
          style={{
            marginTop: 10,
            paddingVertical: 10,
            borderRadius: 10,
            alignItems: "center",
            borderWidth: 1,
            borderColor: "#333",
          }}
        >
          <Text style={{ fontWeight: "700" }}>
            {toDisplayText(normalizedAction.title) ||
              t("messageList.savePreferencesButton")}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return null;
}

function ItemsConfirmModal({ visible, action, onClose, onConfirm }) {
  const { t } = useTranslation();
  const { theme } = useContext(GlobalContext);

  const rawItems = Array.isArray(action?.items) ? action.items : [];
  const title = toDisplayText(action?.title) || t("messageList.confirmItems");

  const [draftItems, setDraftItems] = useState([]);
  const [expandedIdx, setExpandedIdx] = useState(null);

  const [openKey, setOpenKey] = useState(null);
  const isOpen = (key) => openKey === key;
  const setOpenFor = (key, nextOpen) => setOpenKey(nextOpen ? key : null);

  const [sheetH, setSheetH] = useState(0);
  const [translateY] = useState(() => new Animated.Value(9999));
  const offscreenY = sheetH ? sheetH + 40 : 9999;
  const [closing, setClosing] = useState(false);
  const mountedRef = useRef(false);
  const closingRef = useRef(false);
  const activeAnimationRef = useRef(null);
  const frameIdsRef = useRef(new Set());

  const cancelFrames = () => {
    for (const frameId of frameIdsRef.current) cancelAnimationFrame(frameId);
    frameIdsRef.current.clear();
  };

  const scheduleFrame = (callback) => {
    const frameId = requestAnimationFrame(() => {
      frameIdsRef.current.delete(frameId);
      if (mountedRef.current && visible) callback();
    });
    frameIdsRef.current.add(frameId);
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      closingRef.current = true;
      activeAnimationRef.current?.stop();
      activeAnimationRef.current = null;
      cancelFrames();
    };
  }, []);

  // ✅ auto-scroll helpers
  const scrollRef = useRef(null);
  const scrollContentRef = useRef(null); // <— NEW: container inside ScrollView
  const [scrollY, setScrollY] = useState(0);
  const [viewportH, setViewportH] = useState(0);

  // ✅ measure sticky footer so we scroll enough to reveal State picker too
  const [footerH, setFooterH] = useState(0);

  // ✅ NEW: "anchor at end of editor" refs
  const editorEndRefs = useRef({}); // idx -> ref

  const ensureEditorVisible = (idx) => {
    const anchor = editorEndRefs.current[idx];
    if (!anchor || !scrollContentRef.current || viewportH <= 0) return;

    const padding = 16; // small breathing room
    const visibleH = Math.max(0, viewportH - footerH - padding);
    if (visibleH <= 0) return;

    // measure anchor relative to scroll content, so y is in scroll coordinates
    anchor.measureLayout(
      scrollContentRef.current,
      (_x, y, _w, h) => {
        const anchorBottom = y + h + padding;
        const visibleBottom = scrollY + visibleH;

        if (anchorBottom > visibleBottom) {
          const targetY = Math.max(0, anchorBottom - visibleH);
          scrollRef.current?.scrollTo({ y: targetY, animated: true });
        }
      },
      () => {}
    );
  };

  const DEFAULT_CATEGORIES = useMemo(
    () => ({
      storage: "Fridge",
      urgency: "Use soon",
      food_type: "Prepared",
    }),
    []
  );

  const coerceCategories = (categories) =>
    normalizeFridgeProposalCategories(categories);

  const STORAGE_ITEMS = useMemo(
    () => [
      { label: translateTagLabel("Fridge", "storage"), value: "Fridge" },
      { label: translateTagLabel("Freezer", "storage"), value: "Freezer" },
      { label: translateTagLabel("Pantry", "storage"), value: "Pantry" },
    ],
    [t]
  );
  const URGENCY_ITEMS = useMemo(
    () => [
      { label: translateTagLabel("Eat first", "urgency"), value: "Eat first" },
      { label: translateTagLabel("Use soon", "urgency"), value: "Use soon" },
      {
        label: translateTagLabel("Lasts a while", "urgency"),
        value: "Lasts a while",
      },
      {
        label: translateTagLabel("Long keeper", "urgency"),
        value: "Long keeper",
      },
    ],
    [t]
  );
  const FOODTYPE_ITEMS = useMemo(
    () => [
      { label: translateTagLabel("Produce", "food_type"), value: "Produce" },
      { label: translateTagLabel("Dairy", "food_type"), value: "Dairy" },
      { label: translateTagLabel("Meat", "food_type"), value: "Meat" },
      { label: translateTagLabel("Seafood", "food_type"), value: "Seafood" },
      { label: translateTagLabel("Prepared", "food_type"), value: "Prepared" },
      { label: translateTagLabel("Condiments", "food_type"), value: "Condiments" },
      { label: translateTagLabel("Beverages", "food_type"), value: "Beverages" },
      { label: translateTagLabel("Snacks", "food_type"), value: "Snacks" },
      { label: translateTagLabel("Bakery", "food_type"), value: "Bakery" },
      { label: translateTagLabel("Frozen", "food_type"), value: "Frozen" },
    ],
    [t]
  );
  const STATE_ITEMS = useMemo(
    () => [
      { label: translateTagLabel("None", "state"), value: "" },
      { label: translateTagLabel("Opened", "state"), value: "Opened" },
      { label: translateTagLabel("Unopened", "state"), value: "Unopened" },
      { label: translateTagLabel("Raw", "state"), value: "Raw" },
      { label: translateTagLabel("Cooked", "state"), value: "Cooked" },
      { label: translateTagLabel("Cut", "state"), value: "Cut" },
      { label: translateTagLabel("Whole", "state"), value: "Whole" },
    ],
    [t]
  );

  const CHIP_COLORS = {
    storage: "#64B5F6",
    urgency: "#EF5350",
    food_type: "#66BB6A",
    state: "#FFB74D",
    default: "#9E9E9E",
  };

  useEffect(() => {
    if (visible && sheetH) {
      translateY.setValue(offscreenY);
      const animation = Animated.timing(translateY, {
        toValue: 0,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      });
      activeAnimationRef.current = animation;
      animation.start(() => {
        if (activeAnimationRef.current === animation) {
          activeAnimationRef.current = null;
        }
      });
    }
  }, [visible, sheetH, offscreenY, translateY]);

  /* eslint-disable react-hooks/set-state-in-effect -- The persistent confirmation sheet intentionally resets its draft when a new action opens. */
  useEffect(() => {
    if (!visible) {
      closingRef.current = false;
      cancelFrames();
      return;
    }

    closingRef.current = false;

    const seeded = rawItems.map((it) => ({
      ...(it && typeof it === "object" && !Array.isArray(it) ? it : {}),
      name: toDisplayText(it?.name),
      selected: true,
      quantity: normalizeFridgeProposalQuantity(it?.quantity),
      categories: coerceCategories(it?.categories),
    }));

    setDraftItems(seeded);
    setExpandedIdx(null);
    setOpenKey(null);

    editorEndRefs.current = {}; // ✅ reset anchors
    setScrollY(0);
    setFooterH(0);
  }, [visible, action]); // eslint-disable-line react-hooks/exhaustive-deps
  /* eslint-enable react-hooks/set-state-in-effect */

  const toggleSelected = (idx) => {
    setDraftItems((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, selected: !it.selected } : it))
    );
  };

  const updateQty = (idx, text) => {
    const quantity = String(text ?? "").slice(0, 80);
    setDraftItems((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, quantity } : it))
    );
  };

  const updateCategory = (idx, key, value) => {
    setDraftItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;
        const next = { ...(it.categories || DEFAULT_CATEGORIES), [key]: value };
        if (key === "state" && !String(value || "").trim()) {
          const { state, ...rest } = next;
          return { ...it, categories: rest };
        }
        return { ...it, categories: next };
      })
    );
  };

  const handleConfirm = () => {
    if (closingRef.current) return;

    const selectedItems = draftItems
      .filter((it) => it.selected)
      .map((it) => {
        const categories = coerceCategories(it.categories);
        return {
          ...it,
          quantity: normalizeFridgeProposalQuantity(it.quantity),
          categories,
        };
      });

    const updatedAction = { ...(safeAction(action) || {}), items: selectedItems };

    closingRef.current = true;
    setClosing(true);
    activeAnimationRef.current?.stop();
    const animation = Animated.timing(translateY, {
      toValue: offscreenY,
      duration: 220,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    });
    activeAnimationRef.current = animation;
    animation.start(({ finished }) => {
      if (activeAnimationRef.current === animation) {
        activeAnimationRef.current = null;
      }
      if (!finished || !mountedRef.current) return;
      closingRef.current = false;
      setClosing(false);
      onConfirm?.(updatedAction);
    });
  };

  const handleClose = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    setOpenKey(null);
    setExpandedIdx(null);
    activeAnimationRef.current?.stop();
    const animation = Animated.timing(translateY, {
      toValue: offscreenY,
      duration: 220,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    });
    activeAnimationRef.current = animation;
    animation.start(({ finished }) => {
      if (activeAnimationRef.current === animation) {
        activeAnimationRef.current = null;
      }
      if (!finished || !mountedRef.current) return;
      closingRef.current = false;
      setClosing(false);
      onClose?.();
    });
  };

  const selectedCount = draftItems.filter((it) => it.selected).length;

  const Chip = ({ label, color }) => (
    <View style={[styles.chip, { backgroundColor: color }]}>
      <Text style={styles.chipText}>{label}</Text>
    </View>
  );

  const SheetBg = theme?.card ?? "#fff";
  const Border = theme?.border ?? "#eee";
  const TextPrimary = theme?.textPrimary ?? "#111";
  const TextSecondary = theme?.textSecondary ?? "#666";
  const InputBg = theme?.inputBackground ?? "#fff";
  const InputText = theme?.inputText ?? "#111";

  return (
    <Modal
      visible={visible}
      animationType="none"
      transparent
      presentationStyle="overFullScreen"
      statusBarTranslucent
      onRequestClose={handleClose}
      onShow={() => setClosing(false)}
    >
      <View style={styles.modalRoot}>
        <Pressable style={styles.backdrop} onPress={handleClose} />

        <Animated.View
          onLayout={(e) => setSheetH(e.nativeEvent.layout.height)}
          style={[
            styles.sheet,
            { backgroundColor: SheetBg, borderTopColor: Border },
            { transform: [{ translateY }] },
          ]}
        >
          <View style={[styles.header, { borderBottomColor: Border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: TextPrimary }]}>{title}</Text>
              <Text style={{ marginTop: 2, opacity: 0.7, color: TextSecondary }}>
                {t("messageList.selectedCount", { count: selectedCount })}
              </Text>
            </View>

            <TouchableOpacity onPress={handleClose} style={{ padding: 8 }}>
              <Text style={{ fontWeight: "700", color: TextPrimary }}>
                {t("common.close")}
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.scrollContent}
            onLayout={(e) => setViewportH(e.nativeEvent.layout.height)}
            onScroll={(e) => setScrollY(e.nativeEvent.contentOffset.y)}
            scrollEventThrottle={16}
          >
            {/* ✅ NEW: measurable content container */}
            <View ref={scrollContentRef}>
              {draftItems.map((it, idx) => {
                const cats = coerceCategories(it.categories);
                const showEditor = expandedIdx === idx;

                return (
                  <View
                    key={`${it?.name ?? "item"}-${idx}`}
                    style={styles.itemBlock}
                  >
                    <View style={styles.itemRow}>
                      <TouchableOpacity
                        onPress={() => toggleSelected(idx)}
                        style={[styles.checkbox, it.selected && styles.checkboxChecked]}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: !!it.selected }}
                      >
                        {it.selected ? <Text style={styles.checkmark}>✓</Text> : null}
                      </TouchableOpacity>

                      <View style={{ flex: 1 }}>
                        <Text style={{ fontWeight: "700", color: TextPrimary }}>
                          {it?.name ?? t("common.unnamed")}
                        </Text>

                        <View style={styles.chipRow}>
                          <Chip
                            label={translateTagLabel(cats.storage, "storage")}
                            color={CHIP_COLORS.storage}
                          />
                          <Chip
                            label={translateTagLabel(cats.urgency, "urgency")}
                            color={CHIP_COLORS.urgency}
                          />
                          <Chip
                            label={translateTagLabel(cats.food_type, "food_type")}
                            color={CHIP_COLORS.food_type}
                          />
                          {cats.state ? (
                            <Chip
                              label={translateTagLabel(cats.state, "state")}
                              color={CHIP_COLORS.state}
                            />
                          ) : null}
                        </View>

                        <TouchableOpacity
                          onPress={() => {
                            setOpenKey(null);
                            setExpandedIdx((prev) => {
                              const next = prev === idx ? null : idx;

                              if (next === idx) {
                                // ✅ after render/layout, scroll using anchor
                                scheduleFrame(() => {
                                  scheduleFrame(() => ensureEditorVisible(idx));
                                });
                              }

                              return next;
                            });
                          }}
                          style={{ paddingVertical: 6, alignSelf: "flex-start" }}
                          disabled={!it.selected}
                        >
                          <Text
                            style={{
                              fontWeight: "800",
                              opacity: it.selected ? 1 : 0.4,
                              color: TextPrimary,
                            }}
                          >
                            {showEditor
                              ? t("messageList.hideTags")
                              : t("messageList.editTags")}
                          </Text>
                        </TouchableOpacity>
                      </View>

                      <View style={styles.qtyRow}>
                        <Text style={{ opacity: 0.75, marginRight: 8, color: TextSecondary }}>
                          {t("messageList.qty")}
                        </Text>
                        <TextInput
                          value={String(it?.quantity ?? "1")}
                          onChangeText={(t) => updateQty(idx, t)}
                          placeholder="1"
                          editable={it.selected}
                          style={[
                            styles.qtyInput,
                            { borderColor: Border, color: InputText, backgroundColor: InputBg },
                            !it.selected && { opacity: 0.4 },
                          ]}
                        />
                      </View>
                    </View>

                    {showEditor ? (
                      <View style={[styles.editor, { borderColor: Border }]}>
                        <Text style={[styles.editorLabel, { color: TextSecondary }]}>
                          {t("messageList.storageRequired")}
                        </Text>
                        <DropDownPicker
                          listMode="MODAL"
                          modalTitle={t("messageList.selectStorage")}
                          open={isOpen(`${idx}-storage`)}
                          value={cats.storage}
                          items={STORAGE_ITEMS}
                          setOpen={(v) => setOpenFor(`${idx}-storage`, v)}
                          onChangeValue={(v) => updateCategory(idx, "storage", v)}
                          searchable
                          searchPlaceholder={t("messageList.searchStorage")}
                          style={[styles.dd, { backgroundColor: InputBg, borderColor: Border }]}
                          textStyle={{ color: InputText }}
                        />

                        <Text style={[styles.editorLabel, { color: TextSecondary }]}>
                          {t("messageList.urgencyRequired")}
                        </Text>
                        <DropDownPicker
                          listMode="MODAL"
                          modalTitle={t("messageList.selectUrgency")}
                          open={isOpen(`${idx}-urgency`)}
                          value={cats.urgency}
                          items={URGENCY_ITEMS}
                          setOpen={(v) => setOpenFor(`${idx}-urgency`, v)}
                          onChangeValue={(v) => updateCategory(idx, "urgency", v)}
                          searchable
                          searchPlaceholder={t("messageList.searchUrgency")}
                          style={[styles.dd, { backgroundColor: InputBg, borderColor: Border }]}
                          textStyle={{ color: InputText }}
                        />

                        <Text style={[styles.editorLabel, { color: TextSecondary }]}>
                          {t("messageList.foodTypeRequired")}
                        </Text>
                        <DropDownPicker
                          listMode="MODAL"
                          modalTitle={t("messageList.selectFoodType")}
                          open={isOpen(`${idx}-food_type`)}
                          value={cats.food_type}
                          items={FOODTYPE_ITEMS}
                          setOpen={(v) => setOpenFor(`${idx}-food_type`, v)}
                          onChangeValue={(v) => updateCategory(idx, "food_type", v)}
                          searchable
                          searchPlaceholder={t("messageList.searchFoodTypes")}
                          style={[styles.dd, { backgroundColor: InputBg, borderColor: Border }]}
                          textStyle={{ color: InputText }}
                        />

                        <Text style={[styles.editorLabel, { color: TextSecondary }]}>
                          {t("messageList.stateOptional")}
                        </Text>
                        <DropDownPicker
                          listMode="MODAL"
                          modalTitle={t("messageList.selectState")}
                          open={isOpen(`${idx}-state`)}
                          value={cats.state ?? ""}
                          items={STATE_ITEMS}
                          setOpen={(v) => setOpenFor(`${idx}-state`, v)}
                          onChangeValue={(v) => updateCategory(idx, "state", v)}
                          searchable
                          searchPlaceholder={t("messageList.searchState")}
                          style={[styles.dd, { backgroundColor: InputBg, borderColor: Border }]}
                          textStyle={{ color: InputText }}
                        />

                        {/* ✅ NEW: anchor at the very end of the editor */}
                        <View
                          ref={(r) => {
                            if (r) editorEndRefs.current[idx] = r;
                            else delete editorEndRefs.current[idx];
                          }}
                          onLayout={() => {
                            // when the editor finishes laying out, ensure anchor is visible
                            scheduleFrame(() => ensureEditorVisible(idx));
                          }}
                          style={{ height: 1 }}
                        />
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          </ScrollView>

          <View
            style={[styles.footer, { borderTopColor: Border, backgroundColor: SheetBg }]}
            onLayout={(e) => setFooterH(e.nativeEvent.layout.height)}
          >
            <TouchableOpacity
              onPress={handleConfirm}
              style={[
                styles.confirmBtn,
                { borderColor: TextPrimary },
                (selectedCount === 0 || closing) && { opacity: 0.5 },
              ]}
              disabled={selectedCount === 0 || closing}
            >
              <Text style={{ fontWeight: "900", color: TextPrimary }}>
                {t("messageList.confirm", { count: selectedCount })}
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

function TypingIndicator({ theme }) {
  const [d1] = useState(() => new Animated.Value(0.2));
  const [d2] = useState(() => new Animated.Value(0.2));
  const [d3] = useState(() => new Animated.Value(0.2));

  useEffect(() => {
    const mk = (v, delay) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(v, { toValue: 1, duration: 250, useNativeDriver: true }),
          Animated.timing(v, { toValue: 0.2, duration: 250, useNativeDriver: true }),
          Animated.delay(250),
        ])
      );

    const a1 = mk(d1, 0);
    const a2 = mk(d2, 120);
    const a3 = mk(d3, 240);

    a1.start(); a2.start(); a3.start();
    return () => { a1.stop(); a2.stop(); a3.stop(); };
  }, [d1, d2, d3]);

  return (
    <View
      style={{
        alignSelf: "flex-start",
        marginVertical: 6,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 16,
        maxWidth: "75%",
        backgroundColor: theme?.card ?? "#eee",
        borderWidth: 1,
        borderColor: theme?.border ?? "#ddd",
      }}
    >
      <View style={{ flexDirection: "row", gap: 6 }}>
        <Animated.View
          style={{
            width: 6, height: 6, borderRadius: 3,
            backgroundColor: theme?.text ?? "#333",
            opacity: d1,
            transform: [{ translateY: d1.interpolate({ inputRange: [0.2, 1], outputRange: [2, -2] }) }],
          }}
        />
        <Animated.View
          style={{
            width: 6, height: 6, borderRadius: 3,
            backgroundColor: theme?.text ?? "#333",
            opacity: d2,
            transform: [{ translateY: d2.interpolate({ inputRange: [0.2, 1], outputRange: [2, -2] }) }],
          }}
        />
        <Animated.View
          style={{
            width: 6, height: 6, borderRadius: 3,
            backgroundColor: theme?.text ?? "#333",
            opacity: d3,
            transform: [{ translateY: d3.interpolate({ inputRange: [0.2, 1], outputRange: [2, -2] }) }],
          }}
        />
      </View>
    </View>
  );
}

export default function MessageList({ messages, onUiAction }) {
  const listRef = useRef(null);
  const scrollTimerRef = useRef(null);
  const { theme } = useContext(GlobalContext);
  const { waiting } = useContext(ChatContext);
  const [modalVisible, setModalVisible] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);

  const openActionModal = (action) => {
    if (isFridgeProposalActionConsumed(action)) return;
    setPendingAction(action);
    setModalVisible(true);
  };

  const closeActionModal = () => {
    setModalVisible(false);
    setPendingAction(null);
  };

  const confirmActionModal = (updatedAction) => {
    if (updatedAction) {
      try {
        Promise.resolve(onUiAction?.(updatedAction)).catch((error) => {
          console.error("Chat action failed:", error);
        });
      } catch (error) {
        console.error("Chat action failed:", error);
      }
    }
    closeActionModal();
  };

  useEffect(
    () => () => {
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    },
    []
  );

  const data = useMemo(() => {
    const sourceMessages = Array.isArray(messages) ? messages : [];
    const base = sourceMessages
      .filter((msg) => !toDisplayText(msg?.text).startsWith("[fromTool]"))
      .map((msg, index) => {
        const key =
          toDisplayText(msg?.id || msg?.requestId) ||
          `message-${index}-${toDisplayText(msg?.role)}-${toDisplayText(msg?.type)}`;

        if (msg?.type === "ui_action" && msg?.action) {
          const action = safeAction(msg.action);
          return {
            kind: "ui_action",
            action:
              action?.kind === "add_all_to_fridge"
                ? { ...action, actionKey: fridgeProposalActionKey(action) }
                : action,
            key,
          };
        }

        const contentText = Array.isArray(msg?.content)
          ? msg.content.find((part) => part?.text != null)?.text
          : msg?.content;
        const text = toDisplayText(contentText ?? msg?.text);

        const rawImageUri =
          msg?.imageUri ||
          msg?.content?.[0]?.image_url ||
          msg?.content?.[0]?.imageUri ||
          null;
        const imageUri = typeof rawImageUri === "string" ? rawImageUri : null;

        const isUser = msg?.role === "user";

        if (!text && !imageUri) return null;

        return { kind: "bubble", text, imageUri, isUser, key };
      })
      .filter(Boolean);

    if (waiting) base.push({ kind: "typing", key: "typing" });

    return base;
  }, [messages, waiting]);

  return (
    <>
      <FlatList
        ref={listRef}
        data={data}
        keyExtractor={(item) => item.key}
        renderItem={({ item }) => {
          if (item.kind === "ui_action") {
            const actionPress =
              item.action?.kind === "recipe_preference_update"
                ? () => onUiAction?.(item.action)
                : () => openActionModal(item.action);
            return <ActionCard action={item.action} onPress={actionPress} />;
          }
          if (item.kind === "typing") return <TypingIndicator theme={theme} />;
          return <MessageBubble text={item.text} imageUri={item.imageUri} isUser={item.isUser} />;
        }}
        contentContainerStyle={{ padding: 10, paddingBottom: 20 }}
        onContentSizeChange={() => {
          if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
          scrollTimerRef.current = setTimeout(() => {
            scrollTimerRef.current = null;
            listRef.current?.scrollToEnd({ animated: true });
          }, 150);
        }}
      />

      <ItemsConfirmModal
        visible={modalVisible}
        action={pendingAction}
        onClose={closeActionModal}
        onConfirm={confirmActionModal}
      />
    </>
  );
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.35)" },

  sheet: {
    height: "85%",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    overflow: "hidden",
    borderTopWidth: 1,
    paddingBottom: 0,
  },
  header: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  title: { fontSize: 16, fontWeight: "800" },

  scrollContent: { padding: 14, paddingBottom: 90 },

  itemBlock: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#333",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: { backgroundColor: "#333" },
  checkmark: { color: "#fff", fontWeight: "900", lineHeight: 18 },

  qtyRow: { flexDirection: "row", alignItems: "center" },
  qtyInput: {
    minWidth: 70,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderRadius: 10,
    textAlign: "center",
    fontWeight: "700",
  },

  chipRow: { flexDirection: "row", flexWrap: "wrap", marginTop: 6 },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginRight: 6,
    marginTop: 6,
  },
  chipText: { color: "#fff", fontWeight: "800", fontSize: 12 },

  editor: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  editorLabel: {
    marginTop: 6,
    marginBottom: 6,
    fontWeight: "700",
    opacity: 0.9,
  },
  dd: {
    borderWidth: 1,
    borderRadius: 10,
    minHeight: 44,
    marginBottom: 10,
  },

  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: 14,
    borderTopWidth: 1,
  },
  confirmBtn: {
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
  },
});
