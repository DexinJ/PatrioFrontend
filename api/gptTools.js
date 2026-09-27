// gptTools.js (FULL PASTE - updated)
// - Uses GlobalContext.inferFoodTypeLabelFromName + GlobalContext.streamlineLists (single source of truth)
// - Removes local inferFoodType rules completely
// - Keeps add/remove/find/get/propose tools
// - Adds defensive fallback if streamlineLists isn't wired yet

import { useContext } from "react";
import i18next from "i18next";
import { GlobalContext } from "../context/GlobalContext";
import {
  createFridgeProposalActionId,
  normalizeFridgeProposalCategories,
  normalizeFridgeProposalQuantity,
} from "../utils/fridgeProposal";
import {
  addDaysIso,
  normalizeShelfLifeDays,
} from "../utils/expiryPredictor";
import { normalizeRecipePreferencePatch } from "../utils/recipePreferences";
import {
  createBulkProposalActionId,
} from "../utils/bulkProposal";

// Compatibility guard for gateways that predate explicit client ownership and
// published the full mixed tool batch. New gateways send only client calls.
const SERVER_OWNED_TOOL_NAMES = new Set(["webSearch", "recommendRecipes"]);

export function isServerOwnedGPTTool(name) {
  return SERVER_OWNED_TOOL_NAMES.has(String(name || ""));
}

export function claimClientOwnedGPTToolCalls(
  toolCalls,
  { toolOwner = null, round = "legacy", claimedIds = new Set() } = {}
) {
  if (toolOwner && toolOwner !== "client") return [];
  return (Array.isArray(toolCalls) ? toolCalls : []).filter(
    (toolCall, index) => {
      const name = toolCall?.function?.name || toolCall?.name || "";
      if (isServerOwnedGPTTool(name)) return false;
      const id = toolCall?.id || toolCall?.tool_call_id || null;
      const claimKey = id || `${round}:${index}:${name}`;
      if (claimedIds.has(claimKey)) return false;
      claimedIds.add(claimKey);
      return true;
    }
  );
}

export function useGPTTools() {
  const {
    fridgeItems,
    shoppingListItems,
    addToFridge, // addToFridge(name, quantity, tagIds, expiresAt = null, expiresInDays)
    addToShoppingList, // addToShoppingList(name, quantity, tagIds)
    removeFromFridge,
    removeFromShoppingList,
    editFridgeItem,
    editShoppingListItem,
    setMessages,
    tags, // preset tags only

    // ✅ NEW from GlobalContext
    inferFoodTypeLabelFromName,
    streamlineLists: streamlineListsFromContext,
  } = useContext(GlobalContext);

  const norm = (s) => String(s || "").trim().toLowerCase();

  // -----------------------------
  // Categories normalization
  // -----------------------------
  // Preferred format:
  // categories = { storage: "Fridge", urgency: "Use soon", food_type: "Dairy", state?: "Opened" }
  //
  // Back-compat accepted (optional):
  // - array: ["Fridge","Use soon","Dairy"]
  // - string: "Fridge, Use soon, Dairy"
  const normalizeCategoriesToLabels = (categories) => {
    if (!categories) return [];

    // ✅ object form (preferred)
    if (typeof categories === "object" && !Array.isArray(categories)) {
      const { storage, urgency, food_type, state } = categories || {};
      return [storage, urgency, food_type, state]
        .map((x) => String(x || "").trim())
        .filter(Boolean);
    }

    // legacy array
    if (Array.isArray(categories)) {
      return categories.map((c) => String(c || "").trim()).filter(Boolean);
    }

    // legacy comma-separated string
    return String(categories)
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
  };

  // Validation results stay machine-readable: short codes plus the offending
  // fields, never English prose the model could paste back to the user.
  const categoryValidationError = (validation) => ({
    success: false,
    message: validation.message,
    ...(Array.isArray(validation.required)
      ? { required: validation.required }
      : {}),
    ...(Array.isArray(validation.missing) ? { missing: validation.missing } : {}),
  });

  // Validate the required typed keys when object is provided
  const validateTypedCategories = (categories) => {
    const required = ["storage", "urgency", "food_type"];
    if (!categories || typeof categories !== "object" || Array.isArray(categories)) {
      return { ok: false, message: "invalid_categories", required };
    }

    const missing = required.filter(
      (key) => !String(categories[key] || "").trim()
    );

    if (missing.length > 0) {
      return { ok: false, message: "missing_categories", missing, required };
    }

    return { ok: true };
  };

  // -----------------------------
  // Preset-only tag mapping
  // -----------------------------
  const categoryLabelToPresetTagId = (label) => {
    const c = String(label || "").trim();
    if (!c) return null;

    const cKey = norm(c).replace(/\s+/g, "_");

    const list = Array.isArray(tags) ? tags : [];

    const existing =
      list.find((t) => t?.key === cKey) || list.find((t) => norm(t?.label) === norm(c));

    return existing?.id || null;
  };

  const tagIdToLabel = (id) => {
    const list = Array.isArray(tags) ? tags : [];
    const t = list.find((x) => x?.id === id);
    return t?.label || null;
  };

  const categoriesToPresetTagIds = (categories) => {
    const labels = normalizeCategoriesToLabels(categories);
    const ids = labels.map(categoryLabelToPresetTagId).filter(Boolean);
    return Array.from(new Set(ids));
  };

  // Map a typed categories object ({storage, urgency, food_type, state?}) to
  // preset tag ids. Unlike categoriesToPresetTagIds this fails on any label
  // that cannot be resolved, so edits never silently wipe existing tags.
  const typedCategoriesToPresetTagIds = (categories) => {
    const order = ["storage", "urgency", "food_type", "state"];
    const ids = [];
    const missing = [];
    for (const key of order) {
      const raw = categories?.[key];
      if (raw === undefined || raw === null || String(raw).trim() === "") {
        continue;
      }
      const id = categoryLabelToPresetTagId(raw);
      if (id) ids.push(id);
      else missing.push(`${key}: "${String(raw).trim()}"`);
    }
    return { ok: missing.length === 0, ids: Array.from(new Set(ids)), missing };
  };

  // Labels that could not be mapped to a preset tag, returned as data rather
  // than as an English aside the model could repeat.
  const unmappedCategoryLabels = (categories, tagIds) => {
    const labels = normalizeCategoriesToLabels(categories);
    if (labels.length === 0 || tagIds.length > 0) return [];
    return labels;
  };

  // -----------------------------
  // Expiration helpers (tool-level validation)
  // -----------------------------
  const getItemTagLabels = (item) => {
    const ids = Array.isArray(item?.tagIds) ? item.tagIds : [];
    return ids.map(tagIdToLabel).filter(Boolean);
  };

  const withContextTagLabels = (items) =>
    (Array.isArray(items) ? items : []).map((item) => ({
      ...item,
      tagIds: Array.isArray(item?.tagIds) ? item.tagIds : [],
      tagLabels: getItemTagLabels(item),
    }));

  // Resolve a fridge item by id first, then by exact normalized name.
  const resolveFridgeItem = (target) => {
    const list = Array.isArray(fridgeItems) ? fridgeItems : [];
    const targetId = String(target?.id || "").trim();
    if (targetId) {
      const byId = list.find((item) => String(item?.id || "") === targetId);
      if (byId) return byId;
    }
    const targetName = norm(target?.name);
    if (targetName) {
      return list.find((item) => norm(item.name) === targetName) || null;
    }
    return null;
  };

  // Convert an AI whole-day estimate into an absolute ISO date the edit
  // pipeline can store. AI edit paths validate expiresInDays before calling
  // this, so the fallback is only for non-AI/internal callers.
  const resolveExpiryForEdit = ({ expiresInDays, fallback }) => {
    const days = normalizeShelfLifeDays(expiresInDays);
    if (days) return addDaysIso(new Date().toISOString(), days);
    return fallback;
  };

  // Human-readable summary line for one bulk change (used on the card).
  const summarizeBulkChange = (item, patch) => {
    const parts = [];
    if (patch.name !== undefined) {
      parts.push(`rename to "${patch.name}"`);
    }
    if (patch.quantity !== undefined) {
      parts.push(`quantity → ${patch.quantity}`);
    }
    if (patch.categories !== undefined) {
      const labels = normalizeCategoriesToLabels(patch.categories);
      parts.push(`categories → ${labels.join(", ")}`);
    }
    if (patch.expiresAt !== undefined) {
      parts.push(`expiry → ${String(patch.expiresAt).slice(0, 10)}`);
    }
    return parts.length
      ? `${item.name}: ${parts.join("; ")}`
      : `${item.name}: no changes`;
  };

  // -----------------------------
  // Tools
  // -----------------------------
  return {
    // Expiry is required: the AI always supplies a whole-day estimate and the
    // app anchors it at commit time.
    addFridgeItem: async ({
      name,
      quantity = "1",
      categories,
      expiresInDays,
    }) => {
      const n = String(name || "").trim();
      if (!n) return { success: false, message: "Missing item name." };

      const v = validateTypedCategories(categories);
      if (!v.ok) return categoryValidationError(v);

      const tagIds = categoriesToPresetTagIds(categories);
      const exDays = normalizeShelfLifeDays(expiresInDays);
      if (!exDays) {
        return {
          success: false,
          message:
            "Missing or invalid expiresInDays. Provide a positive whole-day shelf-life estimate.",
        };
      }

      addToFridge(n, String(quantity || "1"), tagIds, null, exDays);

      const expiryNote = `shelf life: ${exDays} day${exDays === 1 ? "" : "s"}`;
      const unmapped = unmappedCategoryLabels(categories, tagIds);

      return {
        success: true,
        message: `${quantity} ${n} added to fridge (${expiryNote}).`,
        ...(unmapped.length ? { ignoredCategories: unmapped } : {}),
      };
    },

    addShoppingItem: async ({ name, quantity = "1", categories }) => {
      const n = String(name || "").trim();
      if (!n) return { success: false, message: "Missing item name." };

      const v = validateTypedCategories(categories);
      if (!v.ok) return categoryValidationError(v);

      const tagIds = categoriesToPresetTagIds(categories);
      addToShoppingList(n, String(quantity || "1"), tagIds);
      const unmapped = unmappedCategoryLabels(categories, tagIds);

      return {
        success: true,
        message: `${quantity} ${n} added to shopping list.`,
        ...(unmapped.length ? { ignoredCategories: unmapped } : {}),
      };
    },

    removeFridgeItem: async ({ name }) => {
      const n = norm(name);
      if (!n) return { success: false, message: "Missing item name." };

      const item = (Array.isArray(fridgeItems) ? fridgeItems : []).find(
        (i) => norm(i.name) === n
      );
      if (item) {
        removeFromFridge(item.id);
        return { success: true, message: `${name} removed from fridge.` };
      }
      return { success: false, message: `${name} not found in fridge.` };
    },

    removeShoppingItem: async ({ name }) => {
      const n = norm(name);
      if (!n) return { success: false, message: "Missing item name." };

      const item = (Array.isArray(shoppingListItems) ? shoppingListItems : []).find(
        (i) => norm(i.name) === n
      );
      if (item) {
        removeFromShoppingList(item.id);
        return { success: true, message: `${name} removed from shopping list.` };
      }
      return { success: false, message: `${name} not found in shopping list.` };
    },

    // -----------------------------
    // ✅ Single-item edit (direct, low risk)
    // Resolves by id when the model has one (from getFridgeContents), else by
    // exact normalized name. Editing one item is easily corrected by the user,
    // so no confirmation card is required.
    // -----------------------------
    updateFridgeItem: async ({ id, name, updates = {} }) => {
      const item = resolveFridgeItem({ id, name });
      if (!item) {
        return {
          success: false,
          message: `${String(name || id || "item").trim()} not found in fridge.`,
        };
      }
      if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
        return { success: false, message: "updates must be an object." };
      }

      const patch = {};
      if (updates.name !== undefined) {
        const nextName = String(updates.name ?? "").trim();
        if (!nextName) {
          return { success: false, message: "Item name cannot be empty." };
        }
        patch.name = nextName;
      }
      if (updates.quantity !== undefined) {
        patch.quantity = String(updates.quantity ?? "").trim() || "1";
      }
      if (updates.categories !== undefined) {
        const mapped = typedCategoriesToPresetTagIds(updates.categories);
        if (!mapped.ok || mapped.ids.length === 0) {
          return {
            success: false,
            message: "invalid_categories",
            ...(Array.isArray(mapped.missing) && mapped.missing.length
              ? { invalid: mapped.missing }
              : {}),
          };
        }
        patch.tagIds = mapped.ids;
      }
      if (updates.expiresAt !== undefined) {
        return {
          success: false,
          message:
            "expiresAt is not supported; estimate whole days with expiresInDays instead.",
        };
      }
      const resolvedExpiry = resolveExpiryForEdit({
        expiresInDays: updates.expiresInDays,
        fallback: item.expiresAt ?? null,
      });
      if (!resolvedExpiry) {
        return {
          success: false,
          message:
            "Missing or invalid expiresInDays. Provide a positive whole-day shelf-life estimate.",
        };
      }
      patch.expiresAt = resolvedExpiry;

      if (Object.keys(patch).length === 0) {
        return { success: false, message: "No valid updates were provided." };
      }

      editFridgeItem(item.id, patch);

      const changed = Object.keys(patch)
        .map((key) => {
          if (key === "expiresAt") return "expiry";
          if (key === "tagIds") return "categories";
          return key;
        })
        .join(", ");
      return {
        success: true,
        message: `${item.name} updated (${changed}).`,
      };
    },

    // -----------------------------
    // ✅ Bulk fridge update (proposal card)
    // Shows one confirmation card with the proposed changes; nothing is
    // applied until the user confirms on the card.
    // -----------------------------
    proposeBulkFridgeUpdate: async ({ changes = [], title }) => {
      if (!Array.isArray(changes) || changes.length === 0) {
        return {
          ok: false,
          proposalShown: false,
          error: "No fridge changes were provided.",
        };
      }

      const safeChanges = [];
      const failures = [];
      for (const entry of changes.slice(0, 40)) {
        const target = entry && typeof entry === "object" ? entry : {};
        const item = resolveFridgeItem(target);
        if (!item) {
          failures.push(
            String(target?.name || target?.id || "unknown item").trim()
          );
          continue;
        }

        if (target.remove === true) {
          safeChanges.push({ id: item.id, name: item.name, remove: true });
          continue;
        }

        const update =
          target.update && typeof target.update === "object"
            ? target.update
            : {};
        const patch = {};
        if (update.name !== undefined) {
          const nextName = String(update.name ?? "").trim();
          if (nextName) patch.name = nextName;
        }
        if (update.quantity !== undefined) {
          patch.quantity = String(update.quantity ?? "").trim() || "1";
        }
        if (update.categories !== undefined) {
          const mapped = typedCategoriesToPresetTagIds(update.categories);
          if (!mapped.ok || mapped.ids.length === 0) {
            failures.push(
              `${item.name} (invalid categories: ${mapped.missing.join(", ")})`
            );
            continue;
          }
          patch.tagIds = mapped.ids;
        }
        if (update.expiresAt !== undefined) {
          failures.push(
            `${item.name} (expiresAt is not supported; use expiresInDays)`
          );
          continue;
        }
        const resolvedExpiry = resolveExpiryForEdit({
          expiresInDays: update.expiresInDays,
          fallback: item.expiresAt ?? null,
        });
        if (!resolvedExpiry) {
          failures.push(
            `${item.name} (missing or invalid expiresInDays)`
          );
          continue;
        }
        patch.expiresAt = resolvedExpiry;

        if (Object.keys(patch).length === 0) {
          failures.push(item.name);
          continue;
        }

        safeChanges.push({
          id: item.id,
          name: item.name,
          update: patch,
          summary: summarizeBulkChange(item, {
            ...patch,
            ...(update.categories !== undefined
              ? { categories: update.categories }
              : {}),
          }),
        });
      }

      if (safeChanges.length === 0) {
        return {
          ok: false,
          proposalShown: false,
          error: failures.length
            ? `Could not resolve or build changes for: ${failures.join(", ")}`
            : "No valid fridge changes were provided.",
        };
      }

      const actionId = createBulkProposalActionId();
      setMessages?.((prev) => [
        ...(Array.isArray(prev) ? prev : []),
        {
          id: actionId,
          role: "assistant",
          type: "ui_action",
          action: {
            kind: "bulk_fridge_update",
            actionId,
            status: "pending",
            title:
              typeof title === "string" && title.trim()
                ? title.trim().slice(0, 160)
                : i18next.t("messageList.reviewBulkChanges"),
            changes: safeChanges,
            ...(failures.length ? { skipped: failures.slice(0, 10) } : {}),
          },
        },
      ]);

      return {
        ok: true,
        proposalShown: true,
        committed: false,
        actionId,
        changeCount: safeChanges.length,
        ...(failures.length ? { skippedNames: failures.slice(0, 10) } : {}),
        message:
          "A confirmation card with the proposed fridge changes is shown to the user. Nothing was changed yet; the user must tap the card's button to confirm. Tell the user their changes are ready to review and ask them to confirm on the card.",
      };
    },

    // -----------------------------
    // ✅ streamlineLists tool
    // Delegates to GlobalContext.streamlineLists (single source of truth)
    //
    // Args:
    // - scope: "shopping" | "fridge" | "both"
    // - retag: boolean
    // - dryRun: boolean
    // -----------------------------
    streamlineLists: async ({ scope = "both", retag = true, dryRun = false } = {}) => {
      // Defensive fallback if context not updated yet
      if (typeof streamlineListsFromContext !== "function") {
        const wantShopping = scope === "shopping" || scope === "both";
        const wantFridge = scope === "fridge" || scope === "both";

        return {
          __context: true,
          scope,
          retag,
          dryRun,
          changed: { shopping: 0, fridge: 0, details: { shopping: [], fridge: [] } },
          items: {
            shopping: wantShopping
              ? (Array.isArray(shoppingListItems) ? shoppingListItems : []).map((it) => ({
                  id: it?.id,
                  name: String(it?.name ?? ""),
                  quantity: String(it?.quantity ?? ""),
                  tagIds: Array.isArray(it?.tagIds) ? it.tagIds : [],
                  tagLabels: getItemTagLabels(it),
                }))
              : [],
            fridge: wantFridge
              ? (Array.isArray(fridgeItems) ? fridgeItems : []).map((it) => ({
                  id: it?.id,
                  name: String(it?.name ?? ""),
                  quantity: String(it?.quantity ?? ""),
                  expiresAt: it?.expiresAt ?? null,
                  tagIds: Array.isArray(it?.tagIds) ? it.tagIds : [],
                  tagLabels: getItemTagLabels(it),
                }))
              : [],
          },
          warning: "unavailable",
        };
      }

      const res = streamlineListsFromContext({ scope, retag, dryRun });

      // Optional: tiny debug note in chat when called via GPT and actually mutates
      if (!dryRun && (res?.changed?.shopping || res?.changed?.fridge)) {
        setMessages?.((prev) => [
          ...(Array.isArray(prev) ? prev : []),
          {
            role: "assistant",
            content: [
              {
                type: "output_text",
                text: i18next.t("messageList.streamlineSummary", {
                  count: (res.changed.shopping || 0) + (res.changed.fridge || 0),
                }),
              },
            ],
          },
        ]);
      }

      // Helpful snapshot of current lists
      const wantShopping = scope === "shopping" || scope === "both";
      const wantFridge = scope === "fridge" || scope === "both";

      const items = {
        shopping: wantShopping
          ? (Array.isArray(shoppingListItems) ? shoppingListItems : []).map((it) => ({
              id: it?.id,
              name: String(it?.name ?? ""),
              quantity: String(it?.quantity ?? ""),
              tagIds: Array.isArray(it?.tagIds) ? it.tagIds : [],
              tagLabels: getItemTagLabels(it),
            }))
          : [],
        fridge: wantFridge
          ? (Array.isArray(fridgeItems) ? fridgeItems : []).map((it) => ({
              id: it?.id,
              name: String(it?.name ?? ""),
              quantity: String(it?.quantity ?? ""),
              expiresAt: it?.expiresAt ?? null,
              tagIds: Array.isArray(it?.tagIds) ? it.tagIds : [],
              tagLabels: getItemTagLabels(it),
            }))
          : [],
      };

      return { __context: true, ...res, items };
    },

    // 🟡 Context-only tools
    findInFridge: async ({ name }) => {
      const n = norm(name);
      const item = (Array.isArray(fridgeItems) ? fridgeItems : []).find(
        (i) => norm(i.name) === n
      );
      const enriched = item
        ? { ...item, tagLabels: getItemTagLabels(item) }
        : null;
      return { __context: true, exists: !!item, ...(enriched || {}) };
    },

    findInShoppingList: async ({ name }) => {
      const n = norm(name);
      const item = (Array.isArray(shoppingListItems) ? shoppingListItems : []).find(
        (i) => norm(i.name) === n
      );
      const enriched = item
        ? { ...item, tagLabels: getItemTagLabels(item) }
        : null;
      return { __context: true, exists: !!item, ...(enriched || {}) };
    },

    getFridgeContents: async () => ({
      __context: true,
      items: withContextTagLabels(fridgeItems),
    }),
    getShoppingListContents: async () => ({
      __context: true,
      items: withContextTagLabels(shoppingListItems),
    }),

    proposeRecipePreferenceUpdate: async ({ patch, summary, operation }) => {
      const safePatch = normalizeRecipePreferencePatch(patch);
      const fields = Object.keys(safePatch);
      const safeOperation = ["merge", "remove", "replace"].includes(operation)
        ? operation
        : "merge";
      if (fields.length === 0) {
        return {
          ok: false,
          proposalShown: false,
          error: "No valid recipe preference changes were provided.",
        };
      }

      setMessages?.((previous) => [
        ...(Array.isArray(previous) ? previous : []),
        {
          role: "assistant",
          type: "ui_action",
          action: {
            kind: "recipe_preference_update",
            title: i18next.t("messageList.confirmPreferenceChanges"),
            summary:
              typeof summary === "string" ? summary.trim().slice(0, 160) : "",
            operation: safeOperation,
            patch: safePatch,
          },
        },
      ]);

      return {
        ok: true,
        proposalShown: true,
        operation: safeOperation,
        fields,
        message: "A confirmation card was shown to the user.",
      };
    },

    proposeAddAllToFridge: async ({ items, title }) => {
      const clean = (v) => String(v ?? "").trim();
      const safeTitle = typeof title === "string" ? title.trim() : "";
      const sourceItems = Array.isArray(items) ? items : [];

      const safeItems = sourceItems
        .map((it) => {
          const name = clean(it?.name);
          if (!name) return null;

          const expiresInDays = normalizeShelfLifeDays(
            it?.expiresInDays ??
              it?.expires_in_days ??
              it?.shelfLifeDays
          );
          if (!expiresInDays) return null;

          return {
            name,
            quantity: normalizeFridgeProposalQuantity(it?.quantity),
            categories: normalizeFridgeProposalCategories(it?.categories),

            // The AI always estimates shelf life in whole days; the app
            // anchors the date at commit time. Legacy aliases are tolerated
            // for old callers but never expose absolute dates in the schema.
            expiresInDays,
          };
        })
        .filter(Boolean);
    
      if (safeItems.length === 0) {
        return {
          ok: false,
          proposalShown: false,
          error: "No valid fridge items were provided. Every item requires a name, categories, and a valid expiresInDays.",
        };
      }

      if (safeItems.length !== sourceItems.length) {
        return {
          ok: false,
          proposalShown: false,
          error:
            "Every proposed fridge item requires a name, categories, and a valid expiresInDays.",
        };
      }

      const actionId = createFridgeProposalActionId();

      setMessages?.((prev) => [
        ...(Array.isArray(prev) ? prev : []),
        {
          id: actionId,
          role: "assistant",
          type: "ui_action",
          action: {
            kind: "add_all_to_fridge",
            actionId,
            status: "pending",
            title: safeTitle || i18next.t("messageList.addAllToFridge"),
            items: safeItems,
    
            // expiresInDays is REQUIRED and was validated above.
            requires: [],
          },
        },
      ]);
      return {
        ok: true,
        proposalShown: true,
        committed: false,
        actionId,
        itemCount: safeItems.length,
        message:
          "The add-to-fridge confirmation card is shown to the user. No items have been added to the fridge yet; the user must tap the card's button to confirm. Tell the user their items are ready to review and ask them to confirm on the card. Never say items were added or that the fridge was updated until the user confirms.",
      };
    },
    
  };
}
