# Scope structured-card hiding to the in-flight chat turn (Chat)

Written against: `8615c7b`, on the working tree (which already contains unrelated uncommitted edits to `components/MessageList.js`, `api/gpt.js`, `app/(tabs)/chat.js`, `utils/chatStoragePolicy.js`, `utils/recipeCards.js`, and others — build on the working tree, not on `HEAD`).

## Evidence chain

- Surface: `app/(tabs)/chat.js:585` → `components/MessageList.js` → `components/RecipeResultCards.js` / the `ActionCard` branch — the chat transcript, in both display modes (`settings.chat.chatgptStyle` off = bubble view, on = GPT text view).
- Problem: `components/MessageList.js:977-982`, inside the `data` memo (`:968-1049`), drops **every** structured transcript item while a turn is streaming:
  ```js
  if (
    receiving &&
    (msg?.type === "recipe_cards" || msg?.type === "ui_action")
  ) {
    return null;
  }
  ```
  `receiving` is a single global flag (`context/GlobalContext.js:688`), not a per-request one. `MessageList` reads it from `ChatContext` (`components/MessageList.js:933`). It is set true at the top of `streamMessage` (`api/gpt.js:1999`) and cleared in the `streamMessage` `finally` only once `activeStreamsRef` empties (`api/gpt.js:2007`; also cleared by cancellation at `:758` and socket close at `:892`). So for the whole duration of *any* streamed turn the filter removes the recipe cards and confirmation cards of *earlier, already-finished* turns too. That is the reported symptom: all recipe cards disappear while a new message streams.
- Why the suppression exists: commit `dc522767` ("edited recipe search behavior") reworked the recipe flow so the card is appended to the tail of the transcript the moment the `recommendRecipes` tool result arrives (`api/gpt.js:1108-1126`, WS path; `:1871` / `:1896` for the custom/Apple providers), while the assistant's short intro text streams in afterwards and is spliced **above** the card via `insertAssistantAboveStructuredMessage` (`api/gpt.js:803-830`, `utils/chatMessageOrder.js`). Without suppression the cards would pop in first and then be shoved down when the intro text appeared, so the hide was a blunt way to make the final order (text above cards) appear atomically. The defect is that the filter was never scoped to the turn being streamed.
- Ordering invariant that makes scoping possible: every turn begins with a `role: "user"` entry appended by `addMessage` (`api/gpt.js:1764-1771`; retry reuses the existing trailing user turn — `app/(tabs)/chat.js:292-304`, `api/gpt.js:1773-1786`). All of a turn's structured items are appended *after* that user entry, and the next turn appends a newer user entry after them. Therefore, at the moment `receiving` is true, **the in-flight turn's structured items are exactly the structured items positioned after the newest `role: "user"` entry.** Cards from earlier turns always sit before that boundary.
- The composer is disabled while a request is in flight (`components/MessageInput.js`, `editable={!receiving}`), so the transcript carries at most one streaming turn at a time — the boundary is unambiguous.
- Owner: `components/MessageList.js` (transcript mapping).
- Scope and affected surfaces: the chat transcript only (bubble and GPT text view). No persisted-message shape, model-context, or other-provider behaviour changes.
- Uncertainty: none for the render path. The only assumption is the "turn starts with a user entry" ordering invariant above, which retry, the custom provider, and the Apple provider all satisfy.

### Verified against the working tree

- `MessageList` has exactly one consumer, `app/(tabs)/chat.js:585`; nothing else maps over the chat `messages` array.
- `receiving` has one reader in this surface (`components/MessageList.js:933`); it is written only by the chat runtime (`api/gpt.js:1999`, `:2007`, `:758`, `:892`) through `ChatActionsContext` (`context/GlobalContext.js:2991`), so changing what `MessageList` does with it cannot affect any other screen.
- The in-flight turn's recipe card id is `recipe-cards-<requestId>` (`api/gpt.js:375`) and its streaming text message id is `assistant-<requestId>` (`api/gpt.js:1954`); the custom/Apple paths build the card with a fresh id (`api/gpt.js:1871`, `:1896`). A request-id match would therefore only cover the WS provider and would miss the local providers and the id-less `recipe_preference_update` card (`api/gptTools.js:743-756`) — which is why the boundary is defined positionally, not by id.
- `ui_action` cards generated mid-turn use random ids (`fridge-proposal-*`, `bulk-proposal-*`; `api/gptTools.js:569`, `:815`) or none, so id matching is not viable for them either.
- `tests/chatMessageOrder.test.js`, `tests/recipeCards.test.js`, and the rest of `tests/` are pure-module unit tests run by `scripts/run-unit-tests.cjs` (`node --test`), so a new pure helper is the natural test seam.

## Intended behavior change

While a turn is streaming, only the **in-flight turn's** recipe cards and confirmation cards stay hidden until the stream settles; every earlier turn's cards remain visible. When the stream finishes, the in-flight turn's cards appear below the assistant text, exactly as today. This is option B: "only the current recipe cards are hidden while the AI is streaming."

Nothing else changes: the typing indicator, the "text above cards" final order, and the atomic reveal of the current turn's card are preserved.

## Design decision

Replace the blanket `receiving &&` type filter with a boundary check computed once per render: the index of the newest `role: "user"` entry. A structured item is "in flight" when it sits after that boundary; only in-flight structured items are suppressed, and only while `receiving` is true.

The boundary is positional rather than id-based because the id formats diverge across providers and card kinds (see verified notes) and the ordering invariant already encodes "belongs to the current turn" exactly. This keeps the change to one component plus one pure helper, needs no new chat-context state, and works identically for the WS, custom, and Apple providers.

Spec:

- `lastUserMessageIndex(messages)` → index of the newest `role === "user"` entry, or `-1` when there is none.
- `isInFlightStructuredMessage(message, index, lastUserIndex)` → `true` when `message.type` is `"recipe_cards"` or `"ui_action"` **and** `index > lastUserIndex`.
- Suppress a structured item only when `receiving && isInFlightStructuredMessage(...)`. When `receiving` is false, nothing is suppressed (so a settled turn's trailing card renders).

## Reuse

- The existing structured-type set and branches: `components/MessageList.js:977-1005` (`recipe_cards`, `ui_action`), rendered by `components/RecipeResultCards.js` and the `ActionCard` branch (`:1057-1080`).
- The existing `[fromTool]` pre-filter (`components/MessageList.js:971`) — the boundary must be computed on the same post-filter array the map index refers to.
- The existing `data` memo dependency list (`components/MessageList.js:1049`) — unchanged; the boundary is derived from `messages`.
- Test seam and style: `tests/chatMessageOrder.test.js` (pure ESM module, `node:assert/strict`).

## Changes

1. `utils/chatMessageVisibility.js` (new)
   - Change: add a React-free module exporting
     - `STRUCTURED_MESSAGE_TYPES = new Set(["recipe_cards", "ui_action"])`,
     - `lastUserMessageIndex(messages)` (reverse scan for `role === "user"`, else `-1`),
     - `isInFlightStructuredMessage(message, index, lastUserIndex)` (`STRUCTURED_MESSAGE_TYPES.has(message?.type) && index > lastUserIndex`).
   - Preserve: no imports of React, context, or i18n, so it stays unit-testable — matching `utils/chatMessageOrder.js`.
   - Verify: `tests/chatMessageVisibility.test.js` (below).

2. `components/MessageList.js`
   - Change: in the `data` memo (`:968-1049`), compute the visible list once, derive the boundary, and pass the map index through:
     ```js
     const visibleMessages = sourceMessages.filter(
       (msg) => !toDisplayText(msg?.text).startsWith("[fromTool]")
     );
     const lastUserIndex = lastUserMessageIndex(visibleMessages);
     const base = visibleMessages
       .map((msg, index) => {
         ...
         if (
           receiving &&
           isInFlightStructuredMessage(msg, index, lastUserIndex)
         ) {
           return null;
         }
         ...
       })
       .filter(Boolean);
     ```
   - Change: import `lastUserMessageIndex` and `isInFlightStructuredMessage` from `../utils/chatMessageVisibility`.
   - Preserve: the `[fromTool]` filter, every `kind` branch (`ui_action`, `recipe_cards`, `error`, `bubble`), the typing item, keying, the `data` dependency list (`[messages, receiving, waiting, status]`), and the `renderItem` cases.
   - Verify: while streaming a fresh turn, a previous turn's card stays rendered; the current turn's card is absent until the stream settles, then appears below the assistant text.

3. `tests/chatMessageVisibility.test.js` (new)
   - Change: cover
     - `lastUserMessageIndex` returns the last user index, and `-1` for an array with no user entry;
     - `isInFlightStructuredMessage` is `true` for a `recipe_cards`/`ui_action` item after the boundary, `false` before it, and `false` for non-structured items;
     - the `-1` boundary case (any structured item counts as in-flight) is pinned;
     - a composed transcript `[user, bubble, recipe_cards(prev), user, bubble, recipe_cards(current)]` marks only the current card in-flight.
   - Preserve: existing tests untouched.
   - Verify: `npm run test:unit`.

## Scope

- Inherit: every chat transcript rendered by `MessageList`, both display modes.
- Verify: earlier-turn `recipe_cards` and `ui_action` cards remain visible throughout a new stream; the in-flight turn's card still hides during streaming and reveals on settle; a message with no structured items renders exactly as before.
- Exclude: `components/RecipeResultCards.js` and the `ActionCard` branch (unchanged), the streaming pipeline in `api/gpt.js` (no reordering, no deferred append — that is option A), persisted-message shape, and the custom/Apple provider paths.
- Exclude: tagging `ui_action` cards with a request id. The positional boundary covers them without it; id tagging is a separate cleanup if the ordering invariant is ever relaxed.

## Validation

- Product: open a chat that already shows recipe cards from a prior turn, send a follow-up text message → the prior cards stay on screen for the whole stream; if the follow-up produces its own cards, those appear below the assistant's text once the stream ends.
- Product: a first turn that produces cards still does not flash the cards before the intro text (the suppression for the in-flight turn is unchanged).
- Interface: bubble view and GPT text view; light and dark; a turn that ends with an error or a cancellation (the trailing card becomes visible when `receiving` clears).
- Interface: retry of a failed turn (the re-sent turn's card is hidden during the retry because it sits after the trailing user entry).
- Unit: `npm run test:unit` → all pass, including the new `tests/chatMessageVisibility.test.js`.
- Repository: `npm run lint` → no new errors.

## Stop conditions

- Stop if a structured item can be legitimately appended after the newest user entry without belonging to the in-flight turn (would break the boundary). The verified flows (WS card append, custom/Apple card append, mid-turn `ui_action` cards) all append after the current turn's user entry, so this should not occur.
- Stop if `receiving` is ever left true after a stream settles — that would keep the boundary's structured items hidden; the flag lifecycle (`api/gpt.js:1999` / `:2007`) is unchanged by this plan.
- Stop if the change is asked to also defer the card's *append* (option A) — that edits the streaming pipeline and is out of scope here.

## Design documentation

- After acceptance and validation, note the rule "structured transcript items are hidden while streaming only when they belong to the in-flight turn (positioned after the newest user entry)" alongside the chat-transcript notes in `docs/CODEBASE_REPORT.md`.
