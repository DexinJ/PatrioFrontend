# Language Fix Plan

## Goal

Stop the AI from answering in English when another language is selected, and
remove the English-only prompt that is currently sent for the fridge recipe
flow.

No source files are changed yet. This file records the planned edits.

## Root cause summary

1. The model language is resolved from `i18next.language`, but
   `i18n.changeLanguage` updates that value asynchronously. A request sent
   immediately after changing the app language can still resolve to `"en"`.
2. Both chat entry points call `streamMessage` without passing `language`, so
   language resolution depends entirely on `i18next.language`.
3. The fridge recipe request sends a hardcoded English prompt while only the
   visible `displayText` is localized. The model tends to mirror the latest
   user-message language, so recipe replies can come back in English.
4. A few assistant messages produced by the app itself are hardcoded English
   and bypass translation.

## Planned changes

### 1. `i18n/index.js`

Add a synchronous current-language value and expose it:

```js
let currentLanguageCode = "en";

export function getCurrentLanguageCode() {
  return currentLanguageCode;
}

export function applyLanguageCode(code) {
  currentLanguageCode = code;
  return i18n.changeLanguage(code);
}
```

Update `setAppLanguage` to set the value synchronously before the async
i18next update:

```js
export async function setAppLanguage(code) {
  const normalized = SUPPORTED_LANGUAGES.some((l) => l.code === code)
    ? code
    : "en";

  currentLanguageCode = normalized;
  await i18n.changeLanguage(normalized);

  try {
    await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, normalized);
  } catch {
    // Persistence is best-effort; the in-memory language still applies.
  }
}
```

### 2. `app/_layout.js`

Replace the direct `i18n.changeLanguage(code)` call in the startup restore
effect with `applyLanguageCode(code)` so the synchronous current-language
value is updated at startup as well.

Import `applyLanguageCode` from `../i18n`.

### 3. `api/gpt.js`

Import the new helper:

```js
import { getCurrentLanguageCode } from "../i18n";
```

Update `resolveModelLanguage` to use the synchronous source:

```js
function resolveModelLanguage(override) {
  const raw = String(
    typeof override === "string" && override.trim()
      ? override.trim()
      : getCurrentLanguageCode()
  );
  const code = raw.toLowerCase().split("-")[0].split("_")[0];
  return code === "zh" ? "zh" : "en";
}
```

Update `recipeCardPlaceholderText` to use `getCurrentLanguageCode()` instead
of reading `i18next.language` directly.

### 4. `locales/en.json` and `locales/zh.json`

Add a new key under the existing `fridge` section.

English:

```json
"findRecipesPrompt": "Recommend 4 quick recipes using as many of these selected fridge items as practical:\n{{items}}\n\nKeep your reply to a one-line intro pointing to the recipe cards the app shows below; the cards carry the title, calories, ingredients you have, and missing ingredients, and tapping one reveals the full steps and recipe page. If no recipes are found, say so plainly and do not mention cards. Never add per-recipe text, steps, explanations, or invented details."
```

Chinese:

```json
"findRecipesPrompt": "用尽可能多的所选冰箱食材推荐 4 道快手菜：\n{{items}}\n\n请只写一句指向下方菜谱卡片的介绍；卡片会显示菜名、热量、已有食材和缺少食材，点击卡片可查看完整步骤和菜谱页。如果没有匹配的菜谱，请直接说明并不要提及卡片。不要逐条复述菜谱内容、步骤、解释或编造细节。"
```

### 5. `app/(tabs)/fridge.js`

Replace the hardcoded English `prompt` template with the localized key:

```js
const prompt = t("fridge.findRecipesPrompt", {
  items: ingredientLines,
});
```

`t` is already available in `FridgeScreen`, and `ingredientLines` already
contains the selected item lines.

## Optional follow-ups

### Localize app-generated tool text

`api/gptTools.js` contains hardcoded English assistant messages, for example
the streamline summary text. Move those strings into
`locales/en.json` / `locales/zh.json` and render them with `i18next.t`.

### Strengthen the model language rule

In `api/buildSystemMessage.js`, make the language instruction explicit even
when the latest user message or tool output is English.

## Verification

1. Switch the app to Chinese and immediately send a chat message.
2. Select fridge items and tap "Recipes"; verify the AI reply is in Chinese.
3. Switch back to English and confirm both normal chat and recipe replies
   remain English.
4. Run the existing i18n key check and unit tests:

   ```sh
   node scripts/check-i18n-keys.cjs
   node scripts/run-unit-tests.cjs
   ```
