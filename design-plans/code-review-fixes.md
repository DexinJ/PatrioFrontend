# Code review fixes — the seven items from the worktree review

Written against: `8615c7b`, on the current working tree (which carries the uncommitted
A1–A6 app-review work, the reminder rework, the tutorial work, and the new
`design-plans/` folder). Build on the working tree; do not reset to `HEAD`.

Status: **implemented in this working tree** (2026-10-16). The plan below is the
document as proposed; see "Implementation notes" at the end for the five places the
code ended up differing from it, and for the two steps that could not be completed
here.

Source of each item: the review findings, in the order they were ranked there. Each
phase is independently shippable and independently revertible; the build order at the
end is a recommendation, not a dependency chain.

---

## How to read this

| Phase | Item | Severity | Breaks a user flow? | Needs a device pass? |
| --- | --- | --- | --- | --- |
| F1 | Retry of a photo turn re-sends a local file path as the image | P0 | Yes — Retry silently cannot work | Yes |
| F2 | The AI consent gate has unguarded send paths (Fridge photo, Fridge recipes, retry) | P1 | No — compliance evidence only | Yes |
| F3 | The empty chat state repeats the disclosure the consent card is showing | P2 | No — copy/UX | No |
| F4 | `node scripts/check-i18n-keys.cjs` exits 1 on a false positive | P1 (CI gate honesty) | No | No |
| F5 | `npm test` is red, and the whole test suite is gitignored | P1 (the safety net) | No | No |
| F6 | A7 cleanup never landed (`react-native-webview`, template art) | P2 | No | No |
| F7 | The Legal notices screen loses the user's theme | P3 | No | Yes |

Every phase that adds user-visible copy adds it to `locales/en.json` **and**
`locales/zh.json`; `node scripts/check-i18n-keys.cjs` (after F4) and the en/zh parity
half of that script are the gate.

---

## F1. Retry of a failed photo turn must re-send the photo

### Goal

Tapping Retry on a failed-turn notice that carried a photo re-sends the same photo and
the same text, instead of an unusable `file://…` path.

### Evidence chain

- The transcript stores the *display* URI for a user photo: the composer sends
  `{ imageUri: attachment.displayUri, imageRequestUri: attachment.requestUri }`
  (`components/PlusMenu.js`, `hooks/usePhotoCapture.js:87-93`), and
  `addMessage` (`api/memoryManager.js:45`) writes `imageUri` into
  `content[].image_url` — the managed attachment path, never the base64 data URL.
- `retryPayloadFromMessages` rebuilds the request from that part and sets
  `imageRequestUri: imageUri` (`utils/chatErrorNotice.js:81`).
- `runStreamMessage` falls back to `imageUri` when `imageRequestUri` is absent
  (`api/gpt.js:1745-1748`) and `toChatCompletionsMessages` writes it into
  `image_url.url` (`api/gpt.js:509-516`) for all three providers (`:1854`, `:1929`).
- The on-device Apple path drops anything that is not a data URL
  (`api/gpt.js:310-331`), so the image silently disappears there.
- Persistence keeps durable managed attachments on purpose
  (`utils/chatStoragePolicy.js:223-253`), and `tests/chatErrorNotice.test.js:69-70`
  currently pins the broken expectation (file URI in, file URI out).
- Available API: `FileSystem.readAsStringAsync(uri, { encoding: "base64" })` from
  `expo-file-system/legacy`, already imported by `api/chatAttachments.js:1`.

### Design decision

**Re-materialise the data URL at retry time; never persist it.** The base64 payload is
exactly what `chatStoragePolicy` strips on purpose, so storing it is not an option. The
managed attachment file survives `pruneChatAttachments` (`api/chatAttachments.js:48`),
so it is the right source of truth.

**Split the decision from the I/O**, following the repo's own convention that every
rule that can be pure lives in a React-free/native-free module:

- the *what to do* is a pure function, unit tested under `node --test`;
- the *read the bytes* is a thin async helper that imports `expo-file-system/legacy`
  and therefore stays out of the tested path.

Retry stays a single tap. Behaviour table:

| Case | Behaviour |
| --- | --- |
| Image is a data URL (in-memory, incognito) | Re-send as-is |
| Image is a managed attachment that reads back | Re-send as full payload |
| Read fails, but the turn has real text | Re-send text-only (today's behaviour, now deliberate) |
| Read fails and there is no text | Do **not** remove the notice; alert once that the photo cannot be re-sent |

### Changes

1. `utils/chatErrorNotice.js` — add a pure planner next to
   `retryPayloadFromMessages`:

   ```js
   export const RETRY_MODE_FULL = "full";
   export const RETRY_MODE_TEXT_ONLY = "text-only";
   export const RETRY_MODE_BLOCKED = "blocked";

   // `imageDataUri` is the caller's materialised data URL ("" when it could not be
   // produced). Pure: no file system, no context.
   export function planRetrySend({ text = "", imageUri = "" } = {}, imageDataUri = "") {
     const hasText = Boolean(String(text).trim());
     const hasImage = Boolean(String(imageUri || "").trim());
     if (imageDataUri) return { mode: RETRY_MODE_FULL, text, imageRequestUri: imageDataUri };
     if (hasText) return { mode: RETRY_MODE_TEXT_ONLY, text, imageRequestUri: "" };
     if (hasImage) return { mode: RETRY_MODE_BLOCKED, text: "", imageRequestUri: "" };
     return { mode: RETRY_MODE_BLOCKED, text: "", imageRequestUri: "" };
   }
   ```

   Leave `payloadFromUserMessage` and `retryPayloadFromMessages` exactly as they are:
   they answer "is there something to retry", which is still true for a managed
   attachment. Do not change `canRetry` in `components/MessageList.js` — Retry stays
   visible, and the blocked case explains itself once, on tap.

2. `api/chatAttachments.js` — add the thin reader:

   ```js
   const DATA_IMAGE_PREFIX = "data:image/";

   // "" whenever the bytes cannot be produced: the caller then decides between a
   // text-only retry and refusing the retry. Never throws.
   export async function toRequestImageUri(uri) {
     const normalized = String(uri || "").trim();
     if (!normalized) return "";
     if (normalized.toLowerCase().startsWith(DATA_IMAGE_PREFIX)) return normalized;
     if (!isManagedChatAttachment(normalized)) return "";
     try {
       const base64 = await FileSystem.readAsStringAsync(normalized, {
         encoding: "base64",
       });
       return base64 ? `data:image/jpeg;base64,${base64}` : "";
     } catch {
       return "";
     }
   }
   ```

   It lives here rather than in `utils/` because this module already owns "what a
   managed attachment is" (`isManagedChatAttachment`, `:18`).

3. `app/(tabs)/chat.js` — `handleRetry` becomes async and plans before it mutates:

   ```js
   const handleRetry = async (noticeId) => {
     if (!mountedRef.current) return;
     const payload = retryPayloadFromMessages(messages, noticeId);
     if (!payload) return;

     const imageDataUri = payload.imageUri
       ? await toRequestImageUri(payload.imageUri)
       : "";
     if (!mountedRef.current) return;

     const plan = planRetrySend(payload, imageDataUri);
     if (plan.mode === RETRY_MODE_BLOCKED) {
       Alert.alert(t("chat.errors.imageRetryTitle"), t("chat.errors.imageRetryUnavailable"));
       return; // the notice stays, so the user can still Dismiss
     }

     setMessages((prev) => removeNotice(prev, noticeId));
     return sendTurn({
       text: plan.text,
       imageUri: imageDataUri || "",
       imageRequestUri: plan.imageRequestUri,
       appendUserMessage: false,
       history: (Array.isArray(messages) ? messages : []).filter(
         (entry) => entry?.isError !== true
       ),
     });
   };
   ```

   Note the deliberate `imageUri: imageDataUri || ""` on the retry: the turn is already
   in the transcript, so nothing may be appended or re-persisted, and passing the file
   path as `imageUri` is what fed the model the bad URL in the first place. `Alert` is
   already imported in this file.

4. `locales/en.json` + `locales/zh.json` — add under `chat.errors`:
   `imageRetryTitle` ("Couldn't re-send that photo" / "无法重新发送这张照片") and
   `imageRetryUnavailable` ("The photo is no longer on this device. Send a new one." /
   "这张照片已不在本设备上，请重新发送。").

5. `tests/chatErrorNotice.test.js` — keep the fixture at `:69-70` (it documents the
   transcript shape) and add cases for `planRetrySend`: data URL → full; managed path
   with bytes → full; no bytes with text → text-only; no bytes and no text → blocked;
   `[image]`-only turns still blocked (the existing placeholder rule).

### Verify

- Unit: `npm run test:unit` → the new cases pass, nothing else changes.
- Device: send a photo with the backend unreachable, then Retry → the assistant
  answers about the photo. Repeat with a text+photo turn and with a photo whose file
  was deleted (`pruneChatAttachments` after clearing the conversation) → text-only
  retry, and photo-only → alert, notice still dismissible.
- Device: Apple provider (`advanced.aiProvider === "apple"`) → the photo reaches
  `extractAppleImageBase64` and is no longer skipped.
- Regression: a normal (non-retry) photo send still uses the composer's data URL and
  the transcript still shows the managed attachment.

### Risks

- The base64 read is synchronous-ish over a file of up to ~1.6 MP JPEG (~200–600 KB);
  acceptable for a user-initiated tap, and the existing send path already builds the
  same string once per photo.
- iOS container paths can change across app updates, which would make an old stored
  attachment unreadable. `toRequestImageUri` returns `""` and the text-only/blocked
  branches handle it; the same staleness already affects the rendered thumbnail and is
  out of scope here.

---

## F2. Gate every AI send path on the disclosure acknowledgement

### Goal

No message, photo, or recipe request reaches a model before the account has
acknowledged the third-party AI disclosure — including the two Fridge entry points and
the retry path that A1 missed.

### Evidence chain

- The gate exists only in `app/(tabs)/chat.js`: `aiConsentRequired` (`:231`) guards
  `handleSend` (`:381`) and `handleSuggestion` (`:419`).
- Two Fridge paths call `streamMessage` directly and never consult
  `needsAiDisclosure`: `handlePhotoCaptured` (`app/(tabs)/fridge.js:489`) and
  `openRecipesForItems` (`app/(tabs)/fridge.js:424`, invoked from the long-press menu
  `:573` and the selection bar `:613`).
- `handleRetry` (`app/(tabs)/chat.js`) sends without consulting the gate, so a stored
  notice from before the acknowledgement can be retried.
- Workstream A1's plan states the requirement plainly: "Gate every send path, not just
  the chips… `handleSendImage` / `usePhotoCapture`'s `onCapture` all early-return while
  `needsAiDisclosure(settings)` is true."
- `utils/aiDisclosurePolicy.cjs` already holds the pure rule and
  `storageHydration.settings.resolved` is the existing "stored settings are known"
  signal (`context/GlobalContext.js:406`, used as `settingsResolved` at
  `app/(tabs)/chat.js:229`).

### Design decision

**One hook, three call sites, one sentence of copy.** The rule ("is it required, and
what do I do about it") is the same on both screens, and duplicating it is how this
drift happened. The hook is deliberately thin — the testable rule stays in the `.cjs`
policy module, per repo convention.

The Fridge case explains itself rather than silently teleporting the user to Chat:
tapping "Take a photo" and landing on a different tab with no explanation is worse than
one alert, and the alert can carry the fix ("Go to Chat", where the card is the
composer).

### Changes

1. `hooks/useAiDisclosureGate.js` (new):

   ```js
   // One place that answers "may this screen send anything to the model yet?".
   // The rule itself is pure and lives in utils/aiDisclosurePolicy.cjs.
   export default function useAiDisclosureGate() {
     const { settings, storageHydration } = useContext(GlobalContext);
     const resolved = storageHydration?.settings?.resolved === true;
     const required = resolved && !isAiDisclosureAcknowledged(settings);

     // Returns true when the caller may proceed; otherwise it explains and offers
     // the way to the card, and the caller must return.
     const ensure = useCallback(() => {
       if (!required) return true;
       Alert.alert(t("chat.aiConsentTitle"), t("chat.aiConsentSendBlockedBody"), [
         { text: t("common.cancel"), style: "cancel" },
         {
           text: t("chat.aiConsentGoToChat"),
           onPress: () => router.push("/chat"),
         },
       ]);
       return false;
     }, [required, t]);

     return { resolved, required, ensure };
   }
   ```

2. `app/(tabs)/chat.js` — replace the local `settingsResolved` /
   `aiConsentRequired` computation (`:229-232`) with the hook, so `ChatEmptyState`,
   the composer swap, and the gates all read one value. Add
   `if (!gate.ensure()) return;` at the top of `handleRetry` (the other three paths
   already early-return on `aiConsentRequired`; keep those as they are so the empty
   state's hidden chips and the composer swap are unchanged).

3. `app/(tabs)/fridge.js` — `const aiGate = useAiDisclosureGate();` and
   `if (!aiGate.ensure()) return;` as the first statement of both
   `handlePhotoCaptured` and `openRecipesForItems`. Nothing else in those functions
   moves: the local actions that never reach a model (add to shopping list, edit,
   delete, `confirmDeleteItems`) stay ungated.

4. `locales/en.json` + `locales/zh.json` — add under `chat`:
   `aiConsentSendBlockedBody` ("Agree to the AI data disclosure in Chat before sending
   messages or photos to the assistant." / "请先在聊天中同意 AI 数据处理说明，之后才能发送消息或照片。")
   and `aiConsentGoToChat` ("Go to Chat" / "前往聊天"). Title and Cancel reuse
   `chat.aiConsentTitle` and `common.cancel`.

5. `tests/aiDisclosurePolicy.test.js` — keep the pure cases and add a source guard in
   the style this repo already uses for cross-file invariants
   (`tests/tabTutorials.test.js`):
   - every `streamMessage(` call site under `app/` is in a file that also references
     `useAiDisclosureGate`;
   - both `app/(tabs)/chat.js` and `app/(tabs)/fridge.js` import the hook.

### Verify

- Unit: `npm run test:unit` → new guard passes; delete the import from
  `fridge.js` locally and confirm the guard fails (the test is only worth having if it
  can fail).
- Device, fresh account: Fridge → `+` → Take a photo → the alert appears, no request is
  sent, "Go to Chat" lands on the consent card; after Continue, the same flow sends.
  Same for long-press → recipes. Chat: sending and the chips are unchanged from A1.
- Device, acknowledged account: both Fridge flows send exactly as they do today.

### Risks

- `openRecipesForItems` reads `streamMessage` only after the gate, but it also clears
  selection state and navigates; make sure the early return happens before any of that
  so a blocked tap leaves the screen untouched.
- The hook renders an `Alert`, so it must not be called during the initial hydration
  window in a way that flashes: `required` is false until
  `storageHydration.settings.resolved` is true, which is the same protection the chat
  screen already relies on.

---

## F3. Stop repeating the disclosure on the empty chat state

### Goal

While the consent card is on screen it is the only place the disclosure appears.

### Evidence chain

- `ChatEmptyState` hides the suggestion chips when `hideSuggestions` is true
  (`app/(tabs)/chat.js:152`) but still renders `chat.aiNotice` (`:193`), and the card is
  rendered in the composer slot (`:725`) — so an unacknowledged account sees the same
  substance twice on one screen.
- Workstream A1: "when not acknowledged, render `<AiDataConsentCard />` in place of the
  suggestion chips **and the `chat.aiNotice` line**… Never show both."

### Design decision

Keep the card where it is (the composer slot is where the blocked controls live, and
that placement was a deliberate, recorded deviation). Remove the second disclosure
instead: the notice line is the part that duplicates it.

### Changes

1. `app/(tabs)/chat.js` — rename the prop `hideSuggestions` → `consentPending` and use
   it for both the chips and the notice:

   ```jsx
   {consentPending ? null : <View style={styles.suggestionChips}>…</View>}
   …
   {consentPending ? null : (
     <Text style={[styles.emptyNote, …]}>{t("chat.aiNotice")}</Text>
   )}
   ```

   Pass `consentPending={aiConsentRequired}` at `:709`. No locale change: the string
   stays in the catalog for the acknowledged state.

### Verify

- Unit: nothing (pure UI).
- Device, unacknowledged: the empty state shows icon, title, and body, then the card —
  no chips, no notice line. Acknowledged: exactly what ships today.
- `node scripts/check-i18n-keys.cjs` still clean (the key is still referenced).

---

## F4. Make the i18n gate pass again

### Goal

`node scripts/check-i18n-keys.cjs` exits 0 and still fails on real drift.

### Evidence chain

- `KEY_RE` (`scripts/check-i18n-keys.cjs:48`) matches a backtick template as if it were
  a literal key, so `t(\`chat.suggestions.meals.${mealForDate(now)}\`)`
  (`app/(tabs)/chat.js:157`) is reported as missing and the script exits 1.
- The keys themselves are present and covered: `chat.suggestions.meals.{breakfast,lunch,dinner}`
  exist in both catalogs (1066 keys each, verified by parity check), and
  `tests/chatSuggestions.test.js` already asserts every `meals.<id>` resolves in both
  locales and that `cookLabel`/`cookPrompt` carry `{{meal}}`.
- `tests/chat-empty-state-dynamic-suggestions.md` and the workstream-A plan both list
  this script as a validation gate, so a permanently red gate hides the next real
  failure.

### Design decision

Fix the scanner, not the call site. A statically-unresolvable template key is a class of
false positive, and the meal keys already have a dedicated test; suppressing the call
site would only hide the next one. The alternative — a literal key map in
`utils/chatSuggestions.js` plus `t(MEAL_KEYS[mealForDate(now)])` — also clears the
error and is recorded here as the fallback if the script is intentionally frozen.

### Changes

1. `scripts/check-i18n-keys.cjs`:
   - skip matched keys containing `${` and count them, so the summary line can report
     "N template key(s) skipped (not statically checkable)";
   - leave the en/zh parity half untouched;
   - keep the exit-1 behaviour for genuinely missing literal keys.
2. Optional belt-and-braces, same file: also treat a key matched from a backtick
   template *without* `${` as literal (it is checkable), so only interpolated keys are
   skipped.

### Verify

- `node scripts/check-i18n-keys.cjs` → exit 0, and the summary names both the literal
  key count and the skipped template count.
- Negative test by hand: rename one real key in `locales/en.json` → the script still
  fails; restore it.
- `npm run test:unit` unaffected.

---

## F5. Make the test gate real again

### Goal

`npm test` is green in this checkout, and the suite it runs is versioned so another
clone or CI can run it.

### Evidence chain

- `tests/aiProviderSlotComparison.test.js:20` imports `../refactor/aiProviderSlotModel.js`
  — a path that has never existed in git history (`git log --all -- refactor` is empty,
  the directory is not on disk). The Fridge plan calls this failure pre-existing and
  unrelated; it is nevertheless the documented gate, and it hides everything after it
  in a `--test` run.
- `.gitignore:48` ignores `tests/` and `:50` ignores `docs/`; `git ls-files tests docs`
  is empty. The 54 test files are the only automated proof for the A1 work, the reminder
  rework, the failed-turn notices, and the tutorial samples, and none of it is in the
  repository.
- `scripts/run-unit-tests.cjs:8` calls `readdirSync("tests")` unguarded, so in a clone
  without the directory `npm test` dies with `ENOENT` instead of a usable message.
- `design-plans/` is *not* ignored, so a `git add -A` would commit the plans while their
  tests stay behind — the worst of both.

### Design decision

Two separate commits, because they are separate decisions: one makes the suite pass,
the other makes it exist in the repository. Commit `tests/` (the suite is product
evidence, not scratch work) and then decide `docs/` explicitly — it currently holds
generated artefacts (`PANTRIO_LOCALIZATION_EN_ZH.docx/pdf`, `.html` pages, `.png`
emoji) next to the plan/report markdown that `design-plans/` cites, so the
recommendation is to un-ignore the markdown only (`docs/*.md`) and keep the generated
artefacts out.

### Changes

1. `tests/aiProviderSlotComparison.test.js` — delete it. It asserts the behaviour of a
   refactor that never landed; the design comparison itself is preserved in
   `design-plans/` and in `refactor/`'s absence. (Alternative if that comparison is
   wanted as a design record: move the file to `design-plans/` as prose and keep the
   suite pure.) Do **not** add a stub `refactor/aiProviderSlotModel.js` — a module with
   no product caller would exist only to make a test pass.
2. `.gitignore` — remove the `tests/` line; add `docs/*.md` negation if `docs/`
   markdown is to be versioned. Leave the rest of the file as it is, including the
   `recipe-card-feature/` scratch rule.
3. `scripts/run-unit-tests.cjs` — guard the directory read:

   ```js
   const testsDir = join(process.cwd(), "tests");
   if (!existsSync(testsDir)) {
     console.error("No tests/ directory found — run this from the app root.");
     process.exit(1);
   }
   ```

4. Commit the suite (`git add tests/`), so the number of files under version control
   matches what `npm test` runs. No network, no generated files.

### Verify

- `npm test` → 307+ tests, 0 failures, exit 0.
- `git ls-files tests | wc -l` non-zero; `git status` after the commit shows no
  remaining ignored-but-expected suite files.
- Re-run `npm run lint` (`expo lint`) → unchanged 3 pre-existing errors in
  `scripts/`/`tests/`, 0 in app code.

### Risks

- If the team wants `tests/` to stay local (the `.gitignore` comment says "kept local
  for recipe-card work"), then the honest alternative is to keep it ignored and stop
  listing `npm test` as a validation gate in the plans. Pick one; the current state
  claims both.

---

## F6. Finish A7 (bundle cleanup)

### Goal

No unused native dependency in the binary, no Expo template art in the app bundle.

### Evidence chain

- Workstream A7: remove `react-native-webview`, delete the four template images after a
  reference check, and regenerate the licence catalogue. None of it landed:
  `package.json:69` still declares `"react-native-webview": "13.16.1"`,
  `assets/legal/licenses.json` still lists it (entry at `:3673`), and no source file
  imports it (`rg "react-native-webview" app components api utils context` is empty).
- `assets/images/react-logo.png`, `react-logo@2x.png`, `react-logo@3x.png`, and
  `partial-react-logo.png` are still present.

### Changes

1. `package.json` — delete the `react-native-webview` entry, then `npm install` to
   refresh `package-lock.json` (needs network; escalate for the install step).
2. `node scripts/build-licenses.cjs` and confirm `react-native-webview` is gone from
   `assets/legal/licenses.json`.
3. `rg "react-logo|partial-react-logo"` (`app/`, `components/`, `assets/`, config
   files) → expect no references → delete the four files with `apply_patch`/`Remove-Item`
   against the resolved paths.
4. After the next prebuild, confirm `react-native-webview.podspec` no longer appears
   under `ios/Pods`. Note in the commit message that the binary shrinks on the next
   build, not in this commit.

### Verify

- `npm run config:check`, `npm test`, `npm run lint` all unchanged.
- A device build launches and the licence screen still renders (it reads the
  regenerated JSON).

---

## F7. Give the Legal notices screen the user's theme (optional)

### Goal

Opening Settings → Legal notices in dark mode shows a dark page.

### Evidence chain

- `app/legal/_layout.js` was added to fix a real crash (no `GlobalProvider` above
  `licenses.js`, so `useContext(GlobalContext).theme` was undefined), but it mounts the
  provider with no `authUser`, so `storageOwnerUid` is `null`
  (`context/GlobalContext.js:992`), settings never hydrate, and the screen renders the
  defaults. The route is only reachable while signed in (root stack,
  `app/_layout.js:169`; pushed from `app/(tabs)/settings.js:1992`).

### Design decision

Pass the authenticated user into the provider, exactly as the tabs tree does
(`app/(tabs)/_layout.js:281`). The trade-off must be stated: the legal route then gets a
second hydration of the same uid-scoped storage, which can re-run the legacy
migrations and the debounced reminder sync. Both are lock-guarded and
cancel-then-reschedule, so the outcome is the same schedule, but it is duplicated work
on a cold open of a rarely visited screen.

If that trade is unwanted, keep the light default and record it as a known cosmetic
limitation instead of building a read-only provider for one page.

### Changes

1. `app/legal/_layout.js` — `const { user } = useAuth();` and
   `<GlobalProvider authUser={user ?? null}>`.

### Verify

- Device: dark mode, Settings → Legal notices → dark page, font size respected; back
  out and confirm the tabs screen is unchanged; check the debug log for a single
  reminder sync (or accept the duplicate).

---

## Build order

1. **F1** — the only item that fails a user visibly. Ship alone, device-tested.
2. **F4 + F5** — no product code, unblocks the gates everything else is judged by
   (`npm test`, `check-i18n-keys`). Doing these two first makes the rest of the list
   verifiable.
3. **F2** then **F3** — F2 touches the same chat call sites as F1's retry work, so land
   it second to avoid rebasing the hook into a moved `handleRetry`.
4. **F6** — independent, needs an install and a prebuild to confirm.
5. **F7** — last, and only if the duplicate-hydration trade is accepted.

## Verification (whole set)

```
npm test                             # F5: 0 failures
node scripts/check-i18n-keys.cjs     # F4: exit 0, template keys skipped
npm run lint                         # unchanged: 3 pre-existing, 0 in app code
npm run config:check                 # unaffected by F6
```

Device pass (iOS 26 dev build, EN and ZH, light and dark):

1. Fresh account → Fridge `+` → Take a photo → blocked with an explanation, no request
   leaves the device; Chat → Continue → the same flow sends (F2, F3).
2. Failed photo turn → Retry → the assistant answers about the photo (F1).
3. Failed text turn → Retry → unchanged behaviour (F1 regression).
4. Empty chat on an unacknowledged account → one disclosure, not two (F3).
5. Settings → Legal notices in dark mode (F7, if shipped).

## Stop conditions

- Stop F1 if the product decision is "photo turns are not retryable": then the smaller
  honest change is `canRetry = false` for any turn whose only content is an image, and
  F1 collapses to a one-line change plus a test.
- Stop F2 if routing a blocked Fridge tap anywhere other than the same screen is
  rejected — the alternative is disabling the two Fridge entries until the
  acknowledgement exists, which is smaller but loses discoverability.
- Stop F4 if `scripts/check-i18n-keys.cjs` is deliberately frozen; use the literal-key
  fallback instead and record why.
- Stop F5 if `tests/` is intentionally local-only; then remove `npm test` from the
  plans' validation sections rather than leaving a permanently red gate.
- Stop F7 if a second hydration of the same account is judged unsafe; keep the light
  default and document it.

## Rollback

Every phase is one to four files and reverts independently:

| Phase | Files |
| --- | --- |
| F1 | `utils/chatErrorNotice.js`, `api/chatAttachments.js`, `app/(tabs)/chat.js`, `locales/*`, `tests/chatErrorNotice.test.js` |
| F2 | `hooks/useAiDisclosureGate.js` (new), `app/(tabs)/chat.js`, `app/(tabs)/fridge.js`, `locales/*`, `tests/aiDisclosurePolicy.test.js` |
| F3 | `app/(tabs)/chat.js` |
| F4 | `scripts/check-i18n-keys.cjs` |
| F5 | `.gitignore`, `scripts/run-unit-tests.cjs`, `tests/aiProviderSlotComparison.test.js`, plus the `tests/` commit |
| F6 | `package.json`, `package-lock.json`, `assets/legal/licenses.json`, four images |
| F7 | `app/legal/_layout.js` |

No stored data changes in any phase, so there is no migration to reverse. F1's retry
payload is rebuilt per tap and never persisted, which is what keeps that true.

---

## Implementation notes (2026-10-16)

What landed, and the five deltas from the text above.

### Deltas

1. **F1 — the retry sends the data URL in both image fields.** The plan said
   `imageUri: ""` plus `imageRequestUri: <data URL>`. `runStreamMessage`'s emptiness
   guard read only `normalizedImageUri`, so an image-only retry would have thrown
   `chat.errors.messageEmpty`. Fixed in two places: `api/gpt.js` now also considers
   `normalizedImageRequestUri` (the two fields fall back to each other one line
   above, so the guard was simply inconsistent), and `handleRetry` passes the data
   URL as `imageUri` too. Nothing is persisted by that path — `appendUserMessage:
   false` skips `addMessage` entirely.
2. **F2 — chat.js returns silently instead of alerting.** The plan had
   `handleRetry` call `gate.ensure()`. That would have shown "go to Chat" to a user
   who is already on Chat, with the card on screen, so the retry guard is a plain
   `if (aiConsentRequired) return;`. `ensure()` is used on the Fridge screen, where
   the navigation is the point.
3. **F2 — the Fridge gate also covers the menu rows.** `handlePhotoCaptured` runs
   *after* the camera, so gating there alone would let an unacknowledged user take
   the photo and then lose it. The `FridgeAddMenu` handlers now call `ensure()`
   before opening the camera or the picker, and the check inside
   `handlePhotoCaptured` stays as the last gate for any other route into
   `onCapture`.
4. **F5 — the stale test was deleted, not rewritten**, and the `docs/` decision was
   taken: `tests/` is now versioned in full, `docs/*.md` is versioned, and the
   generated artefacts beside it (`docx`, `pdf`, `html`, `docs/assets/`) stay
   ignored. The suite was **not committed** — that is a repository action left to
   the owner.
5. **F6 — `npm install` needed npm's CLI directly.** The `npm`/`npx` shims on this
   machine point at a missing `%APPDATA%\npm\node_modules\npm\bin\npm-cli.js`, so
   `node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" install` is the
   working invocation. Result: `react-native-webview` gone from `package.json`,
   `package-lock.json`, `node_modules`, and `assets/legal/licenses.json` (the two
   surviving mentions in the lock are `expo`'s own optional peer declaration and
   are correct).

### Not done here

- **`ios/Pods` verification** (F6 step 4): needs the next `expo prebuild` / native
  build. The pod leaves on its own once autolinking no longer sees the package.
- **Device passes** for F1, F2, and F7, and the `git add tests/` commit. The
  simulator/device steps in each phase's Verify section still need a human.

### Verification actually run

| Command | Result |
| --- | --- |
| `node scripts/run-unit-tests.cjs` | **313 tests, 313 pass, 0 fail** (was 307/308) |
| `node scripts/check-i18n-keys.cjs` | **exit 0** — 706 literal keys checked, 1 template key reported as skipped, en/zh parity clean (was exit 1) |
| `node node_modules/eslint/bin/eslint.js .` | 2 errors, 11 warnings — all pre-existing in `scripts/build-licenses.cjs` and unrelated app files; the deleted test's unresolved-import error is gone |
| `npm run config:check` (production profile) | fails on this machine only: `EXPO_PUBLIC_TERMS_OF_USE_URL` is unset in `.env`, which the production profile has required since the A1 work. The `development` profile validates. |

### Files touched

`utils/chatErrorNotice.js`, `api/chatAttachments.js`, `api/gpt.js`, `app/(tabs)/chat.js`,
`app/(tabs)/fridge.js`, `hooks/useAiDisclosureGate.js` (new),
`app/legal/_layout.js`, `locales/en.json`, `locales/zh.json`,
`scripts/check-i18n-keys.cjs`, `scripts/run-unit-tests.cjs`, `.gitignore`,
`package.json`, `package-lock.json`, `assets/legal/licenses.json`,
`tests/chatErrorNotice.test.js`, `tests/aiDisclosurePolicy.test.js`;
removed `tests/aiProviderSlotComparison.test.js` and the four template images.
