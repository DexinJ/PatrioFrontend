# Pantrio Client — Codebase Report

Repository: `D:\firdge_manager\fridge-manager`
Branch / revision: `main` @ `c4181d6` (*changed recipe card*)
Report scope: every tracked source, config, test, and native file in this
repository. The sibling workspace `D:\mobileSearcherBackend` was not in scope.

---

## 1. What this project is

Pantrio is an **Expo / React Native iOS app** (JavaScript, no TypeScript
sources) that manages fridge, freezer, and pantry inventory, a shopping list,
expiration reminders, and an AI food assistant. It is a *client only*: all
persistence that matters is local, and everything model- or account-related is
delegated to a separate Pantrio backend over REST plus a WebSocket.

Three AI providers can serve a chat:

| Provider | Transport | Runs where |
| --- | --- | --- |
| `pantrio` (default) | WebSocket to the Pantrio backend | Server, with client-side tool execution |
| `custom` | HTTPS `POST {baseUrl}/chat/completions` | Device, using a user-supplied OpenAI-compatible endpoint |
| `apple` | Local Foundation Models native module | On-device Apple Intelligence (iOS builds only) |

## 2. Verified snapshot

| Fact | Value |
| --- | --- |
| Git-tracked files | 123 at `c4181d6` (this report and the flowchart are new, untracked docs) |
| Test files | 28 (≈3,000 lines) — **on disk but not tracked** |
| Unit tests | 139 total, 138 passing, 1 failing |
| i18n catalog | 630 keys used in code, all present; `en` and `zh` key sets identical |
| Largest source file | `app/(tabs)/settings.js` — 3,790 lines |
| Package manager / Node | npm; engines `^20.19.4 \|\| ^22.13.0 \|\| ^24.3.0 \|\| >=25`; EAS pins 22.13.0 |
| Expo SDK | 57 (`expo ~57.0.12`), React Native 0.86.2, React 19.2.3 |
| Native code | 2 local Expo modules (Swift), 1,120 lines |

## 3. Stack

Runtime: Expo SDK 57, Expo Router 57 (file-based routing, typed routes enabled),
React Native 0.86, React 19.2.

State: React Context only (`GlobalContext`, `ChatContext`,
`ChatActionsContext`, `AuthContext`, `AccountSessionContext`,
`SubscriptionContext`, `GptContext`) plus refs for generation guards. There is
no Redux/Zustand/React Query.

Key libraries: `firebase` (Auth JS SDK), `@react-native-async-storage/async-storage`,
`expo-secure-store`, `@react-native-google-signin/google-signin`,
`expo-apple-authentication`, `react-native-markdown-display` + `markdown-it`
(custom flow renderer), `link-preview-js`, `@sentry/react-native`,
`expo-notifications`, `expo-image-picker` + `expo-image-manipulator`,
`expo-audio` (voice path currently disabled), `uuid`, `i18next` +
`react-i18next` + `expo-localization`, `react-native-dropdown-picker`,
`react-native-popover-view`.

Build: EAS Build with three profiles (`development`, `preview`, `production`),
`runtimeVersion.policy = fingerprint`, EAS Update channels matching each
profile, `autoIncrement` and `appVersionSource: remote` for production.

## 4. Directory map

```
app/          Expo Router routes (11 files)
  _layout.js            Sentry wrap → AuthProvider → Stack with route guards
  (auth)/               _layout, onboarding, sign-in, sign-up
  (tabs)/               _layout, index (home), chat, fridge, list, settings
api/          Backend + AI + storage services (21 files)
auth/         Firebase client, providers, reauth, secure persistence (7)
components/   Presentational + modal components (21)
context/      Global/chat state, account session, subscriptions, policy (4)
utils/        Pure, unit-tested helpers (22)
i18n/         i18next bootstrap (en, zh)
locales/      en.json, zh.json (922 lines each)
modules/      2 local Expo native modules (Swift + JS bridge) (8)
scripts/      test runner, i18n key checker, text extractor, test setup (5)
tests/        28 node:test files — ignored by git (see §12)
docs/         this report and docs/architecture-flowchart.md
assets/       icon, splash, adaptive icon, SpaceMono font
```

`app.config.js` (191 lines) is the real build gate; `app.json` holds the static
Expo config.

## 5. Runtime composition

`app/_layout.js` initializes Sentry, restores the saved language, and mounts
`AuthProvider` inside a `Sentry.ErrorBoundary`. `AppNavigator` uses Expo
Router's `Stack.Protected` with `guard={!loading && !user}` for `(auth)` and
`guard={!loading && Boolean(user)}` for `(tabs)`. An account-deletion overlay
takes over the whole tree while deletion is in flight.

The tabs layout nests providers deliberately:

```
AppleSubscriptionProvider (keyed by user.uid)
└── AccountSessionProvider            → GET /api/session, entitlement/quota/model
    └── SessionBackedGlobalProvider   → blocks UI until canExposeAccountData()
        └── GlobalProvider            → inventory, settings, chat, theme, storage
            └── GptProvider           → chat transport + tool runtime
                └── ThemedTabs        → 5 tabs + conversation drawer
```

Before any tab renders, `ThemedTabs` also requires `storageHydrated` (all four
storage slices resolved) and a clean `storagePurgeResult`; failures route to a
retry/log-out recovery screen instead of rendering defaults.

### Routes

| Route | File | Role |
| --- | --- | --- |
| `/(auth)/onboarding` | `app/(auth)/onboarding.js` | 5-page intro carousel → sign-up / sign-in |
| `/(auth)/sign-up` | `app/(auth)/sign-up.js` | Email/password + Google + Apple provisioning |
| `/(auth)/sign-in` | `app/(auth)/sign-in.js` | Email/password + Google + Apple |
| `/(tabs)/index` | `app/(tabs)/index.js` | Dashboard: item/expiry/shopping counts |
| `/(tabs)/chat` | `app/(tabs)/chat.js` | Assistant chat + UI-action application |
| `/(tabs)/fridge` | `app/(tabs)/fridge.js` | Inventory: search, tabs, sort, bulk actions, recipes |
| `/(tabs)/list` | `app/(tabs)/list.js` | Shopping list: categories, checkoff, "done shopping" |
| `/(tabs)/settings` | `app/(tabs)/settings.js` | Account, plan/usage, preferences, privacy, AI provider |

Settings is a five-section drill-down: **Account**, **Plan & Usage**,
**Preferences**, **Privacy & Data**, **AI Provider (advanced)**. It owns
username PATCH, language selection, font size, theme, urgency thresholds,
reminder toggles, recipe preferences, clear-all-data, logout, account deletion,
and the per-provider AI slot editor.

## 6. Authentication and account lifecycle

`auth/firebaseClient.native.js` initializes Firebase Auth with a **custom
persistence adapter**, `auth/secureFirebaseStorage.js`. That adapter encrypts
session material through `expo-secure-store` with
`WHEN_UNLOCKED_THIS_DEVICE_ONLY`, splits large values into 1,500-character
chunks with a generation-stamped manifest, migrates legacy plaintext
AsyncStorage keys exactly once, and falls back to memory-only (never plaintext)
if SecureStore is unavailable.

Provider sign-in:

* **Apple** (`auth/appleAuth.js`) — SHA-256 nonce, `expo-apple-authentication`,
  Firebase `OAuthProvider('apple.com')` credential, then a best-effort
  `POST /api/auth/apple/link` so the backend can retain the revocation
  credential. Link failure is recorded as `relink_required` and never blocks
  sign-in.
* **Google** (`auth/googleAuth.js`) — native Google Sign-In with the iOS and web
  client IDs; `app.config.js` derives the reversed iOS URL scheme from the same
  iOS client ID so the two cannot drift.
* **Email/password** — Firebase directly.

`auth/useAuth.js` (1,199 lines) is the app's most defensive module. It keeps a
generation counter, a `rawUserRef`, and a `pendingUserRef` so a user is only
published after reconciliation. On every auth-state change it:

1. finishes any accepted account deletion,
2. resolves a pending provisioning marker (deleting a Firebase-only account
   whose backend profile never committed),
3. clears durable breadcrumbs, then publishes the user.

Account deletion is a durable, resumable state machine rather than a single
request: reauthenticate with the linked provider → write a lifecycle marker and
a purge intent → `DELETE /api/users/{uid}` → classify the response via
`api/accountDeletionPolicy.cjs` (accepts `200/202` and the `410`
`ACCOUNT_DELETION_IN_PROGRESS`/`ACCOUNT_DELETED` tombstone bound to the exact
UID) → purge local data → revoke Google/Apple access → sign out → clear
markers. Ambiguous outcomes keep the device locked behind a recovery screen
with explicit retry, sign-out, and clear-device-data choices.

## 7. AI subsystem

`api/gpt.js` (1,433 lines) is the transport and tool runtime.

**Tools** (`api/gptTools.js`, 734 lines) are executed on the client against
`GlobalContext`: `addFridgeItem`, `addShoppingItem`, `removeFridgeItem`,
`removeShoppingItem`, `findInFridge`, `findInShoppingList`,
`getFridgeContents`, `getShoppingListContents`, `streamlineLists`,
`updateFridgeItem`, plus four confirmation-card tools. `api/recipeAssistant.js`
adds `recommendRecipes` and `proposeRecipePreferenceUpdate`.

**Ownership routing**: `isServerOwnedGPTTool` treats `webSearch` and
`recommendRecipes` as server-owned on the Pantrio WebSocket path;
`claimClientOwnedGPTToolCalls` filters out anything already claimed so a mixed
tool batch cannot be executed twice.

**WebSocket protocol** (client → server `start`, `tool_results`, `cancel`;
server → client `hello`, `started`, `delta`, `quota_budget*`, `tool_calls` /
`awaiting_tool_results`, `tool`, `error`, `done`). Assistant text is batched at
50 ms per render to keep streaming cheap; sockets idle-close after 30 s and are
cancelled when the app backgrounds or the account signs out.

**System prompt** (`api/buildSystemMessage.js`) is long and prescriptive: strict
scope limits, tool-only state changes, whole-day `expiresInDays` expiry
estimates (never calendar dates), a mandatory
`getFridgeContents → recommendRecipes` sequence for recipe requests, and a
hard rule that confirmation tools change nothing until the user taps the card.
The same prompt is reused by all three providers so recipe routing cannot
drift (`api/systemPrompt.js` is a thin re-export shim).

**Ingredient context** is never inlined: the fridge and shopping list are read
through tools. `buildRecipeContext` sends only inventory name/quantity,
selected ingredients, saved preferences, and the language.

## 8. Inventory domain model

Items are `{ id, name, quantity, tagIds, createdAt, updatedAt, expiresAt }`. All
categories are **preset tags** (28 of them) in four types — `storage`,
`urgency`, `food_type`, `state` — defined inline in `context/GlobalContext.js`.
`utils/tags.js` normalizes typed objects, legacy arrays, id lists, and
comma-strings into deduped tag ids; unknown labels are ignored rather than
invented.

Expiry is derived, not trusted:

* `utils/expiration.js` computes `{ expired, almostExpired, daysUntil, urgencyKey }`
  from an ISO timestamp, treating date-only values as end-of-local-day.
* `utils/expiryPredictor.js` estimates shelf life from a
  storage × food_type × state matrix (raw meat 2 d, opened dairy 7 d, frozen
  meat 180 d, …), caps it at 36,500 days, and rejects implausible absolute
  dates such as 1960.
* `GlobalContext.fridgeItems` re-derives the urgency tag on every read, so a
  stored urgency tag can never go stale. A midnight timer plus an `AppState`
  listener refresh the clock.

`utils/reminderPolicy.js` + `api/reminderScheduler.js` schedule at most 40
date-triggered reminders at 09:00, `remindDays` before expiry. Items already
inside that window re-arm for the next 09:00 rather than being dropped, and the
whole set is cancelled and replaced through a "latest wins" task queue
(`utils/latestTaskQueue.js`) whenever the relevant settings or items change.
Tapping one of those notifications opens the Fridge tab on the item it is about
(`utils/notificationRouting.js` + `hooks/useNotificationRouting.js`).

## 9. Recipe assistant

`api/recipeAssistant.js` contains the `recommendRecipes` tool schema (dish
query, cuisines, energy, calorie/time caps, meal type, skill, cooking method,
dietary patterns, must-use and excluded ingredients, servings, result count),
the preference-proposal tool, an explicit `findRecipes` UI action (the old
bilingual `inferChatIntent` classifier was removed; text routing now lives in
the backend's `resolveRequestRouting`), and `customRecipeToolPolicy` which
forces a two-step `getFridgeContents` → `recommendRecipes` sequence for custom
providers.

Results become `recipe_cards` chat messages (`utils/recipeCards.js`, capped at
4 recipes, 12 instructions, bounded and URL-validated) rendered by
`components/RecipeResultCards.js`. Missing ingredients are ordered so pantry
staples sink below real blockers (`prioritizeMissingIngredients`), and
`utils/recipeShoppingList.js` deduplicates case-insensitively and
Unicode-normalized item names before anything is added to the shopping list.

Recipe preferences (`utils/recipePreferences.js`) split into `explicit` (user
or AI-proposed, normalized and bounded) and `learned` (score maps, present but
inactive), versioned with `schemaVersion: 1`.

## 10. Local storage and privacy

Every account-scoped key is derived from
`getUserStorageKeys(uid)` in `api/storageKeys.js`: the UID is hex-encoded into
a `@pantrio:user:<hex>:…` namespace for fridge, shopping, settings, chat index,
and per-conversation payloads. Legacy unscoped keys are handled three ways:

* If a legacy owner marker exists and matches, values migrate once into the
  scoped namespace and the legacy keys are deleted.
* If no owner marker exists, ambiguous legacy values are **deleted**, not
  claimed — an unscoped value cannot be safely attributed to the next user.
* A quarantine namespace absorbs interrupted migrations.

Deletion and clear-all share a journaled purge (`api/userDataPurge.js`,
`api/storageKeys.js` purge intents, `api/legacyPurgePolicy.cjs`): an intent is
written first, each scope purges independently with `Promise.allSettled`, and
partial failure keeps a retryable marker plus read-only storage so surviving
data cannot be silently overwritten with defaults.

Chat storage is the most intricate piece (`context/GlobalContext.js` plus
`utils/chatStoragePolicy.js`): multiple conversations, a v2 index with an
active id, per-conversation payload keys, a per-user serialized write queue, a
generation counter that invalidates in-flight writes after a delete, image
placeholders on persistence, file attachments under
`documentDirectory/pantrio-chat-attachments/<uid>/` pruned to exactly the
retained URIs, and an incognito mode that keeps messages in memory and wipes
stored conversation payloads on exit.

## 11. Internationalization, markdown, and images

`i18n/index.js` resolves language as saved preference → device locale → `en`,
with `en` and `zh` shipped. Tag labels stay canonical English in storage and
are translated only at render time (`utils/tagTranslation.js`), so switching
language never rewrites data.

Assistant markdown is parsed to a serializable block/segment tree
(`utils/markdownFlow.js`, `utils/markdownSegments.js`) so each message renders
as one selectable text run on iOS; `markdown-it` runs with `html: false`,
`linkify: false`, and tables are flattened to plain text because they render
poorly on device. URLs are split out into preview cards, and
`utils/linkPreviewPolicy.js` refuses non-HTTPS, credentialed, loopback, and
private-range hosts and never auto-fetches metadata.

Images (`components/PlusMenu.js`) are validated (≤20 MB, ≤30,000 px edge,
≤100 MP), resized to 1,600 px, JPEG-compressed at 0.65, sent as a base64 data
URL for the request, and stored as a managed file for display — except in
incognito, where only the temporary URI is kept.

## 12. Testing and quality gates

`npm test` → `scripts/run-unit-tests.cjs`, which runs all `tests/*.test.js`
through Node's built-in test runner with an i18next test shim. 28 files cover
account-deletion policy, chat storage policy, chat message ordering, expiry,
fridge/bulk proposal lifecycles, GPT tool ownership, markdown flow and
segmentation, recipe cards/preferences/shopping list/intent, reminder policy,
refresh policy, storage migration, tag normalization, composer layout, and the
Apple subscription snapshot policy.

Two additional gates exist: `scripts/check-i18n-keys.cjs` (verifies every
`t()`/`i18next.t()` key exists in `en.json` and that locale key sets match) and
`npm run config:check` (loads `app.config.js` with `EAS_BUILD=true` and
`production` to prove the production env contract holds).

Observed results on this revision:

* `node scripts/run-unit-tests.cjs` → **139 tests, 138 pass, 1 fail**.
  The failure is `tests/aiProviderSlotComparison.test.js`, which imports
  `../refactor/aiProviderSlotModel.js` — a path that does not exist anywhere in
  the repository. Every other suite passes.
* `node scripts/check-i18n-keys.cjs` → **OK**: 630 keys used, all present; both
  locale files mirror `en.json` exactly.
* `npm run lint` / `npm test` could not be executed here because the local npm
  CLI shim is broken (`npm-cli.js` missing); the underlying Node scripts run
  fine directly.

## 13. Build and configuration

`app.config.js` is a guarded wrapper around `app.json`. On an EAS build it:

* requires `EXPO_PUBLIC_API_BASE_URL`, `EXPO_PUBLIC_WS_URL`, the four Firebase
  values, and both Google client IDs;
* for production additionally requires the Apple product list and a public
  privacy-policy URL;
* validates the EAS project UUID against `expo.updates.url`;
* proves the Firebase app ID and both Google OAuth client IDs share one
  Google Cloud project number;
* rejects non-HTTPS API/legal URLs, non-`wss:` sockets, loopback hosts,
  credential-bearing or query-bearing URLs;
* derives the Google iOS URL scheme from the iOS client ID;
* turns off arbitrary-load ATS exceptions for production iOS builds.

`app.json` also pins `runtimeVersion.policy: fingerprint`, the `pantrio`
scheme, bundle id `com.chilltech.pantrio`, the Sentry Expo plugin, and the
`expo-audio` microphone permission strings (for the currently disabled voice
feature).

## 14. Native modules (iOS only)

| Module | Files | Purpose |
| --- | --- | --- |
| `modules/apple-intelligence` | `AppleIntelligenceModule.swift` (107), `src/index.js` (39) | Foundation Models availability probe, settings deep link, `generate`, `generateToolTurn` |
| `modules/apple-subscriptions` | `AppleSubscriptionsModule.swift` (1,013), `src/index.js` (287) | StoreKit 2 product catalog, purchase, restore, unfinished-transaction listing, `finish`, subscription status + transaction event emitters |

Both are declared with `platforms: ["apple"]` and are unreachable on other
platforms by design; `getAppleIntelligenceAvailability()` and the subscription
bridge return explicit `unsupported_platform` / "iOS only" states elsewhere.
Because of these modules, Apple Intelligence and purchases only work in an iOS
development/TestFlight/App Store build, never in Expo Go.

## 15. Observations and risks

Ordered by practical impact. Each is evidenced above; none of these are
speculative.

**P1 — The entire test suite is git-ignored.** `.gitignore:48` excludes
`tests/`, and `git ls-files tests` returns 0 files. 28 test files (≈3,000
lines, 139 tests) exist only on this machine. A fresh clone has no tests,
no CI signal, and the documented `npm test` command would run zero tests.
`.gitignore:45` similarly excludes `recipe-card-feature/`.

**P1 — The test suite is red as shipped.** `tests/aiProviderSlotComparison.test.js`
imports `../refactor/aiProviderSlotModel.js`, which does not exist, so the
documented test command exits non-zero. Either restore the module or delete the
orphaned test.

**P2 — Chat memory summarization is dead code.** `api/memoryManager.js`
implements `summarizeHistory`/`checkAndSummarize`, and the README lists "chat
history and memory management" as a feature, but the only call site in
`api/gpt.js` is commented out (lines 20 and 1330). Only the last 5 messages are
replayed per request (`updatedMessages.slice(-5)`), so long conversations lose
context with no compaction. `getConversation`, `saveSummary`, and
`MAX_HISTORY` are likewise unreferenced.

**P2 — Four very large modules concentrate most of the risk.**
`app/(tabs)/settings.js` (3,790 lines), `context/GlobalContext.js` (2,771),
`api/gpt.js` (1,433), and `auth/useAuth.js` (1,199) hold routing, state,
persistence, network, and UI concerns together. `GlobalContext` alone owns
inventory, shopping list, settings, theme, chat state, chat persistence, tags,
expiry, reminders, migrations, and purge. Refactors here are high-blast-radius
and hard to cover with the current test style.

**P2 — README drift.** The documented project structure names files that do not
exist (`app/(auth)/AuthScreen.js`, `app/(tabs)/shopping.js`, `api/client.js`,
`auth/firebase.js`) while omitting the real ones (`sign-in.js`, `list.js`,
`auth/firebaseClient.native.js`). `i18n/index.js` still says "Only English is
shipped for now" although `zh.json` is fully wired. The README also documents
routes and settings that do exist, so the drift is structural, not wholesale.

**P3 — Build-configuration hardening is partly a no-op.**
`hardenBuildProperties()` in `app.config.js` maps the `expo-build-properties`
plugin and returns its options unchanged; it enforces nothing today.

**P3 — Type checking does not apply.**
`tsconfig.json` sets `"strict": true`, but the repository contains no `.ts`/`.tsx`
sources — only `expo-env.d.ts`. Its `include` array also lists
`app/tabs/index.js`, a path that no longer exists (the real file is
`app/(tabs)/index.js`), so that entry is inert.

**P3 — Disabled features leave large commented blocks.**
Voice input is disabled but retains ~120 commented lines in
`components/MessageInput.js` and ~40 in `utils/voiceInput.js`, plus the
`expo-audio` plugin and microphone permission strings in `app.json`. This is
intentional and documented in-file, but it inflates the two largest UI files.

**P3 — Hardcoded Sentry DSN.** `app/_layout.js` embeds the Sentry DSN inline.
This is acceptable for a client-side DSN and the file already strips
`Authorization`/`Cookie` headers and user PII in `beforeSend`, but it cannot be
rotated without a code change and an app release.

**P3 — Environment hygiene.** `.env` and `.env.local` exist locally but are
correctly ignored (`git ls-files` shows only `.env.example`). `.env.local`
declares `SENTRY_AUTH_TOKEN` twice, and `.gitignore` lists `.env.local` twice.
`.env.example` ships `EXPO_PUBLIC_APP_ENV=production`, so copying it verbatim
as a starting point triggers the strict production validation path rather than
a development-friendly one.

**P4 — Unused exports.** `PlainHeader` (`components/Header.js`) has no callers.
`clearLegacyStorageQuarantine` and `clearLegacyCustomAiProviderQuarantine` are
only invoked internally by the migration paths.

## 16. Where to start reading

For the shortest path to understanding the system:

1. `app/_layout.js` → route guards and error recovery.
2. `app/(tabs)/_layout.js` → the provider nest and the three blocking gates.
3. `context/GlobalContext.js` → inventory model, storage hydration, chat
   persistence, purge.
4. `api/gpt.js` → the three chat transports and the WebSocket protocol.
5. `api/buildSystemMessage.js` → the behavioral contract given to every model.
6. `auth/useAuth.js` → provisioning and account-deletion state machines.

## 17. Reference: file sizes

| File | Lines |
| --- | --- |
| `app/(tabs)/settings.js` | 3,790 |
| `context/GlobalContext.js` | 2,771 |
| `api/gpt.js` | 1,433 |
| `context/AccountSessionContext.js` | 1,250 |
| `auth/useAuth.js` | 1,199 |
| `components/MessageList.js` | 1,104 |
| `modules/apple-subscriptions/ios/AppleSubscriptionsModule.swift` | 1,013 |
| `locales/en.json`, `locales/zh.json` | 922 each |
| `app/(tabs)/list.js` | 898 |
| `components/ItemFormModal.js` | 774 |
| `api/gptTools.js` | 734 |
| `components/MessageInput.js` | 777 |
| `app/(tabs)/fridge.js` | 662 |
| `app/(auth)/sign-up.js` | 638 |
| `app/(tabs)/_layout.js` | 582 |
| `components/MessageBubble.js` | 513 |
| `app/(tabs)/chat.js` | 498 |
| `components/ConversationListModal.js` | 497 |
| `api/memoryManager.js` | 479 |
| `components/Header.js` | 402 |
| `components/RecipeResultCards.js` | 403 |
