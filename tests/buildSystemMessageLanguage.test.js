import assert from "node:assert/strict";
import test from "node:test";

import { buildSystemMessage } from "../api/buildSystemMessage.js";

const baseArgs = {
  settings: {},
};

test("neither list is inlined, and both tools are required", () => {
  const prompt = buildSystemMessage({
    ...baseArgs,
    fridgeItems: [
      { name: "beef", quantity: "1 kg" },
      { name: "eggs", quantity: "6" },
    ],
    shoppingListItems: [{ name: "milk", quantity: "2 L" }],
  });

  assert.doesNotMatch(prompt, /- Shopping List:/);
  assert.doesNotMatch(prompt, /- Fridge:/);
  // Both lists reach the model through tools, so the prompt has to ask for
  // those reads.
  assert.match(prompt, /call getFridgeContents/);
  assert.match(prompt, /Call getShoppingListContents/);
});

test("the recipe rules keep routing, labels and limits explicit", () => {
  const prompt = buildSystemMessage(baseArgs);
  // Preference statements must not be treated as recipe searches.
  assert.match(prompt, /preference is never a recipe request/);
  // Ambiguous what-to-eat asks ask one question instead of searching.
  assert.match(prompt, /ask ONE short clarifying question/);
  // Near matches are labelled, and search limits match the wider budget.
  assert.match(prompt, /near match/);
  assert.match(prompt, /Return up to 6 recipes/);
  assert.match(prompt, /never invent a reason for a failure/);
});

test("the caller's argument shape does not throw", () => {
  // Regression guard: the app calls this with settings and language only.
  const prompt = buildSystemMessage(baseArgs);
  assert.match(prompt, /- User: User/);
});

test("batch shopping adds are routed to the one-shot batch tool", () => {
  const prompt = buildSystemMessage(baseArgs);
  // Several items must be one call, not a loop of single-item calls.
  assert.match(prompt, /call massAddShoppingItems ONCE/);
  assert.match(prompt, /never loop addShoppingItem for a batch/);
});

test("system prompt defaults to English", () => {
  const prompt = buildSystemMessage(baseArgs);
  assert.match(prompt, /Always reply in English \(language code: en\)/);
  assert.doesNotMatch(prompt, /简体中文/);
});

test("system prompt follows the app language when zh is active", () => {
  const prompt = buildSystemMessage({ ...baseArgs, language: "zh" });
  assert.match(prompt, /Always reply in 简体中文 \(language code: zh\)/);
});

test("system prompt keeps tool-provided values untranslated", () => {
  const prompt = buildSystemMessage({ ...baseArgs, language: "zh" });
  assert.match(prompt, /exactly as provided/);
});

test("unsupported language codes fall back to English", () => {
  const prompt = buildSystemMessage({ ...baseArgs, language: "fr" });
  assert.match(prompt, /Always reply in English \(language code: en\)/);
});
