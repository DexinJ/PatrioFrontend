# Failed-turn error notice with in-place Retry (Chat)

Written against: `8615c7b` (the working tree already contains unrelated uncommitted edits to `app/(tabs)/chat.js`, `locales/en.json`, `locales/zh.json`, `api/recipeAssistant.js`, `utils/recipeCards.js`, and others — build on the working tree, not on `HEAD`)

## Evidence chain

- Surface: `app/(tabs)/chat.js` → `components/MessageList.js` → `components/MessageBubble.js` — the Chat tab transcript, in both display modes (`settings.chat.chatgptStyle` off = bubble view, on = GPT text view).
- Problem: when a send fails, `app/(tabs)/chat.js:215-226` appends
  `{ id: "assistant-error-<ts>", role: "assistant", isError: true, content: [{ type: "output_text", text: <mapped error copy> }] }`.
  `components/MessageList.js:958-1021` turns every non-structured message into `{ kind: "bubble" }` (`:1011`) and never reads `isError`, so the notice is rendered by `MessageBubble` (`:1043-1052`) with the same left-aligned assistant bubble as a real answer. There is no retry affordance anywhere in the chat surface.
- Second defect, same root: `context/GlobalContext.js:677-687` passes every `setMessages` payload through `boundRuntimeChatMessages`, which sanitizes each message with `utils/chatStoragePolicy.js:sanitizeMessage`. That function returns a fixed allowlist (`id`, `role`, `content`, `text`, `imageUri`, `usage`), so `isError` is dropped from live state. The consequence reaches past rendering: `api/gpt.js:450` guards replay with `isReplayableChatMessage`, which detects notices only through `message.isError === true` plus a native-error regex. With the flag stripped, mapped copy such as "Pantrio AI is temporarily unavailable. Please try again." is replayed to the model as an assistant turn — the exact thing `utils/chatReplayPolicy.js` documents must never happen.
- `addMessage` (`api/memoryManager.js:42-63`) resolves with the un-sanitized array it built inside the updater, so `isError` survives only for the request immediately after the failure and is gone from state from then on. Notices therefore render as messages and are replayable on the next turn.
- Design evidence:
  - `context/GlobalContext.js:120-165`: `danger` / `dangerBackground` and `warning` / `warningBackground` already exist as theme tokens in light and dark.
  - `components/MessageList.js:836-905` (`TypingIndicator`): the established precedent that a transcript item drops its card chrome (padding, border, background) when `chatgptStyle` is on, keeping only the dots.
  - `components/MessageBubble.js` styles: the AI bubble is a left-aligned 16px-radius surface (`maxWidth: "75%"`, `theme.aiBubble`), so a left-aligned tinted surface occupies the same slot as the reply it replaces.
  - `components/SectionHeaderPill.js:13-27`: existing `tone="danger"` treatment.
- Owner: `app/(tabs)/chat.js` (send flow and error copy), `components/MessageList.js` (transcript mapping and rendering), `utils/chatStoragePolicy.js` (the message shape that survives sanitizing).
- Scope and affected surfaces: Chat transcript (bubble and GPT text view), persisted conversations (sanitizer output), model replay context, EN and ZH strings.
- Uncertainty: none for the render path. Retry after an app restart cannot resend a photo whose URI is not a durable managed attachment — `sanitizeMessage` already replaces it with `[image]`, so the retry resends text only.

### Verified against the working tree

- `isError` has exactly two readers today: `utils/chatReplayPolicy.js:51` and its producer `app/(tabs)/chat.js:222`. Nothing else branches on it, so widening the sanitizer allowlist cannot change any other behaviour.
- `MessageList` has exactly one consumer, `app/(tabs)/chat.js:478`, and no other module maps over the chat `messages` array (checked `app/`, `components/`, `context/`, `utils/`, `api/`, `tests/`).
- The appended user message is used for exactly one thing: `let requestMessages = updatedMessages.slice(-5)` at `api/gpt.js:1775`. Substituting a `history` argument is therefore a complete replacement, and the default path's `addMessage` behaviour is untouched.
- All three providers reach model context through one builder: `toChatCompletionsMessages` (`api/gpt.js:433`, replay filter at `:450`), called at `:1821` (custom and Apple) and `:1896` (Pantrio WebSocket). One filter covers all of them, so the leak fix lands everywhere at once.
- The `setMessages` wrapper that sanitizes state is `context/GlobalContext.js:677-687` (sanitizing call at `:684`).
- `tests/chatStoragePolicy.test.js` asserts on conversation objects and on individual message fields, never on an exact sanitized message shape, so two added fields break nothing.
- The summary path is dormant: `checkAndSummarize` (`api/memoryManager.js:470`) and `getConversation` (`:66`) have no live callers — the call site is commented out at `api/gpt.js:1788`.
- `api/gpt.js:1749` throws `chat.errors.messageEmpty` **before** the user message is appended at `:1758-1761`. The path is unreachable from the composer (`handleSend` requires text or an image, `MessageInput.js:69-81`), but it is why the notice-replacement rule below is scoped rather than blind.
- `streamMessage` has two callers: `app/(tabs)/chat.js:199` and `app/(tabs)/fridge.js:351`. The fridge path (`fridge.js:344-360`) sends a localized `displayText` for the transcript and the real `prompt` as `text`, with `uiAction: "findRecipes"` and `selectedIngredients`. That is the only live use of the `displayText` → `replaceLastUserPromptForRequest` branch (`api/gpt.js:1777-1784`), and it catches its own failure with an `Alert.alert` rather than appending a notice. Notices are therefore only ever produced by the composer flow, which sends text and/or an image and no `uiAction`.

### Intended behavior change

The one change outside rendering: once `isError` survives sanitizing, `isReplayableChatMessage` finally excludes notices from model context. Today a failed turn leaves mapped error copy in the history the model sees on the next request (for example "Pantrio AI is temporarily unavailable. Please try again."); after this change it does not. That is exactly what `utils/chatReplayPolicy.js` documents, but it does change the context of the turn after a failure, so it belongs in review notes.

## Design decision

The failure becomes its own transcript item kind — a notice — instead of an assistant bubble, and it carries the recovery action.

The card wins over an inline row because it renders in the assistant's reply slot: it keeps the transcript's rhythm in bubble view, and in GPT text view it becomes the only structured surface in an otherwise plain-text column, which is where a failure is easiest to misread as an answer. The rail, icon, and title hold in both modes; only the weight changes.

Spec:

- Left-aligned, directly under the user turn it failed to answer. Max width 94% of the list, 100% in GPT text view.
- Surface `theme.dangerBackground`, 1px `theme.danger` border at ~45% alpha, radius 14, 4px solid `theme.danger` left rail, padding 12.
- `alert-circle` (Ionicons) 20px in `theme.danger`, top-aligned with the title.
- Title 13px / weight 800 / `theme.danger` / letter-spacing 0.2, copy `chat.errorNotice.title`.
- Body 13.5px / line-height 19 / `theme.textPrimary` — the existing mapped copy from `getChatErrorMessage`, unchanged.
- Actions row 12px above: primary `Retry` (36px high, radius 10, fill `theme.danger`, label `theme.dangerBackground` for contrast, `refresh` icon 15px, copy `common.retry`); secondary `Dismiss` (borderless, `theme.textSecondary`, copy `chat.errorNotice.dismiss`).
- Warning tone (`errorCode === "RECIPE_RECOMMENDATION_TIMEOUT"`, whose mapped copy already reads "Showing what was found"): same geometry with `theme.warning` / `theme.warningBackground` and dark text on the amber fill.
- Accessibility: `accessibilityRole="alert"` on the container; both actions are labelled controls with `accessibilityState={{ disabled }}`.
- GPT text view (`chatgptStyle`): rail, icon, title, and both actions are unchanged; the fill drops to a low-alpha tint of the tone color (light `rgba(229,57,53,0.09)` / dark `rgba(239,83,80,0.14)`; warning `rgba(255,152,0,0.11)` / `rgba(255,183,77,0.16)`), the radius squares off, and horizontal padding collapses to the rail. This mirrors `TypingIndicator` shedding chrome in the same mode.

Behaviour:

- One notice per failed turn. A second failure replaces the notice that sits **directly after the last user turn** instead of stacking a second one; a notice that does not follow that turn is never touched (see the `messageEmpty` note above).
- `Retry` removes the notice and re-sends the same user turn; the original user bubble stays in place and is not duplicated.
- `Retry` appears only when a usable payload exists. `retryPayloadFromMessages` must ignore the `[image]` placeholder that persistence writes for images it cannot keep — otherwise an image-only turn reopened after a restart would resend the literal string `[image]` to the model. With no real text and no image, the notice renders without the Retry action (Dismiss stays).
- Known limitation to keep in view: because notices only come from the composer, the retry payload is rebuilt from the displayed text. If a future change routes recipe generation or any other `displayText` / `uiAction` flow through the notice path, the notice must also carry `uiAction` and `selectedIngredients`, which it does not today.
- `Dismiss` removes the notice without resending.
- While a request is in flight (`receiving`) Retry is disabled; the existing typing indicator takes the notice's place once the retry starts.
- Cancelled requests (`REQUEST_CANCELLED`) and stale generations still produce no notice, as today.

## Reuse

- `theme.danger`, `theme.dangerBackground`, `theme.warning`, `theme.warningBackground`, `theme.textPrimary`, `theme.textSecondary`, `theme.border` — `context/GlobalContext.js:120-165`.
- `common.retry` ("Retry") — `locales/en.json:9`; no new retry string.
- Non-bubble item kind, as an exemplar: the `ui_action` and `recipe_cards` branches in `components/MessageList.js:958-1021` plus their `renderItem` cases at `:1032-1052`.
- Chrome-shedding exemplar: `TypingIndicator`, `components/MessageList.js:836-905`.
- New primitive: `components/ChatErrorNotice.js`. No existing component renders a notice inside the transcript — `SectionHeaderPill` is a label-only pill with no body, icon, or actions, and `LinkPreviewCard` is card chrome for URLs. The notice owns its surface because it must adapt to `chatgptStyle` and carry the retry action, and it is consumed only by `MessageList`.

## Changes

1. `utils/chatStoragePolicy.js`
   - Change: in `sanitizeMessage`, add `...(message.isError === true ? { isError: true } : {})` and a bounded `errorCode` string (non-empty string only, truncated to 40 chars) to the returned allowlist for the non-structured branch.
   - Preserve: allowlist behaviour for every other field, the text/image bounds, and usage sanitizing; unknown fields stay dropped.
   - Verify: a notice survives both `boundRuntimeChatMessages` and `prepareChatMessagesForPersistence` with `isError`/`errorCode` intact, while an arbitrary added key is still removed.

2. `utils/chatErrorNotice.js` (new)
   - Change: pure helpers only.
     - `SOFT_ERROR_CODES = new Set(["RECIPE_RECOMMENDATION_TIMEOUT"])` and `noticeToneForErrorCode(code)` → `"warning"` | `"error"`.
     - `retryPayloadFromMessages(messages, noticeId)` → the nearest preceding `role === "user"` entry before the notice, read as `{ text, imageUri, imageRequestUri }` from the `content` parts (`input_text` → text, `input_image.image_url` → image) with a fallback to `msg.imageUri`; skip `[fromTool]` entries; treat a `text` of exactly `[image]` as empty; return `null` when neither real text nor an image survives — `null` is the signal that Retry is unavailable.
     - `removeNotice(messages, noticeId)` and `replaceTrailingNotice(messages, notice)` → new arrays, never mutate; `replaceTrailingNotice` replaces only when the notice directly follows the last `role === "user"` entry, otherwise it appends.
   - Preserve: nothing; new module.
   - Verify: `tests/chatErrorNotice.test.js`.

3. `app/(tabs)/chat.js`
   - Change: extract the body of `handleSend` (`:192-229`) into `sendTurn({ text, imageUri, imageRequestUri, appendUserMessage, history })` so the try/catch and notice creation exist once. `handleSend(message)` calls it with `appendUserMessage: true`. The catch keeps `getChatErrorMessage`, the `REQUEST_CANCELLED` / mounted / generation guards, and appends the notice through `replaceTrailingNotice`. The notice carries `isError: true`, `errorCode: error?.code || null`, and a collision-proof `id` — the current `assistant-error-${Date.now()}` can repeat inside one millisecond, and `MessageList` uses that id both as the FlatList key and as the dismiss handle.
   - Change: add `handleRetry(noticeId)` — resolve the payload with `retryPayloadFromMessages`; return early when it is `null`; remove the notice; then `sendTurn({ ...payload, appendUserMessage: false, history: messages.filter((m) => m.isError !== true) })`.
   - Change: add `handleDismissNotice(noticeId)` → `setMessages((prev) => removeNotice(prev, noticeId))`.
   - Change: pass `onRetry={handleRetry}` and `onDismiss={handleDismissNotice}` to `MessageList`.
   - Preserve: the `sendGenerationRef` guard, `setInput("")` on send, and all `handleUiAction` behaviour.
   - Verify: retry re-sends without adding a second user bubble; a failure after a failure leaves exactly one notice; dismiss leaves the rest of the transcript untouched.

4. `api/gpt.js`
   - Change: `streamMessage` / `runStreamMessage` accept `appendUserMessage = true` and `history = []`. When `appendUserMessage` is false, skip `addMessage` and build `requestMessages` from `history` plus the synthesized user turn (`{ role: "user", content: [{ type: "input_text", text }, { type: "input_image", image_url }] }`), then `slice(-5)` exactly as today.
   - Preserve: the default path (`appendUserMessage` true) behaves exactly as it does now, including `replaceLastUserPromptForRequest` and image handling.
   - Verify: a normal send still appends exactly one user message; a retry appends none.

5. `components/ChatErrorNotice.js` (new)
   - Change: presentational component with props `{ text, tone, chatgptStyle, disabled, onRetry, onDismiss }`, implementing the spec above with `StyleSheet.create` (do not use `absoluteFillObject` — see the RN 0.86 note in the `styles` block of `components/MessageList.js`), `useContext(GlobalContext)` for `theme`, and `useTranslation()` for the title and dismiss copy.
   - Preserve: the body text is the already-mapped, already-localized string; the component never maps error codes to copy itself.
   - Verify: the same structure renders with `chatgptStyle` on and off; both actions are reachable and labelled.

6. `components/MessageList.js`
   - Change: in the `data` memo (`:958-1021`) add an error branch before the bubble return that yields `{ kind: "error", noticeId: msg.id, errorCode: msg.errorCode, text, tone: noticeToneForErrorCode(msg.errorCode), canRetry: retryPayloadFromMessages(sourceMessages, msg.id) !== null, key }`, and exclude notices from the `kind: "bubble"` branch (`:1009-1017`).
   - Change: in `renderItem` (`:1032`) render `<ChatErrorNotice text={item.text} tone={item.tone} chatgptStyle={chatgptStyle} disabled={receiving} canRetry={item.canRetry} onRetry={() => onRetry?.(item.noticeId)} onDismiss={() => onDismiss?.(item.noticeId)} />`.
   - Change: accept `onRetry` / `onDismiss` in the component signature.
   - Preserve: keying, `[fromTool]` filtering, structured-message suppression while `receiving`, the typing item, and scroll-to-end.
   - Verify: an error message renders as a notice while user and assistant messages still render as bubbles.

7. `locales/en.json` + `locales/zh.json`
   - Change: add `chat.errorNotice.title` ("Message not sent") and `chat.errorNotice.dismiss` ("Dismiss") beside the existing `chat.errors` block (`en.json:331-377`, `zh.json:349-360`), with matching Chinese copy. No new retry string — use `common.retry`.
   - Preserve: every existing key; do not rename `chat.errors.*`.
   - Verify: `t("chat.errorNotice.title")` resolves in both locales and no zh value is left in English.

8. `tests/`
   - Change: add `tests/chatErrorNotice.test.js` covering tone mapping, payload resolution (nearest preceding user turn, `[fromTool]` skipped, `null` when absent), and notice removal/replacement. Add cases to `tests/chatStoragePolicy.test.js` for the `isError`/`errorCode` allowlist, and a round-trip assertion in `tests/chatReplayPolicy.test.js` that a sanitized notice is not replayable.
   - Preserve: existing tests unchanged.
   - Verify: `npm test`.

## Scope

- Inherit: every chat transcript rendered by `MessageList`, in both display modes and both tones; every conversation whose messages pass through the sanitizer.
- Verify: the recipe-card and UI-action paths (`RecipeResultCards`, `ActionCard`) are unaffected — they return before the bubble branch and keep their own `kind`s; the persisted payload grows by two small fields, so confirm stored size still respects `MAX_PERSISTED_CHAT_BYTES` in `api/memoryManager.js:154` and `:304`.
- Exclude: `components/MessageBubble.js` (it keeps rendering real messages), the composer, the conversation list, and every non-chat error surface (subscription, purge, storage hydration) — those already have their own treatments.
- Exclude: `api/memoryManager.js:66` (`getConversation`) and `:470` (`checkAndSummarize`) — both dormant today. If history summarization is re-enabled, filter through `utils/chatReplayPolicy.js:isReplayableChatMessage` before sending messages to the summarizer, or notices reach the model by that route too.
- Exclude: `app/(tabs)/fridge.js` recipe generation. It already reports failure with `Alert.alert` and never appends a notice; extending the card there would need the `uiAction` / `selectedIngredients` plumbing described above and is a separate decision.

## Validation

- Product: send a message while the chat backend is unreachable → the transcript shows a failed-turn notice under the user's bubble instead of an assistant bubble; tapping Retry resends that turn and its answer occupies the notice's place; tapping Dismiss clears it.
- Interface: bubble view and GPT text view; error tone and warning tone; light and dark; a second failure while the notice is the last item; retry while `receiving`; a conversation reopened after an app restart (the notice still renders as a notice, and an image-only turn arrives with no Retry action rather than resending `[image]`); long error copy wrapping at 320px; a notice appearing as the first item after the empty state.
- Interface: the notice's copy must not appear in the outbound request — inspect the payload sent at `api/gpt.js:1821` / `:1896` after a failure, or assert `isReplayableChatMessage` on the sanitized notice.
- System: no new palette or parallel chrome — reuse stays within the existing tokens and the `TypingIndicator` chrome-shedding pattern, and the new component is consumed only by `MessageList`.
- Repository: `npm test` → all unit tests pass; `npm run lint` → no new errors.

## Stop conditions

- Stop if a consumer of `utils/chatStoragePolicy.js` relies on notices being indistinguishable in stored data.
- Stop if `appendUserMessage: false` cannot leave the default send path exactly as it is — the retry must not change normal sending.
- Stop if the new `kind: "error"` branch collides with the `receiving` suppression rules for structured messages, or if the `danger` design language has changed since `8615c7b`.

## Design documentation

- After acceptance and validation: record the notice pattern — failures render as a non-bubble transcript item carrying the mapped copy and an in-place Retry, with reduced chrome in GPT text view — in the chat section of `docs/CODEBASE_REPORT.md`. No design document governs the chat transcript at `8615c7b`.
