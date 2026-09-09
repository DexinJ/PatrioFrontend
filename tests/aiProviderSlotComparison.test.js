import test from "node:test";
import assert from "node:assert/strict";

import {
  AI_PROVIDER_URLS,
  CUSTOM_AI_PROVIDER_ID,
  PRESET_PROVIDER_IDS,
  PROVIDER_IDS,
  DEFAULT_ADVANCED,
  normalizeBaseUrl,
  presetById,
  presetByUrl,
  deriveProviderIdFromUrl,
  validateCustomApiUrl,
  createMemoryBackend,
  OriginalUrlKeyedModel,
  SlotKeyedModel,
  migrateUrlKeyedProfilesToSlots,
  runUserFlow,
} from "../refactor/aiProviderSlotModel.js";

const OPENAI_URL = "https://api.openai.com/v1";
const CUSTOM_URL = "https://my-llm.example.com/v1";

// ------------------------- pure helper functions ---------------------------

test("normalizeBaseUrl trims whitespace and trailing slashes", () => {
  assert.equal(normalizeBaseUrl("  https://a.example/v1/  "), "https://a.example/v1");
  assert.equal(normalizeBaseUrl(""), "");
  assert.equal(normalizeBaseUrl(null), "");
});

test("preset lookup by id and by URL", () => {
  assert.equal(presetById("openai")?.url, OPENAI_URL);
  assert.equal(presetById("custom"), null);
  assert.equal(presetByUrl("https://openrouter.ai/api/v1/")?.id, "openrouter");
  assert.equal(presetByUrl(CUSTOM_URL), null);
});

test("deriveProviderIdFromUrl maps presets and falls back to custom", () => {
  assert.equal(deriveProviderIdFromUrl(OPENAI_URL), "openai");
  assert.equal(deriveProviderIdFromUrl("https://openrouter.ai/api/v1/"), "openrouter");
  assert.equal(deriveProviderIdFromUrl(CUSTOM_URL), CUSTOM_AI_PROVIDER_ID);
  assert.equal(deriveProviderIdFromUrl(""), CUSTOM_AI_PROVIDER_ID);
});

test("validateCustomApiUrl accepts HTTPS and local dev HTTP only", () => {
  assert.equal(validateCustomApiUrl(CUSTOM_URL), null);
  assert.equal(validateCustomApiUrl("http://localhost:11434/v1"), null);
  assert.equal(validateCustomApiUrl("http://127.0.0.1:8080/v1"), null);
  assert.equal(validateCustomApiUrl("http://192.168.1.10:8080/v1"), "must be HTTPS (or http://localhost in development)");
  assert.equal(validateCustomApiUrl("https://a.example/v1?x=1"), "URL contains query or fragment");
  assert.equal(validateCustomApiUrl("https://user:pw@a.example/v1"), "URL contains credentials");
  assert.equal(validateCustomApiUrl("not a url"), "invalid URL");
  assert.equal(validateCustomApiUrl(""), "empty URL");
});

test("createMemoryBackend round-trips JSON and supports deletion", () => {
  const backend = createMemoryBackend();
  backend.writeJson("k", { a: 1 });
  assert.deepEqual(backend.readJson("k"), { a: 1 });
  backend.deleteKey("k");
  assert.equal(backend.readJson("k"), null);
  backend.writeJson("k2", { b: 2 });
  assert.deepEqual(backend.dump(), { k2: { b: 2 } });
});

test("provider id lists are coherent", () => {
  assert.deepEqual(PRESET_PROVIDER_IDS, ["openai", "openrouter", "groq", "together"]);
  assert.deepEqual(PROVIDER_IDS, [...PRESET_PROVIDER_IDS, CUSTOM_AI_PROVIDER_ID]);
  assert.equal(AI_PROVIDER_URLS.length, 4);
  assert.equal(DEFAULT_ADVANCED.aiBaseUrl, OPENAI_URL);
});

// ----------------------------- migration ----------------------------------

test("migrateUrlKeyedProfilesToSlots maps URL-keyed data into slots", () => {
  const legacy = {
    [OPENAI_URL]: { apiKey: "sk-openai", model: "gpt-4o" },
    [CUSTOM_URL]: { apiKey: "sk-custom", model: "custom-model" },
  };
  const { records, selectedId } = migrateUrlKeyedProfilesToSlots(legacy, {
    ...DEFAULT_ADVANCED,
    aiBaseUrl: CUSTOM_URL,
    aiModel: "custom-model",
  });
  assert.equal(selectedId, CUSTOM_AI_PROVIDER_ID);
  assert.deepEqual(records.openai, { apiKey: "sk-openai", model: "gpt-4o" });
  assert.deepEqual(records.custom, {
    baseUrl: CUSTOM_URL,
    apiKey: "sk-custom",
    model: "custom-model",
  });
});

test("migrateUrlKeyedProfilesToSlots keeps an already slot-shaped record", () => {
  const slotShaped = {
    custom: { baseUrl: CUSTOM_URL, apiKey: "sk-custom", model: "m1" },
    openai: { apiKey: "sk-openai", model: "m2" },
  };
  const { records, selectedId } = migrateUrlKeyedProfilesToSlots(slotShaped, {
    ...DEFAULT_ADVANCED,
    aiProviderId: CUSTOM_AI_PROVIDER_ID,
    aiBaseUrl: CUSTOM_URL,
  });
  assert.equal(selectedId, CUSTOM_AI_PROVIDER_ID);
  assert.deepEqual(records.custom, slotShaped.custom);
  assert.deepEqual(records.openai, slotShaped.openai);
});

test("migrate seeds the custom slot from advanced settings alone", () => {
  const { records } = migrateUrlKeyedProfilesToSlots(
    {},
    { ...DEFAULT_ADVANCED, aiBaseUrl: CUSTOM_URL, aiModel: "legacy-model" }
  );
  assert.equal(records.custom.baseUrl, CUSTOM_URL);
  assert.equal(records.custom.model, "legacy-model");
});

// --------------------------- shared scenarios ------------------------------

function freshCustomFlow(model) {
  assert.equal(model.selectedId, "openai");
  assert.equal(model.urlLocked, true);
  model.select(CUSTOM_AI_PROVIDER_ID);
  assert.equal(model.urlLocked, false);
  assert.equal(model.setUrl(CUSTOM_URL), true);
  assert.equal(model.setModel("custom-model"), true);
  assert.equal(model.setKey("sk-custom"), true);
  const save = model.save();
  assert.equal(save.ok, true);
  assert.equal(save.url, CUSTOM_URL);
  model.reload();
  const after = model.snapshot();
  assert.equal(after.selectedId, CUSTOM_AI_PROVIDER_ID);
  assert.equal(after.url, CUSTOM_URL);
  assert.equal(after.key, "sk-custom");
  assert.equal(after.model, "custom-model");
  assert.equal(after.urlLocked, false);
}

test("fresh custom endpoint save survives relaunch in BOTH designs", () => {
  const original = new OriginalUrlKeyedModel(createMemoryBackend());
  const slot = new SlotKeyedModel(createMemoryBackend());
  freshCustomFlow(original);
  freshCustomFlow(slot);
});

function presetLockFlow(model) {
  assert.equal(model.select("openrouter"), true);
  assert.equal(model.url, "https://openrouter.ai/api/v1");
  assert.equal(model.urlLocked, true);
  assert.equal(model.setUrl("https://evil.example.com/v1"), false);
  assert.equal(model.setModel("openrouter-model"), true);
  assert.equal(model.setKey("sk-or-1"), true);
  const save = model.save();
  assert.equal(save.ok, true);
  assert.equal(save.url, "https://openrouter.ai/api/v1");
  model.reload();
  const after = model.snapshot();
  assert.equal(after.selectedId, "openrouter");
  assert.equal(after.urlLocked, true);
  assert.equal(after.key, "sk-or-1");
  assert.equal(after.model, "openrouter-model");
}

test("preset URL is locked while model/key remain editable in BOTH designs", () => {
  const original = new OriginalUrlKeyedModel(createMemoryBackend());
  const slot = new SlotKeyedModel(createMemoryBackend());
  presetLockFlow(original);
  presetLockFlow(slot);
});

test("OpenAI -> Custom reloads the SAVED custom slot in the refactor only", () => {
  // Persist a custom endpoint, then an OpenAI profile, then switch back to
  // Custom API. This reproduces the reported bug in the original design.
  const original = new OriginalUrlKeyedModel(createMemoryBackend());
  original.select(CUSTOM_AI_PROVIDER_ID);
  original.setUrl(CUSTOM_URL);
  original.setModel("custom-model");
  original.setKey("sk-custom");
  original.save();
  original.reload();
  original.select("openai");
  original.setModel("gpt-4o");
  original.setKey("sk-openai");
  original.save();
  original.reload();
  original.select(CUSTOM_AI_PROVIDER_ID);
  const originalSnap = original.snapshot();

  const slot = new SlotKeyedModel(createMemoryBackend());
  slot.select(CUSTOM_AI_PROVIDER_ID);
  slot.setUrl(CUSTOM_URL);
  slot.setModel("custom-model");
  slot.setKey("sk-custom");
  slot.save();
  slot.select("openai");
  slot.setModel("gpt-4o");
  slot.setKey("sk-openai");
  slot.save();
  slot.reload();
  slot.select(CUSTOM_AI_PROVIDER_ID);
  const slotSnap = slot.snapshot();

  // Original: the leftover OpenAI URL/key stays in the fields.
  assert.equal(originalSnap.url, OPENAI_URL);
  assert.equal(originalSnap.key, "sk-openai");
  assert.equal(originalSnap.model, "gpt-4o");

  // Refactor: switching to Custom loads the custom slot's URL/key/model.
  assert.equal(slotSnap.selectedId, CUSTOM_AI_PROVIDER_ID);
  assert.equal(slotSnap.url, CUSTOM_URL);
  assert.equal(slotSnap.key, "sk-custom");
  assert.equal(slotSnap.model, "custom-model");
  assert.equal(slotSnap.urlLocked, false);
});

test("storage keying differs: URL-keyed original vs slot-keyed refactor", () => {
  const originalBackend = createMemoryBackend();
  const slotBackend = createMemoryBackend();

  const original = new OriginalUrlKeyedModel(originalBackend);
  original.select(CUSTOM_AI_PROVIDER_ID);
  original.setUrl(CUSTOM_URL);
  original.setModel("custom-model");
  original.setKey("sk-custom");
  const originalSave = original.save();
  assert.equal(originalSave.keyedBy, CUSTOM_URL);

  const slot = new SlotKeyedModel(slotBackend);
  slot.select(CUSTOM_AI_PROVIDER_ID);
  slot.setUrl(CUSTOM_URL);
  slot.setModel("custom-model");
  slot.setKey("sk-custom");
  const slotSave = slot.save();
  assert.equal(slotSave.keyedBy, CUSTOM_AI_PROVIDER_ID);

  const originalDump = originalBackend.dump();
  const originalProfileKeys = Object.keys(
    originalDump["@pantrio:test:customAiProviderSettings"]
  );
  assert.ok(originalProfileKeys.includes(CUSTOM_URL));
  assert.ok(!originalProfileKeys.includes(CUSTOM_AI_PROVIDER_ID));

  const slotDump = slotBackend.dump();
  const slotProfileKeys = Object.keys(
    slotDump["@pantrio:test:customAiProviderSettings"]
  );
  assert.deepEqual(slotProfileKeys, [CUSTOM_AI_PROVIDER_ID]);
  assert.equal(
    slotDump["@pantrio:test:customAiProviderSettings"][CUSTOM_AI_PROVIDER_ID].baseUrl,
    CUSTOM_URL
  );

  // Advanced settings carry the selection in the slot design.
  assert.equal(
    slotDump["@pantrio:test:advancedSettings"].aiProviderId,
    CUSTOM_AI_PROVIDER_ID
  );
  assert.equal(
    originalDump["@pantrio:test:advancedSettings"].aiProviderId,
    undefined
  );
});

test("validation reasons are identical in both designs", () => {
  const cases = [
    { url: "", model: "m", key: "k", reason: "empty URL" },
    { url: CUSTOM_URL, model: "", key: "k", reason: "missing model" },
    { url: CUSTOM_URL, model: "m", key: "", reason: "missing API key" },
    {
      url: "http://192.168.1.50:8080/v1",
      model: "m",
      key: "k",
      reason: "must be HTTPS (or http://localhost in development)",
    },
    {
      url: "https://my-llm.example.com/v1?x=1",
      model: "m",
      key: "k",
      reason: "URL contains query or fragment",
    },
    {
      url: "https://user:pw@my-llm.example.com/v1",
      model: "m",
      key: "k",
      reason: "URL contains credentials",
    },
    { url: "http://localhost:11434/v1", model: "m", key: "k", reason: null },
    { url: `${CUSTOM_URL}/`, model: "m", key: "k", reason: null },
  ];

  for (const design of [
    new OriginalUrlKeyedModel(createMemoryBackend()),
    new SlotKeyedModel(createMemoryBackend()),
  ]) {
    for (const testCase of cases) {
      design.select(CUSTOM_AI_PROVIDER_ID);
      design.setUrl(testCase.url);
      design.setModel(testCase.model);
      design.setKey(testCase.key);
      const result = design.save();
      assert.equal(result.ok, testCase.reason === null, `${design.constructor.name}: ${testCase.url}`);
      if (testCase.reason) {
        assert.equal(result.reason, testCase.reason, `${design.constructor.name}: ${testCase.url}`);
      }
    }
  }
});

test("runUserFlow drives either model through the same action list", () => {
  const slot = new SlotKeyedModel(createMemoryBackend());
  const results = runUserFlow(slot, [
    { type: "select", id: CUSTOM_AI_PROVIDER_ID },
    { type: "setUrl", value: CUSTOM_URL },
    { type: "setModel", value: "m" },
    { type: "setKey", value: "k" },
    { type: "save" },
    { type: "snapshot" },
  ]);
  assert.equal(results[0], true);
  assert.equal(results[1], true);
  assert.equal(results[4].ok, true);
  assert.equal(results[5].url, CUSTOM_URL);
});
