import * as SecureStore from "expo-secure-store";
import i18next from "i18next";
import {
  getLegacyStorageOwner,
  getUserSecureStorageKey,
} from "./storageKeys";

const { shouldClearLegacyOwnedData } = require("./legacyPurgePolicy.cjs");

const LEGACY_AI_API_KEY_STORAGE_KEY = "pantrio.customAiApiKey";
// This was the first per-provider key, but it was shared by every account on
// the device. It is now used only as a one-time migration source.
const LEGACY_AI_PROVIDER_SETTINGS_STORAGE_KEY = "pantrio.customAiApiKeys";
const LEGACY_AI_SETTINGS_QUARANTINE_KEY =
  "pantrio.legacyCustomAiQuarantine.v1";
const USER_AI_PROVIDER_SETTINGS_KEY_NAME = "customAiProviderSettings";

// Provider "slots" mirror the provider dropdown in Settings > Advanced.
// Preset slots own their endpoint from this constant; only the custom slot
// stores an arbitrary base URL as data. Credentials are stored per slot id
// instead of per base URL so switching the dropdown can never read or write
// the wrong provider's profile.
const AI_PROVIDER_SLOT_PRESET_URLS = Object.freeze({
  openai: "https://api.openai.com/v1",
  openrouter: "https://openrouter.ai/api/v1",
  groq: "https://api.groq.com/openai/v1",
  together: "https://api.together.xyz/v1",
});
const AI_PROVIDER_SLOT_IDS = new Set([
  ...Object.keys(AI_PROVIDER_SLOT_PRESET_URLS),
  "custom",
]);

let secureStoreOperation = Promise.resolve();

export function normalizeAiBaseUrl(baseUrl) {
  return String(baseUrl || "").trim().replace(/\/+$/, "");
}

export function providerPresetUrl(providerId) {
  return AI_PROVIDER_SLOT_PRESET_URLS[providerId] || null;
}

export function providerSlotIdFromBaseUrl(baseUrl) {
  const normalized = normalizeAiBaseUrl(baseUrl);
  for (const [slotId, presetUrl] of Object.entries(AI_PROVIDER_SLOT_PRESET_URLS)) {
    if (normalizeAiBaseUrl(presetUrl) === normalized) return slotId;
  }
  return normalized ? "custom" : "";
}

// Resolves the authoritative slot from either a stored aiProviderId or the
// legacy aiBaseUrl that older builds used as the source of truth.
export function resolveProviderSlotSelection(aiProviderId, aiBaseUrl) {
  if (
    typeof aiProviderId === "string" &&
    AI_PROVIDER_SLOT_IDS.has(aiProviderId)
  ) {
    return aiProviderId;
  }
  return providerSlotIdFromBaseUrl(aiBaseUrl) || "custom";
}

function withSecureStoreLock(operation) {
  const result = secureStoreOperation.then(operation, operation);
  secureStoreOperation = result.catch(() => {});
  return result;
}

function getSettingsStorageKey(uid) {
  return getUserSecureStorageKey(uid, USER_AI_PROVIDER_SETTINGS_KEY_NAME);
}

function parseProviderSettings(storedValue) {
  if (!storedValue) return {};

  try {
    const parsedValue = JSON.parse(storedValue);
    return parsedValue &&
      typeof parsedValue === "object" &&
      !Array.isArray(parsedValue)
      ? parsedValue
      : {};
  } catch {
    return {};
  }
}

async function getStoredProviderSettings(uid) {
  const storedValue = await SecureStore.getItemAsync(getSettingsStorageKey(uid));
  return parseProviderSettings(storedValue);
}

async function storeProviderSettings(uid, providerSettings) {
  const storageKey = getSettingsStorageKey(uid);

  if (Object.keys(providerSettings).length > 0) {
    await SecureStore.setItemAsync(storageKey, JSON.stringify(providerSettings));
  } else {
    await SecureStore.deleteItemAsync(storageKey);
  }
}

function recordHasContent(record) {
  return Boolean(
    record && (record.apiKey || record.model || record.baseUrl)
  );
}

function normalizeProviderSettings(
  value,
  { fallbackModel = "", fallbackBaseUrl = "" } = {}
) {
  if (typeof value === "string") {
    return {
      apiKey: value.trim(),
      model: String(fallbackModel || "").trim(),
      baseUrl: normalizeAiBaseUrl(fallbackBaseUrl),
    };
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return {
    apiKey: String(value.apiKey || "").trim(),
    model: String(value.model || fallbackModel || "").trim(),
    baseUrl:
      normalizeAiBaseUrl(value.baseUrl) || normalizeAiBaseUrl(fallbackBaseUrl),
  };
}

function profileToRecord(slotId, value, fallbackBaseUrl = "") {
  const normalized = normalizeProviderSettings(value, { fallbackBaseUrl });
  if (!normalized) return null;

  const record = {
    apiKey: normalized.apiKey,
    model: normalized.model,
  };
  if (slotId === "custom" && normalized.baseUrl) {
    record.baseUrl = normalized.baseUrl;
  }
  return recordHasContent(record) ? record : null;
}

// Converts the legacy URL-keyed map ({ normalizedBaseUrl: profile }) into the
// slot-keyed map ({ providerId: profile }). Idempotent: slot-shaped input is
// returned unchanged (only normalized).
function convertProviderSettingsToSlots(providerSettings) {
  const entries = Object.entries(providerSettings || {});
  if (entries.length === 0) return { slots: {}, changed: false };

  const alreadySlotShaped = entries.some(([key]) =>
    AI_PROVIDER_SLOT_IDS.has(key)
  );
  const slots = {};

  for (const [key, value] of entries) {
    if (alreadySlotShaped) {
      if (!AI_PROVIDER_SLOT_IDS.has(key)) continue;
      const record = profileToRecord(
        key,
        value,
        providerPresetUrl(key) || ""
      );
      if (record) slots[key] = record;
    } else {
      const slotId = providerSlotIdFromBaseUrl(key);
      if (!slotId) continue;
      const record = profileToRecord(
        slotId,
        value,
        providerPresetUrl(slotId) || key
      );
      if (record) slots[slotId] = record;
    }
  }

  return { slots, changed: !alreadySlotShaped };
}

async function readSlotRecords(uid) {
  const providerSettings = await getStoredProviderSettings(uid);
  const { slots, changed } = convertProviderSettingsToSlots(providerSettings);
  if (changed) {
    // Opportunistic one-time upgrade; reads still succeed if it cannot write.
    await storeProviderSettings(uid, slots).catch(() => {});
  }
  return slots;
}

async function migrateLegacyProviderSettingsUnlocked(
  uid,
  { baseUrl = "", fallbackModel = "" } = {}
) {
  const legacyOwnerUid = await getLegacyStorageOwner();
  const normalizedUid = String(uid || "").trim();
  const [legacyProviderValue, legacyApiKey] = await Promise.all([
    SecureStore.getItemAsync(LEGACY_AI_PROVIDER_SETTINGS_STORAGE_KEY),
    SecureStore.getItemAsync(LEGACY_AI_API_KEY_STORAGE_KEY),
  ]);

  if (!legacyOwnerUid) {
    // A global SecureStore value without an ownership marker is ambiguous.
    // Do not assign it to the next account or retain an unrecoverable secret.
    await Promise.all([
      SecureStore.deleteItemAsync(LEGACY_AI_PROVIDER_SETTINGS_STORAGE_KEY),
      SecureStore.deleteItemAsync(LEGACY_AI_API_KEY_STORAGE_KEY),
      SecureStore.deleteItemAsync(LEGACY_AI_SETTINGS_QUARANTINE_KEY),
    ]);
    return false;
  }

  if (legacyOwnerUid !== normalizedUid) return false;

  if (legacyProviderValue === null && legacyApiKey === null) return false;

  const slots = await readSlotRecords(uid);
  const legacyProviderSettings = parseProviderSettings(legacyProviderValue);
  const configuredSlotId = providerSlotIdFromBaseUrl(baseUrl);
  let changed = false;

  Object.entries(legacyProviderSettings).forEach(([legacyBaseUrl, value]) => {
    const slotId = providerSlotIdFromBaseUrl(legacyBaseUrl);
    if (!slotId || recordHasContent(slots[slotId])) return;

    const record = profileToRecord(
      slotId,
      value,
      slotId === configuredSlotId ? fallbackModel : ""
    );
    if (record) {
      slots[slotId] = record;
      changed = true;
    }
  });

  if (legacyApiKey && configuredSlotId && !recordHasContent(slots[configuredSlotId])) {
    slots[configuredSlotId] = {
      apiKey: legacyApiKey.trim(),
      model: String(fallbackModel || "").trim(),
      ...(configuredSlotId === "custom" ? { baseUrl: normalizeAiBaseUrl(baseUrl) } : {}),
    };
    changed = true;
  }

  if (changed) {
    await storeProviderSettings(uid, slots);
  }

  await Promise.all([
    SecureStore.deleteItemAsync(LEGACY_AI_PROVIDER_SETTINGS_STORAGE_KEY),
    SecureStore.deleteItemAsync(LEGACY_AI_API_KEY_STORAGE_KEY),
    SecureStore.deleteItemAsync(LEGACY_AI_SETTINGS_QUARANTINE_KEY),
  ]);

  return true;
}

export async function migrateLegacyCustomAiProviderSettings(
  uid,
  options = {}
) {
  return withSecureStoreLock(() =>
    migrateLegacyProviderSettingsUnlocked(uid, options)
  );
}

// One-time URL-keyed -> slot-keyed upgrade. Runs at startup after the
// advanced settings have been parsed so a custom URL that only lived in
// AsyncStorage can seed the custom slot.
export async function migrateProviderRecordsToSlots(uid, advanced = {}) {
  return withSecureStoreLock(async () => {
    const providerSettings = await getStoredProviderSettings(uid);
    const { slots, changed } = convertProviderSettingsToSlots(providerSettings);

    const advancedUrl = normalizeAiBaseUrl(advanced.aiBaseUrl || "");
    let seededCustom = false;
    if (
      advancedUrl &&
      providerSlotIdFromBaseUrl(advancedUrl) === "custom" &&
      !recordHasContent(slots.custom)
    ) {
      slots.custom = {
        baseUrl: advancedUrl,
        model: String(advanced.aiModel || "").trim(),
        apiKey: "",
      };
      seededCustom = true;
    }

    if (changed || seededCustom) {
      await storeProviderSettings(uid, slots);
    }
    return changed || seededCustom;
  });
}

// Slot API: callers identify a provider by dropdown slot id.
export async function getAiProviderSlotSettings(
  uid,
  providerId,
  { fallbackModel = "", fallbackBaseUrl = "" } = {}
) {
  const slotId = resolveProviderSlotSelection(providerId, fallbackBaseUrl);
  return withSecureStoreLock(async () => {
    const slots = await readSlotRecords(uid);
    const presetUrl = providerPresetUrl(slotId);
    const entry = slots[slotId];
    const normalized = normalizeProviderSettings(entry, {
      fallbackModel,
      fallbackBaseUrl: presetUrl || fallbackBaseUrl,
    });

    if (normalized) {
      return {
        apiKey: normalized.apiKey,
        model: normalized.model,
        baseUrl: slotId === "custom" ? normalized.baseUrl : presetUrl || "",
      };
    }
    return { apiKey: "", model: "", baseUrl: presetUrl || "" };
  });
}

export async function setAiProviderSlotSettings(
  uid,
  providerId,
  { baseUrl = "", apiKey = "", model = "" } = {}
) {
  const slotId = resolveProviderSlotSelection(providerId, baseUrl);
  if (!AI_PROVIDER_SLOT_IDS.has(slotId)) {
    throw new Error(i18next.t("errors.aiBaseUrlRequired"));
  }

  const nextSettings = {
    apiKey: String(apiKey || "").trim(),
    model: String(model || "").trim(),
  };
  if (slotId === "custom") {
    nextSettings.baseUrl = normalizeAiBaseUrl(baseUrl);
  }

  return withSecureStoreLock(async () => {
    const slots = await readSlotRecords(uid);
    if (nextSettings.apiKey || nextSettings.model || nextSettings.baseUrl) {
      slots[slotId] = nextSettings;
    } else {
      delete slots[slotId];
    }
    await storeProviderSettings(uid, slots);
  });
}

// Legacy URL-keyed shims -----------------------------------------------------
// Kept so existing callers (and the one-time global-key migration) continue
// to work. They translate the base URL into its owning slot and delegate.

export async function getCustomAiProviderSettings(
  uid,
  baseUrl,
  { migrateLegacy = false, fallbackModel = "" } = {}
) {
  const normalizedUrl = normalizeAiBaseUrl(baseUrl);
  if (!normalizedUrl) return { apiKey: "", model: "" };

  const slotId = providerSlotIdFromBaseUrl(normalizedUrl);
  if (migrateLegacy) {
    await migrateLegacyCustomAiProviderSettings(uid, {
      baseUrl: normalizedUrl,
      fallbackModel,
    });
  }

  const savedSettings = await getAiProviderSlotSettings(uid, slotId, {
    fallbackModel,
    fallbackBaseUrl: normalizedUrl,
  });
  return { apiKey: savedSettings.apiKey, model: savedSettings.model };
}

export async function setCustomAiProviderSettings(
  uid,
  baseUrl,
  { apiKey, model } = {}
) {
  const normalizedUrl = normalizeAiBaseUrl(baseUrl);
  if (!normalizedUrl) {
    throw new Error(i18next.t("errors.aiBaseUrlRequired"));
  }

  const slotId = providerSlotIdFromBaseUrl(normalizedUrl);
  return setAiProviderSlotSettings(uid, slotId, {
    baseUrl: normalizedUrl,
    apiKey,
    model,
  });
}

export async function clearCustomAiProviderSettings(uid) {
  return withSecureStoreLock(() =>
    SecureStore.deleteItemAsync(getSettingsStorageKey(uid))
  );
}

export async function clearLegacyCustomAiProviderQuarantine() {
  return withSecureStoreLock(() =>
    SecureStore.deleteItemAsync(LEGACY_AI_SETTINGS_QUARANTINE_KEY)
  );
}

export async function clearLegacyCustomAiProviderSettingsForUser(uid) {
  const normalizedUid = String(uid || "").trim();
  if (!normalizedUid) {
    throw new Error(i18next.t("errors.authenticatedUserRequired"));
  }

  return withSecureStoreLock(async () => {
    const ownerUid = await getLegacyStorageOwner();
    const keysToRemove = [LEGACY_AI_SETTINGS_QUARANTINE_KEY];
    if (shouldClearLegacyOwnedData(ownerUid, normalizedUid)) {
      keysToRemove.push(
        LEGACY_AI_PROVIDER_SETTINGS_STORAGE_KEY,
        LEGACY_AI_API_KEY_STORAGE_KEY
      );
    }
    await Promise.all(
      keysToRemove.map((key) => SecureStore.deleteItemAsync(key))
    );
    return keysToRemove.length;
  });
}
