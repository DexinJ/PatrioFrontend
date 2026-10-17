import { router, useLocalSearchParams, useNavigation } from "expo-router";
import React, { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, SectionList, StyleSheet, Text, View } from "react-native";
import { useGpt } from "../../api/gpt";
import ActionGridPopover from "../../components/ActionGridPopover";
import FilterTabsRow from "../../components/FilterTabsRow";
import FridgeAddMenu from "../../components/FridgeAddMenu";
import { HeaderWithButton } from "../../components/Header";
import InventoryListItem from "../../components/InventoryListItem";
import ItemFormModal from "../../components/ItemFormModal";
import SearchAndSortBar from "../../components/SearchAndSortBar";
import SectionHeaderPill from "../../components/SectionHeaderPill";
import SelectionActionBar from "../../components/SelectionActionBar";
import SortSheetModal from "../../components/SortSheetModal";
import TutorialTarget from "../../components/TutorialTarget";
import { GlobalContext } from "../../context/GlobalContext";
import { useTabTutorial } from "../../context/TabTutorialContext";
import useAiDisclosureGate from "../../hooks/useAiDisclosureGate";
import usePhotoCapture from "../../hooks/usePhotoCapture";
import { buildTagMaps, makeGetTagLabelByType, makeLabelToTagId, makeLabelsFromTagIds } from "../../utils/itemTagLabels";
import { joinList } from "../../utils/localeList.js";
import { shouldRevealMenu } from "../../utils/tabTutorials";
import {
  TUTORIAL_ITEMS_NOTICE_KEY,
  buildTutorialFridgeItems,
  isTutorialSampleId,
  shouldShowTabSamples,
} from "../../utils/tutorialSamples";

const norm = (s) => String(s || "").trim().toLowerCase();

export default function FridgeScreen() {
  const { t } = useTranslation();
  const {
    fridgeItems,
    addToFridge,
    addManyToShoppingList,
    removeManyFromFridge,
    editFridgeItem,
    theme,
    settings,
    tags,

    // global expiration helpers
    ALMOST_EXPIRE_DAYS,
    getExpiryMeta,
  } = useContext(GlobalContext);

  const fontSize = settings?.ux?.fontSize || 16;
  const navigation = useNavigation();
  const { streamMessage } = useGpt();
  const { currentStep, isActive, activeTabKey } = useTabTutorial();
  // Two actions on this screen reach a model (the recipe request and a photo), so
  // both ask the same gate the chat composer uses: see hooks/useAiDisclosureGate.
  const aiGate = useAiDisclosureGate();

  const SORT_ITEMS = useMemo(
    () => [
      { label: t("fridge.sortAdded"), value: "added" },
      { label: t("fridge.sortName"), value: "name" },
      { label: t("fridge.sortUrgency"), value: "urgency" },
      { label: t("fridge.sortStorage"), value: "storage" },
      { label: t("fridge.sortFoodType"), value: "food_type" },
    ],
    [t]
  );

  // UI state
  const [editMode, setEditMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("All");

  const [sortSheetVisible, setSortSheetVisible] = useState(false);
  const [sortKey, setSortKey] = useState("added");
  const [sortDir, setSortDir] = useState("desc");

  const [addModalVisible, setAddModalVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editItem, setEditItem] = useState(null);

  // Reminder-tap focus: the item to reveal, and the list that shows it.
  const { focusItemId, focusNonce } = useLocalSearchParams();
  const [focusHighlightId, setFocusHighlightId] = useState(null);
  const [handledFocusKey, setHandledFocusKey] = useState("");
  const [pendingScrollId, setPendingScrollId] = useState(null);
  const listRef = useRef(null);

  // context menu (long press)
  const [contextItem, setContextItem] = useState(null);
  const [contextMenuVisible, setContextMenuVisible] = useState(false);
  const [contextFromRect, setContextFromRect] = useState(null);
  const pendingEditRef = useRef(null);
  const mountedRef = useRef(false);
  const recipeBusyRef = useRef(false);
  const recipeGenerationRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      recipeGenerationRef.current += 1;
      recipeBusyRef.current = false;
    };
  }, []);

  // ---- Tag helpers (from utils) ----
  const { tagById, tagIdByKey } = useMemo(() => buildTagMaps(tags || []), [tags]);
  const labelToTagId = useMemo(() => makeLabelToTagId(tagIdByKey), [tagIdByKey]);
  const labelsFromTagIds = useMemo(() => makeLabelsFromTagIds(tagById), [tagById]);
  const getTagLabelByType = useMemo(() => makeGetTagLabelByType(tagById), [tagById]);

  // The first-run tour can land on an account that has no items yet. Without
  // something on screen, the item steps point at nothing, so a small labelled
  // sample set stands in for the real rows. It is render-only: see
  // utils/tutorialSamples.js for the contract.
  const showTutorialSamples = shouldShowTabSamples({
    isActive,
    activeTabKey,
    tabKey: "fridge",
    itemCount: fridgeItems.length,
  });
  const sourceItems = useMemo(
    () =>
      showTutorialSamples
        ? buildTutorialFridgeItems({ now: new Date(), labelToTagId, t })
        : fridgeItems,
    [showTutorialSamples, labelToTagId, t, fridgeItems]
  );

  // Header
  const toggleEditMode = useCallback(() => {
    setEditMode((prev) => {
      const next = !prev;
      if (next) {
        setContextMenuVisible(false);
        setContextFromRect(null);
        setContextItem(null);
      } else {
        setSelectedIds(new Set());
      }
      return next;
    });
  }, []);

  useLayoutEffect(() => {
    navigation.setOptions({
      header: () => (
        <TutorialTarget id="fridge.editButton">
          <HeaderWithButton
            title={t("fridge.title")}
            buttonLabel={editMode ? t("common.done") : t("fridge.edit")}
            onPress={toggleEditMode}
          />
        </TutorialTarget>
      ),
    });
  }, [navigation, editMode, toggleEditMode, t]);

  // Decorate items once
  const decoratedItems = useMemo(() => {
    return (sourceItems || []).map((it) => {
      const createdAtMs = it?.createdAt ? new Date(it.createdAt).getTime() : 0;

      const meta = getExpiryMeta
        ? getExpiryMeta(it?.expiresAt, ALMOST_EXPIRE_DAYS)
        : {
            expired: false,
            almostExpired: false,
            daysUntilExpire: null,
            expiresAtMs: it?.expiresAt ? new Date(it.expiresAt).getTime() : null,
          };

      const storageLabel = getTagLabelByType(it, "storage");
      const urgencyLabel = getTagLabelByType(it, "urgency");
      const foodTypeLabel = getTagLabelByType(it, "food_type");
      const stateLabel = getTagLabelByType(it, "state");

      return {
        ...it,
        _createdAtMs: Number.isFinite(createdAtMs) ? createdAtMs : 0,

        _expiresAtMs: Number.isFinite(meta?.expiresAtMs) ? meta.expiresAtMs : null,
        _expired: !!meta?.expired,
        _almostExpired: !!meta?.almostExpired,
        _daysUntilExpire: typeof meta?.daysUntilExpire === "number" ? meta.daysUntilExpire : null,

        _storageLabel: storageLabel,
        _urgencyLabel: urgencyLabel,
        _foodTypeLabel: foodTypeLabel,
        _stateLabel: stateLabel,
        _nameNorm: norm(it?.name),
      };
    });
  }, [sourceItems, getExpiryMeta, ALMOST_EXPIRE_DAYS, getTagLabelByType]);

  // Tabs + counts
  const tabDefs = useMemo(() => {
    const counts = { All: decoratedItems.length, Fridge: 0, Freezer: 0, Pantry: 0 };
    for (const it of decoratedItems) {
      const s = it._storageLabel;
      if (counts[s] !== undefined) counts[s] += 1;
    }
    return [
      { key: "All", label: t("fridge.all"), count: counts.All },
      { key: "Fridge", label: t("fridge.fridge"), count: counts.Fridge },
      { key: "Freezer", label: t("fridge.freezer"), count: counts.Freezer },
      { key: "Pantry", label: t("fridge.pantry"), count: counts.Pantry },
    ];
  }, [decoratedItems, t]);

  // Filter by search + tab
  const filteredItems = useMemo(() => {
    const q = norm(search);
    return decoratedItems.filter((it) => {
      if (q && !it._nameNorm.includes(q)) return false;
      if (activeTab === "All") return true;
      return norm(it._storageLabel) === norm(activeTab);
    });
  }, [decoratedItems, search, activeTab]);

  const expiredItems = useMemo(() => filteredItems.filter((it) => it._expired), [filteredItems]);
  const almostExpiredItems = useMemo(
    () => filteredItems.filter((it) => !it._expired && it._almostExpired),
    [filteredItems]
  );
  const nonExpiredItems = useMemo(
    () => filteredItems.filter((it) => !it._expired && !it._almostExpired),
    [filteredItems]
  );

  const urgencyRank = useCallback((label) => {
    switch (norm(label)) {
      case "eat first":
        return 0;
      case "use soon":
        return 1;
      case "lasts a while":
        return 2;
      case "long keeper":
        return 3;
      default:
        return 99;
    }
  }, []);

  const storageRank = useCallback((label) => {
    switch (norm(label)) {
      case "fridge":
        return 0;
      case "freezer":
        return 1;
      case "pantry":
        return 2;
      default:
        return 99;
    }
  }, []);

  // Sort (non-expired)
  const sortedItems = useMemo(() => {
    const arr = [...nonExpiredItems];
    arr.sort((a, b) => {
      let cmp = 0;

      switch (sortKey) {
        case "name":
          cmp = a._nameNorm.localeCompare(b._nameNorm);
          break;
        case "urgency":
          cmp = urgencyRank(a._urgencyLabel) - urgencyRank(b._urgencyLabel);
          break;
        case "storage":
          cmp = storageRank(a._storageLabel) - storageRank(b._storageLabel);
          break;
        case "food_type":
          cmp = norm(a._foodTypeLabel).localeCompare(norm(b._foodTypeLabel));
          break;
        case "added":
        default:
          cmp = a._createdAtMs - b._createdAtMs;
          if (cmp === 0) cmp = String(a?.id || "").localeCompare(String(b?.id || ""));
          break;
      }

      if (sortDir === "desc") cmp *= -1;

      if (cmp === 0) cmp = a._nameNorm.localeCompare(b._nameNorm);
      if (cmp === 0) cmp = String(a?.id || "").localeCompare(String(b?.id || ""));
      return cmp;
    });

    return arr;
  }, [nonExpiredItems, sortKey, sortDir, urgencyRank, storageRank]);

  // Sections (expired + expiring soon + items)
  const fridgeSections = useMemo(() => {
    const out = [];
    const hasAlerts = expiredItems.length > 0 || almostExpiredItems.length > 0;

    if (expiredItems.length > 0)
      out.push({ title: t("fridge.expired"), tone: "danger", data: expiredItems });
    if (almostExpiredItems.length > 0)
      out.push({
        title: t("fridge.expiringSoon"),
        tone: "warning",
        data: almostExpiredItems,
      });
    if (sortedItems.length > 0)
      out.push({
        title: hasAlerts ? t("fridge.items") : "",
        tone: "neutral",
        data: sortedItems,
      });

    return out;
  }, [expiredItems, almostExpiredItems, sortedItems, t]);

  // A tapped expiration reminder arrives as route params. The request is
  // accepted during render rather than from an effect: this repo lints against
  // setState in an effect body, and React documents the render-phase form as
  // the way to adjust state when a prop changes.
  //
  // It is accepted only once the item exists, so a tap that arrives while the
  // storage is still settling is picked up by a later render. An item that was
  // deleted simply never matches.
  const focusKey =
    typeof focusItemId === "string" && focusItemId
      ? `${focusItemId}:${focusNonce || ""}`
      : "";
  if (focusKey && focusKey !== handledFocusKey) {
    if (decoratedItems.some((it) => it.id === focusItemId)) {
      setHandledFocusKey(focusKey);
      setPendingScrollId(focusItemId);
      // The row can be hidden by the search box or the storage tabs, and edit
      // mode would turn it into a checkbox: clear all three before showing it.
      setEditMode(false);
      setSelectedIds(new Set());
      setSearch("");
      setActiveTab("All");
      setFocusHighlightId(focusItemId);
    }
  }

  // Scrolled from its own effect, after the filters above have rebuilt the
  // sections: clearing them is what changes this dependency. Best effort by
  // design - SectionList throws for a section it has not measured yet, and the
  // row is on screen either way once the filters are gone.
  useEffect(() => {
    if (!pendingScrollId) return;

    const sectionIndex = fridgeSections.findIndex((section) =>
      section.data.some((it) => it.id === pendingScrollId)
    );
    if (sectionIndex < 0) return;
    const itemIndex = fridgeSections[sectionIndex].data.findIndex(
      (it) => it.id === pendingScrollId
    );

    const scrollTimeoutId = setTimeout(() => {
      setPendingScrollId(null);
      try {
        listRef.current?.scrollToLocation({
          sectionIndex,
          itemIndex,
          viewPosition: 0.5,
          animated: true,
        });
      } catch {
        // Not measured yet; the highlight still marks the row.
      }
    }, 60);

    return () => clearTimeout(scrollTimeoutId);
  }, [fridgeSections, pendingScrollId]);

  // The highlight is a moment, not a mode.
  useEffect(() => {
    if (!focusHighlightId) return;
    const highlightTimeoutId = setTimeout(
      () => setFocusHighlightId(null),
      2600
    );
    return () => clearTimeout(highlightTimeoutId);
  }, [focusHighlightId]);

  // Selection helpers
  const toggleSelect = useCallback((id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectedCount = selectedIds.size;

  // Samples flow through the same filtering pipeline as real rows, but must
  // never become selectable: "select all" has to stay about the user's data.
  const visibleIds = useMemo(
    () => filteredItems.filter((it) => !isTutorialSampleId(it.id)).map((it) => it.id),
    [filteredItems]
  );

  const selectAllVisible = useCallback(() => {
    setSelectedIds(new Set(visibleIds));
  }, [visibleIds]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const selectedItems = useMemo(() => {
    if (selectedIds.size === 0) return [];
    const byId = new Map((sortedItems || []).map((it) => [it.id, it]));
    for (const it of expiredItems) byId.set(it.id, it);
    for (const it of almostExpiredItems) byId.set(it.id, it);

    return Array.from(selectedIds)
      .map((id) => byId.get(id))
      .filter(Boolean);
  }, [selectedIds, sortedItems, expiredItems, almostExpiredItems]);

  // Recipes / ShopList / Delete / Edit
  const openRecipesForItems = useCallback(
    async (items) => {
      if (!items || items.length === 0 || recipeBusyRef.current) return;
      // Before any state is touched: an unacknowledged account is sent to the
      // disclosure card instead of to the model.
      if (!aiGate.ensure()) return;
      recipeBusyRef.current = true;
      const generation = recipeGenerationRef.current + 1;
      recipeGenerationRef.current = generation;

      const ingredientLines = items
        .map((it) => {
          const qty = String(it.quantity || "").trim();
          const name = String(it.name || "").trim();
          return `- ${qty ? `${qty} ` : ""}${name}`.trim();
        })
        .filter(Boolean)
        .join("\n");

      const ingredientNames = items
        .map((it) => String(it?.name || "").trim())
        .filter(Boolean);
      const displayText = ingredientNames.length
        ? t("fridge.findRecipesUsing", {
            items:
              joinList(ingredientNames.slice(0, 6)) +
              (ingredientNames.length > 6
                ? t("fridge.more", { count: ingredientNames.length - 6 })
                : ""),
          })
        : t("fridge.findRecipesWithItems");

      const prompt = t("fridge.findRecipesPrompt", {
        items: ingredientLines,
      });

      try {
        router.push("/chat");
        await streamMessage({
          text: prompt,
          displayText,
          uiAction: "findRecipes",
          selectedIngredients: items,
        });
      } catch (e) {
        if (
          e?.code !== "REQUEST_CANCELLED" &&
          mountedRef.current &&
          recipeGenerationRef.current === generation
        ) {
          Alert.alert(
            t("fridge.recipes"),
            e?.message || t("fridge.recipeGenerationFailed")
          );
        }
      } finally {
        if (recipeGenerationRef.current === generation) {
          recipeBusyRef.current = false;
        }
      }
    },
    [aiGate, streamMessage, t]
  );

  // "Add from a photo": the same launch as openRecipesForItems - go to Chat,
  // send the real prompt with the image, and let the assistant propose items
  // through the existing add_all_to_fridge card. Deliberately no `uiAction`, so
  // the model actually reads the image instead of being handed a canned action.
  //
  // The capture is local but the request is not. The menu rows ask the gate
  // before opening the camera (see the FridgeAddMenu call below) so a blocked user
  // does not lose the shot; this second check is the last gate before the request
  // for any other route into `onCapture`.
  const handlePhotoCaptured = useCallback(
    async ({ imageUri, imageRequestUri }) => {
      if (!imageUri) return;
      if (!aiGate.ensure()) return;
      try {
        router.push("/chat");
        await streamMessage({
          text: t("fridge.photoPrompt"),
          displayText: t("fridge.photoDisplayText"),
          imageUri,
          imageRequestUri,
        });
      } catch (e) {
        if (e?.code !== "REQUEST_CANCELLED" && mountedRef.current) {
          Alert.alert(
            t("fridge.photoTitle"),
            e?.message || t("fridge.photoFailed")
          );
        }
      }
    },
    [aiGate, streamMessage, t]
  );

  const { busy: photoBusy, takePhoto, pickPhoto } = usePhotoCapture({
    onCapture: handlePhotoCaptured,
  });

  // The fridge tour reveals the add menu the same way the chat tour reveals
  // the attach menu.
  const revealAddMenu = isActive && shouldRevealMenu("fridge", currentStep?.id);

  const addItemsToShopList = useCallback(
    (items) => {
      if (!items || items.length === 0) return;
      addManyToShoppingList(items);
      Alert.alert(
        t("fridge.shopList"),
        t("fridge.addedToShoppingList", { count: items.length })
      );
    },
    [addManyToShoppingList, t]
  );

  const confirmDeleteItems = useCallback(
    (items) => {
      if (!items || items.length === 0) return;

      Alert.alert(
        t("fridge.deleteItems"),
        t("fridge.deleteItemsQuestion", { count: items.length }),
        [
          { text: t("common.cancel"), style: "cancel" },
          {
            text: t("common.delete"),
            style: "destructive",
            onPress: () => {
              removeManyFromFridge(items.map((item) => item.id));
              setSelectedIds(new Set());
              setContextMenuVisible(false);
              setContextFromRect(null);
              setContextItem(null);
            },
          },
        ]
      );
    },
    [removeManyFromFridge, t]
  );

  const openEditForItem = useCallback((item) => {
    if (!item) return;
    setEditItem(item);
    setEditModalVisible(true);
  }, []);

  // Context menu actions
  const contextActions = useMemo(
    () => [
      {
        key: "recipes",
        icon: "search",
        label: t("fridge.recipes"),
        onPress: () => {
          setContextMenuVisible(false);
          openRecipesForItems(contextItem ? [contextItem] : []);
        },
      },
      {
        key: "shop",
        icon: "cart",
        label: t("fridge.shopList"),
        onPress: () => {
          setContextMenuVisible(false);
          addItemsToShopList(contextItem ? [contextItem] : []);
        },
      },
      {
        key: "edit",
        icon: "pencil",
        label: t("common.edit"),
        onPress: () => {
          // open edit AFTER popover closes (prevents “double overlay” weirdness)
          pendingEditRef.current = contextItem;
          setContextMenuVisible(false);
        },
      },
      {
        key: "delete",
        icon: "trash",
        label: t("common.delete"),
        danger: true,
        onPress: () => confirmDeleteItems(contextItem ? [contextItem] : []),
      },
    ],
    [contextItem, openRecipesForItems, addItemsToShopList, confirmDeleteItems, t]
  );

  // Bottom bar actions (edit mode)
  const bottomActions = useMemo(
    () => [
      {
        key: "recipes",
        icon: "search",
        label: t("fridge.recipes"),
        onPress: () => openRecipesForItems(selectedItems),
      },
      {
        key: "shop",
        icon: "cart",
        label: t("fridge.shopList"),
        onPress: () => addItemsToShopList(selectedItems),
      },
      {
        key: "edit",
        icon: "pencil",
        label: t("common.edit"),
        onPress: () => {
          if (selectedItems.length !== 1) {
            Alert.alert(t("fridge.editTitle"), t("fridge.selectOneToEdit"));
            return;
          }
          openEditForItem(selectedItems[0]);
        },
      },
      {
        key: "delete",
        icon: "trash",
        label: t("common.delete"),
        danger: true,
        onPress: () => confirmDeleteItems(selectedItems),
      },
    ],
    [
      selectedItems,
      openRecipesForItems,
      addItemsToShopList,
      openEditForItem,
      confirmDeleteItems,
      t,
    ]
  );

  const handleMeasuredLongPress = useCallback((rect, item) => {
    if (editMode) return;
    setContextItem(item);
    setContextFromRect(rect);
    setContextMenuVisible(true);
  }, [editMode]);

  // render item with extracted component
  const renderItem = useCallback(
    ({ item, index, section }) => (
      <InventoryListItem
        item={item}
        theme={theme}
        fontSize={fontSize}
        editMode={editMode}
        highlighted={item.id === focusHighlightId}
        selected={selectedIds.has(item.id)}
        onToggleSelect={toggleSelect}
        onMeasuredLongPress={handleMeasuredLongPress}
        tutorialTargetId={
          section === fridgeSections[0] && index === 0
            ? "fridge.items.first"
            : undefined
        }
      />
    ),
    [
      theme,
      fontSize,
      editMode,
      focusHighlightId,
      selectedIds,
      toggleSelect,
      handleMeasuredLongPress,
      fridgeSections,
    ]
  );

  const emptyText =
    sourceItems.length === 0
      ? t("fridge.emptyFridge")
      : t("fridge.noMatches");

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Top controls */}
      <View style={styles.topBlock}>
        <TutorialTarget id="fridge.searchBar">
          <SearchAndSortBar
            search={search}
            onChangeSearch={setSearch}
            onPressSort={() => setSortSheetVisible(true)}
            theme={theme}
            fontSize={fontSize}
            placeholder={t("fridge.searchPlaceholder")}
          />
        </TutorialTarget>

        <TutorialTarget id="fridge.filterTabs" style={{ marginTop: 10 }}>
          <FilterTabsRow
            tabs={tabDefs}
            activeKey={activeTab}
            onChange={setActiveTab}
            theme={theme}
            fontSize={fontSize}
          />
        </TutorialTarget>
      </View>

      {/* List */}
      <TutorialTarget id="fridge.items" style={styles.listWrap}>
        {showTutorialSamples ? (
          <Text
            style={[
              styles.sampleNotice,
              {
                fontSize: Math.max(12, fontSize * 0.8),
                color: theme.textSecondary,
              },
            ]}
          >
            {t(TUTORIAL_ITEMS_NOTICE_KEY)}
          </Text>
        ) : null}
        {fridgeSections.length === 0 ? (
          <Text style={[styles.empty, { fontSize, color: theme.textSecondary }]}>{emptyText}</Text>
        ) : (
          <SectionList
            ref={listRef}
            sections={fridgeSections}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            stickySectionHeadersEnabled
            renderSectionHeader={({ section }) => {
              if (!section.title) return null;
              const isExpired = section.tone === "danger";
              const isAlmost = section.tone === "warning";
              const count = isExpired
                ? expiredItems.length
                : isAlmost
                  ? almostExpiredItems.length
                  : undefined;

              return (
                <SectionHeaderPill
                  title={section.title}
                  count={typeof count === "number" ? count : undefined}
                  tone={isExpired ? "danger" : isAlmost ? "warning" : "neutral"}
                  theme={theme}
                  fontSize={fontSize}
                />
              );
            }}
            contentContainerStyle={[
              styles.list,
              { paddingBottom: editMode ? 170 : 110, backgroundColor: theme.background },
            ]}
            keyboardShouldPersistTaps="handled"
            initialNumToRender={12}
            windowSize={7}
            removeClippedSubviews={false}
            maxToRenderPerBatch={12}
            updateCellsBatchingPeriod={50}
            extraData={{ editMode, selectedCount, focusHighlightId }}
          />
        )}
      </TutorialTarget>

      {/* Add control: + button and its menu */}
      <FridgeAddMenu
        disabled={editMode}
        busy={photoBusy}
        revealOptions={revealAddMenu}
        // Gate before the camera opens: the photo is only useful once the
        // disclosure is acknowledged, and a refusal after the shot would waste it.
        onTakePhoto={() => {
          if (aiGate.ensure()) takePhoto();
        }}
        onPickPhoto={() => {
          if (aiGate.ensure()) pickPhoto();
        }}
        onAddManually={() => setAddModalVisible(true)}
      />

      {/* Sort sheet */}
      <SortSheetModal
        visible={sortSheetVisible}
        onClose={() => setSortSheetVisible(false)}
        options={SORT_ITEMS}
        sortKey={sortKey}
        setSortKey={setSortKey}
        sortDir={sortDir}
        setSortDir={setSortDir}
        theme={theme}
        fontSize={fontSize}
        title={t("fridge.sortBy")}
      />

      {/* Add modal (merged form) */}
      <ItemFormModal
        visible={addModalVisible}
        mode="add"
        theme={theme}
        fontSize={fontSize}
        tags={tags || []}
        initialItem={null}
        labelsFromTagIds={labelsFromTagIds}
        labelToTagId={labelToTagId}
        onCancel={() => setAddModalVisible(false)}
        onSubmit={(payload) => {
          addToFridge(payload.name, payload.quantity, payload.tagIds, payload.expiresAt);
          setAddModalVisible(false);
        }}
      />

      {/* Edit modal (merged form) */}
      <ItemFormModal
        visible={editModalVisible}
        mode="edit"
        theme={theme}
        fontSize={fontSize}
        tags={tags || []}
        initialItem={
          editItem
            ? {
                id: editItem.id,
                name: editItem.name,
                quantity: editItem.quantity,
                tagIds: editItem.tagIds || [],
                expiresAt: editItem.expiresAt || null,
              }
            : null
        }
        labelsFromTagIds={labelsFromTagIds}
        labelToTagId={labelToTagId}
        onCancel={() => {
          setEditModalVisible(false);
          setEditItem(null);
        }}
        onSubmit={(payload) => {
          if (!payload?.id) return;
          editFridgeItem(payload.id, {
            name: payload.name,
            quantity: payload.quantity,
            tagIds: payload.tagIds,
            expiresAt: payload.expiresAt,
          });
          setEditModalVisible(false);
          setEditItem(null);
        }}
      />

      {/* Context menu */}
      <ActionGridPopover
        visible={!editMode && contextMenuVisible && !!contextFromRect}
        fromRect={contextFromRect}
        theme={theme}
        actions={contextActions}
        placement="top"
        onRequestClose={() => setContextMenuVisible(false)}
        onCloseComplete={() => {
          setContextFromRect(null);
          setContextItem(null);

          const pending = pendingEditRef.current;
          pendingEditRef.current = null;
          if (pending) openEditForItem(pending);
        }}
      />

      {/* Edit-mode bottom bar */}
      <SelectionActionBar
        visible={editMode}
        selectedCount={selectedCount}
        canSelectAll={visibleIds.length > 0}
        onSelectAll={selectAllVisible}
        onClear={clearSelection}
        actions={bottomActions}
        theme={theme}
        fontSize={fontSize}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBlock: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 8 },
  listWrap: { flex: 1 },
  empty: { textAlign: "center", marginTop: 20 },
  sampleNotice: { textAlign: "center", marginTop: 6, marginBottom: 2 },
  list: { paddingHorizontal: 14, paddingTop: 6 },
});
