# Pantrio Client — Code File Inventory

Repository root: `D:\firdge_manager\fridge-manager`

Generated: 2026-09-14

This document is a per-file companion to `docs/CODEBASE_REPORT.md` and
`docs/architecture-flowchart.md`. It describes each code-bearing file, its
inputs/dependencies, its public surface, and where it is consumed.

## Scope

Included:

- `api/`
- `app/`
- `auth/`
- `components/`
- `context/`
- `i18n/`
- `modules/`
- `scripts/`
- `utils/`
- `tests/`
- Root build and configuration files that are code or declarative build input

Excluded:

- `node_modules/`, `dist/`, `.expo/`, `recipe-card-feature/`
- Image, icon, splash, and font assets
- Locale JSON data files (`locales/en.json`, `locales/zh.json`)
- Generated scanner output (`scripts/.strings-report.json`)
- Lockfiles and local environment files

## How each entry is structured

Each entry uses:

- **What it does** — the file's responsibility in plain language.
- **Needs / imports** — local modules, packages, environment values, or runtime
  services it depends on.
- **Exports** — the main functions, components, contexts, or constants.
- **Used by** — static local importers. Route files are loaded by Expo Router
  rather than imported directly, so they often have no importer listed.
- **Notes** — behavior that is important but not obvious from the file name.

All paths are relative to the repository root.

---

## 1. Expo Router routes (`app/`)

### [app/_layout.js](<D:/firdge_manager/fridge-manager/app/_layout.js>)

- **What it does:** Root layout and app entry. Initializes Sentry, restores the
  saved language, mounts `AuthProvider`, provides root error/recovery screens,
  and protects `(auth)` versus `(tabs)` with Expo Router `Stack.Protected`
  guards.
- **Needs / imports:** `@sentry/react-native`, `expo-router`, `react`,
  `react-i18next`, `react-native`, `react-native-gesture-handler`,
  `react-native-get-random-values`, `auth/useAuth.js`, `i18n/index.js`.
- **Exports:** default Sentry-wrapped `Layout`.
- **Used by:** Expo Router entry point.
- **Notes:** Contains the hard-coded Sentry DSN and scrubs `Authorization`,
  `Cookie`, and user PII in `beforeSend`.

### [app/(auth)/_layout.js](<D:/firdge_manager/fridge-manager/app/(auth)/_layout.js>)

- **What it does:** Auth-group stack layout. Mounts `GlobalProvider` once for
  signed-out screens so onboarding, sign-in, and sign-up have theme and
  settings state before a Firebase user exists.
- **Needs / imports:** `expo-router`, `context/GlobalContext.js`.
- **Exports:** default `AuthLayout`.
- **Used by:** Expo Router route group.

### [app/(auth)/onboarding.js](<D:/firdge_manager/fridge-manager/app/(auth)/onboarding.js>)

- **What it does:** Five-page animated onboarding carousel with progress,
  back/next navigation, and final create-account/log-in actions.
- **Needs / imports:** `expo-router`, `react`, `react-i18next`, `react-native`,
  `context/GlobalContext.js`.
- **Exports:** default `OnboardingScreen`.
- **Used by:** Expo Router `(auth)` route group.

### [app/(auth)/sign-in.js](<D:/firdge_manager/fridge-manager/app/(auth)/sign-in.js>)

- **What it does:** Email/password, Google, and Apple sign-in UI. Performs the
  Firebase credential flows and best-effort Apple backend link.
- **Needs / imports:** `@expo/vector-icons`, `expo-router`, `firebase/auth`,
  `react`, `react-i18next`, `react-native`, `auth/appleAuth.js`,
  `auth/firebaseClient.native.js`, `auth/googleAuth.js`,
  `context/GlobalContext.js`.
- **Exports:** default `SignInScreen`.
- **Used by:** Expo Router `(auth)` route group.

### [app/(auth)/sign-up.js](<D:/firdge_manager/fridge-manager/app/(auth)/sign-up.js>)

- **What it does:** Email/password, Google, and Apple account provisioning.
  Creates the Firebase account, POSTs the profile to the backend, and uses
  `useAuth` provisioning markers to abort or complete the account setup
  safely.
- **Needs / imports:** `@expo/vector-icons`, `expo-router`, `firebase/auth`,
  `i18next`, `react`, `react-i18next`, `react-native`,
  `api/authProvisioningStorage.js`, `api/backendConfig.js`,
  `api/fetchWithTimeout.js`, `auth/appleAuth.js`,
  `auth/firebaseClient.native.js`, `auth/googleAuth.js`, `auth/useAuth.js`,
  `context/GlobalContext.js`.
- **Exports:** default `SignUpScreen`.
- **Used by:** Expo Router `(auth)` route group.

### [app/(tabs)/_layout.js](<D:/firdge_manager/fridge-manager/app/(tabs)/_layout.js>)

- **What it does:** Authenticated tab layout and provider nest:
  `AppleSubscriptionProvider` → `AccountSessionProvider` →
  `SessionBackedGlobalProvider` → `GlobalProvider` → `GptProvider` →
  `ThemedTabs`. Owns chat header controls, the conversation drawer animation,
  storage-hydration/recovery gates, and account-access verification.
- **Needs / imports:** `@expo/vector-icons`, `expo-router`, `react`,
  `react-i18next`, `react-native`, `react-native-get-random-values`,
  `api/gpt.js`, `auth/useAuth.js`, `components/ConversationListModal.js`,
  `components/Header.js`, `context/AccountSessionContext.js`,
  `context/GlobalContext.js`, `context/SubscriptionContext.js`,
  `context/refreshPolicy.js`.
- **Exports:** default `TabsLayout`.
- **Used by:** Expo Router `(tabs)` route group.
- **Notes:** Blocks tab rendering until account access and all four local
  storage slices are resolved.

### [app/(tabs)/index.js](<D:/firdge_manager/fridge-manager/app/(tabs)/index.js>)

- **What it does:** Home dashboard with fridge count, expiry state card,
  shopping-list count, and quick actions to fridge and chat.
- **Needs / imports:** `@expo/vector-icons`, `expo-router`, `react`,
  `react-i18next`, `react-native`, `react-native-safe-area-context`,
  `context/GlobalContext.js`.
- **Exports:** default `HomeScreen`.
- **Used by:** `app/(tabs)/_layout.js` tab route.

### [app/(tabs)/chat.js](<D:/firdge_manager/fridge-manager/app/(tabs)/chat.js>)

- **What it does:** Assistant chat screen. Sends text/image messages through
  `streamMessage`, renders the message list, and applies confirmation-card UI
  actions: recipe preference updates, bulk fridge updates, missing-ingredient
  additions, and add-all-to-fridge proposals.
- **Needs / imports:** `@expo/vector-icons`, `expo-router`, `i18next`, `react`,
  `react-i18next`, `react-native`, `react-native-safe-area-context`,
  `api/gpt.js`, `components/MessageInput.js`, `components/MessageList.js`,
  `context/GlobalContext.js`, `utils/bulkProposal.js`,
  `utils/fridgeProposal.js`, `utils/recipePreferences.js`.
- **Exports:** default `ChatScreen`.
- **Used by:** `app/(tabs)/_layout.js` tab route.

### [app/(tabs)/fridge.js](<D:/firdge_manager/fridge-manager/app/(tabs)/fridge.js>)

- **What it does:** Fridge/pantry inventory screen. Decorates items with
  expiry metadata and tag labels, supports search, storage tabs, sorting,
  edit mode, bulk selection, add/edit modal, long-press actions, recipe
  generation from selected items, shopping-list transfer, and delete.
- **Needs / imports:** `expo-router`, `react`, `react-i18next`, `react-native`,
  `api/gpt.js`, `components/ActionGridPopover.js`, `components/FilterTabsRow.js`,
  `components/FloatingAddButton.js`, `components/Header.js`,
  `components/InventoryListItem.js`, `components/ItemFormModal.js`,
  `components/SearchAndSortBar.js`, `components/SectionHeaderPill.js`,
  `components/SelectionActionBar.js`, `components/SortSheetModal.js`,
  `context/GlobalContext.js`, `utils/itemTagLabels.js`.
- **Exports:** default `FridgeScreen`.
- **Used by:** `app/(tabs)/_layout.js` tab route.

### [app/(tabs)/list.js](<D:/firdge_manager/fridge-manager/app/(tabs)/list.js>)

- **What it does:** Shopping-list screen. Adds items, infers food type,
  categorizes into sections, supports search/sort/check-off, edit/delete item
  modal, bulk selection, and “Done Shopping” transfer of checked items into
  the fridge.
- **Needs / imports:** `@expo/vector-icons`, `expo-router`, `react`,
  `react-i18next`, `react-native`, `react-native-safe-area-context`,
  `components/FilterTabsRow.js`, `components/Header.js`,
  `components/SearchAndSortBar.js`, `components/SortSheetModal.js`,
  `context/GlobalContext.js`.
- **Exports:** default `ShoppingListScreen`.
- **Used by:** `app/(tabs)/_layout.js` tab route.

### [app/(tabs)/settings.js](<D:/firdge_manager/fridge-manager/app/(tabs)/settings.js>)

- **What it does:** Five-section settings screen: Account, Plan & Usage,
  Preferences, Privacy & Data, and AI Provider. Handles username PATCH,
  language, font size, theme, expiration/urgency thresholds, the expiration
  reminder toggle,
  recipe preferences, clear-all-data, logout, permanent account deletion,
  Apple subscription status/purchase/restore/refresh, legal links, and custom
  AI provider slot configuration/testing.
- **Needs / imports:** `@expo/vector-icons`, `@react-native-community/slider`,
  `expo-router`, `i18next`, `react`, `react-i18next`, `react-native`,
  `react-native-dropdown-picker`, `api/aiProviderPolicy.js`,
  `api/aiProviderSettings.js`, `api/backendConfig.js`,
  `api/fetchWithTimeout.js`, `api/memoryManager.js`,
  `api/reminderScheduler.js`, `auth/accountReauthentication.js`,
  `auth/useAuth.js`, `components/Header.js`,
  `context/AccountSessionContext.js`, `context/GlobalContext.js`,
  `context/SubscriptionContext.js`, `i18n/index.js`,
  `modules/apple-intelligence/src/index.js`.
- **Exports:** default `SettingsScreen`.
- **Used by:** `app/(tabs)/_layout.js` tab route.
- **Notes:** Largest file in the project. Its AI provider UI manages
  per-provider SecureStore slots rather than the legacy URL-keyed settings.

---

## 2. API services (`api/`)

### [api/accountDeletionApi.js](<D:/firdge_manager/fridge-manager/api/accountDeletionApi.js>)

- **What it does:** Thin client for backend account-deletion endpoints:
  `DELETE /api/users/:uid` and `GET /api/users/:uid/deletion-status`.
- **Needs / imports:** `api/backendConfig.js`, `api/backendErrors.js`,
  `api/fetchWithTimeout.js`; Firebase bearer token.
- **Exports:** `requestBackendAccountDeletion`, `getBackendAccountDeletionStatus`,
  `accountDeletionResponseError`.
- **Used by:** `auth/useAuth.js`.

### [api/accountDeletionPolicy.cjs](<D:/firdge_manager/fridge-manager/api/accountDeletionPolicy.cjs>)

- **What it does:** Pure classification rules for backend account-deletion
  responses and Firebase deletion errors. Decides when a response is accepted,
  complete, processing, rejected, recent-auth-required, or unknown, and which
  durable deletion tombstone should purge local data.
- **Needs / imports:** none.
- **Exports:** CommonJS object with classification and decision helpers.
- **Used by:** `auth/useAuth.js`, `context/AccountSessionContext.js`.

### [api/accountLifecycleStorage.js](<D:/firdge_manager/fridge-manager/api/accountLifecycleStorage.js>)

- **What it does:** AsyncStorage journal for durable account-lifecycle state:
  account deletion lifecycle, Apple link state, and durable post-auth notices.
- **Needs / imports:** `@react-native-async-storage/async-storage`.
- **Exports:** deletion lifecycle get/update/clear, Apple link state
  get/set/clear, durable post-auth notice get/set/clear.
- **Used by:** `auth/appleAuth.js`, `auth/useAuth.js`.

### [api/aiProviderPolicy.js](<D:/firdge_manager/fridge-manager/api/aiProviderPolicy.js>)

- **What it does:** Normalizes the active AI provider ID (`pantrio`, `apple`,
  or `custom`) and maps legacy boolean `useCustomAi` settings.
- **Needs / imports:** none.
- **Exports:** `resolveAiProvider`.
- **Used by:** `api/gpt.js`, `app/(tabs)/settings.js`, `context/GlobalContext.js`.

### [api/aiProviderSettings.js](<D:/firdge_manager/fridge-manager/api/aiProviderSettings.js>)

- **What it does:** SecureStore-backed per-user AI provider “slot” settings.
  Manages preset OpenAI/OpenRouter/Groq/Together endpoints plus a custom slot,
  migrates legacy URL-keyed settings, and serializes all SecureStore operations
  through a lock.
- **Needs / imports:** `expo-secure-store`, `i18next`,
  `api/legacyPurgePolicy.cjs`, `api/storageKeys.js`.
- **Exports:** base-URL/slot normalization helpers, migration helpers, and
  get/set/clear functions for slot and legacy custom settings.
- **Used by:** `api/gpt.js`, `api/userDataPurge.js`, `app/(tabs)/settings.js`,
  `context/GlobalContext.js`.

### [api/authProvisioningStorage.js](<D:/firdge_manager/fridge-manager/api/authProvisioningStorage.js>)

- **What it does:** Durable AsyncStorage marker used during account creation.
  Tracks the provider and Firebase UID so an interrupted provisioning attempt
  can be cleaned up on next launch.
- **Needs / imports:** `@react-native-async-storage/async-storage`.
- **Exports:** `getAuthProvisioningIntent`, `markAuthProvisioningStarted`,
  `bindAuthProvisioningUser`, `clearAuthProvisioningIntent`.
- **Used by:** `app/(auth)/sign-up.js`, `auth/useAuth.js`.

### [api/backendConfig.js](<D:/firdge_manager/fridge-manager/api/backendConfig.js>)

- **What it does:** Validates and exports `API_BASE_URL` and `BACKEND_WS_URL`.
  Rejects malformed URLs, credentials, query strings, fragments, and loopback
  hosts in production. Derives the WebSocket URL from the API URL when needed.
- **Needs / imports:** none; reads `EXPO_PUBLIC_API_BASE_URL`,
  `EXPO_PUBLIC_WS_URL`, `EXPO_PUBLIC_APP_ENV`.
- **Exports:** `validateBackendUrl`, `websocketUrlFromApiBase`,
  `API_BASE_URL`, `BACKEND_WS_URL`.
- **Used by:** many `api/`, `app/`, `auth/`, and `context/` modules.

### [api/backendErrors.js](<D:/firdge_manager/fridge-manager/api/backendErrors.js>)

- **What it does:** Parses backend response text and builds normalized
  `BackendResponseError` instances with status, code, quota, and retry metadata.
- **Needs / imports:** `i18next`.
- **Exports:** `parseBackendResponseText`, `createBackendResponseError`.
- **Used by:** `api/accountDeletionApi.js`, `api/gpt.js`,
  `api/memoryManager.js`, `auth/appleAuth.js`, `context/AccountSessionContext.js`.

### [api/buildSystemMessage.js](<D:/firdge_manager/fridge-manager/api/buildSystemMessage.js>)

- **What it does:** Builds the shared AI system prompt. Defines scope, tool-only
  state changes, whole-day expiry rules, recipe routing, confirmation-card
  behavior, Markdown formatting guidance, and English/Chinese response
  language.
- **Needs / imports:** none.
- **Exports:** `buildSystemMessage`.
- **Used by:** `api/gpt.js`.

### [api/chatAttachments.js](<D:/firdge_manager/fridge-manager/api/chatAttachments.js>)

- **What it does:** Manages durable chat image files under
  `documentDirectory/pantrio-chat-attachments/<uid>/`. Persists source images,
  detects managed attachment URIs, deletes a user's directory, and prunes
  files not retained by persisted messages.
- **Needs / imports:** `expo-file-system/legacy`.
- **Exports:** `isManagedChatAttachment`, `persistChatAttachment`,
  `deleteChatAttachments`, `pruneChatAttachments`.
- **Used by:** `api/memoryManager.js`, `components/PlusMenu.js`,
  `context/GlobalContext.js`.

### [api/chatLifecycle.js](<D:/firdge_manager/fridge-manager/api/chatLifecycle.js>)

- **What it does:** Registration and broadcast mechanism for cancelling active
  chat work. `api/gpt.js` registers its cancellation handler; other modules
  invoke `cancelActiveChatWork` before clearing chat state.
- **Needs / imports:** `i18next`.
- **Exports:** `registerChatCancellation`, `cancelActiveChatWork`.
- **Used by:** `api/gpt.js`, `api/memoryManager.js`, `context/GlobalContext.js`.

### [api/fetchWithTimeout.js](<D:/firdge_manager/fridge-manager/api/fetchWithTimeout.js>)

- **What it does:** Wraps `fetch` with a deterministic timeout while preserving
  a caller-supplied abort signal. Produces `REQUEST_TIMEOUT` errors.
- **Needs / imports:** `i18next`.
- **Exports:** `fetchWithTimeout`, `DEFAULT_TIMEOUT_MS`.
- **Used by:** `api/accountDeletionApi.js`, `app/(auth)/sign-up.js`,
  `app/(tabs)/settings.js`, `auth/appleAuth.js`, `auth/useAuth.js`,
  `context/GlobalContext.js`.

### [api/gpt.js](<D:/firdge_manager/fridge-manager/api/gpt.js>)

- **What it does:** Core AI runtime and provider. Converts app messages to
  Chat Completions format, runs the Pantrio backend WebSocket protocol, and
  implements custom OpenAI-compatible and on-device Apple Intelligence tool
  loops. Streams assistant text in 50 ms batches, executes client-owned tools,
  creates recipe-card messages, and manages cancellation/lifecycle.
- **Needs / imports:** `react`, `react-native`, `i18next`,
  `api/aiProviderPolicy.js`, `api/aiProviderSettings.js`,
  `api/backendConfig.js`, `api/backendErrors.js`, `api/buildSystemMessage.js`,
  `api/chatLifecycle.js`, `api/gptTools.js`, `api/memoryManager.js`,
  `api/recipeAssistant.js`, `auth/firebaseClient.native.js`,
  `context/AccountSessionContext.js`, `context/GlobalContext.js`,
  `modules/apple-intelligence/src/index.js`, `utils/chatMessageOrder.js`,
  `utils/recipeCards.js`.
- **Exports:** `DIRECT_AI_TOOLS`, `GptProvider`, `useGpt`.
- **Used by:** `app/(tabs)/_layout.js`, `app/(tabs)/chat.js`,
  `app/(tabs)/fridge.js`.
- **Notes:** Memory summarization imports are commented out; only the last
  five messages are currently sent per request.

### [api/gptTools.js](<D:/firdge_manager/fridge-manager/api/gptTools.js>)

- **What it does:** Implements client-executed AI tool handlers and ownership
  filtering. Handles add/remove/find/get fridge and shopping-list tools,
  `updateFridgeItem`, bulk fridge update proposal, add-missing-ingredient
  proposal, `streamlineLists`, recipe-preference proposal, and
  add-all-to-fridge proposal.
- **Needs / imports:** `react`, `context/GlobalContext.js`,
  `utils/bulkProposal.js`, `utils/expiryPredictor.js`,
  `utils/fridgeProposal.js`, `utils/recipePreferences.js`.
- **Exports:** `isServerOwnedGPTTool`, `claimClientOwnedGPTToolCalls`,
  `useGPTTools`.
- **Used by:** `api/gpt.js`.

### [api/legacyPurgePolicy.cjs](<D:/firdge_manager/fridge-manager/api/legacyPurgePolicy.cjs>)

- **What it does:** Decides whether legacy global AsyncStorage/SecureStore data
  may be deleted for a given user. Ownerless or matching-owner legacy data is
  removable; data owned by another user is preserved.
- **Needs / imports:** none.
- **Exports:** CommonJS `{ shouldClearLegacyOwnedData }`.
- **Used by:** `api/aiProviderSettings.js`, `api/storageKeys.js`.

### [api/memoryManager.js](<D:/firdge_manager/fridge-manager/api/memoryManager.js>)

- **What it does:** Chat persistence and summarization service. Loads/saves
  legacy and per-conversation chat payloads, sanitizes persisted messages,
  clears chat data and attachments, and implements backend `/summarize`
  summarization with cancellation and retry guards.
- **Needs / imports:** `@react-native-async-storage/async-storage`, `i18next`,
  `api/backendConfig.js`, `api/backendErrors.js`, `api/chatAttachments.js`,
  `api/chatLifecycle.js`, `api/storageKeys.js`, `auth/firebaseClient.native.js`,
  `utils/chatStoragePolicy.js`.
- **Exports:** `MAX_HISTORY`, `KEEP_RECENT`, message sanitization,
  `addMessage`, `getConversation`, `formatConversationMemory`, `saveSummary`,
  `loadChatData`, `loadConversationChatData`, `saveConversationChatData`,
  `removeConversationChatData`, `clearChatData`, `normalizeMessagesForSummary`,
  `summarizeHistory`, `checkAndSummarize`.
- **Used by:** `api/gpt.js`, `api/userDataPurge.js`, `app/(tabs)/settings.js`,
  `context/GlobalContext.js`.

### [api/recipeAssistant.js](<D:/firdge_manager/fridge-manager/api/recipeAssistant.js>)

- **What it does:** Recipe-specific AI policy and schemas. Defines
  `recommendRecipes` and `proposeRecipePreferenceUpdate` tool schemas,
  the explicit `findRecipes` UI action, bounded recipe context, and the
  forced `getFridgeContents` → `recommendRecipes` tool policy for custom
  providers. Text routing lives on the backend.
- **Needs / imports:** none.
- **Exports:** `RECOMMEND_RECIPES_TOOL`, `PROPOSE_RECIPE_PREFERENCE_UPDATE_TOOL`,
  `RECIPE_UI_ACTIONS`, `normalizeRecipeUiAction`, `buildRecipeContext`,
  `GET_FRIDGE_CONTENTS_TOOL`, `customRecipeToolPolicy`.
- **Used by:** `api/gpt.js`.

### [api/reminderScheduler.js](<D:/firdge_manager/fridge-manager/api/reminderScheduler.js>)

- **What it does:** Schedules and cancels local expiration reminders through
  `expo-notifications`. Uses a latest-task queue so only the newest reminder
  sync wins.
- **Needs / imports:** `expo-notifications`, `i18next`,
  `utils/latestTaskQueue.js`, `utils/notificationRouting.js`,
  `utils/reminderPolicy.js`.
- **Exports:** `cancelPantrioReminders`, `requestReminderPermissions`,
  `syncLocalReminders`.
- **Used by:** `api/userDataPurge.js`, `app/(tabs)/settings.js`,
  `auth/useAuth.js`, `context/GlobalContext.js`.

### [api/storageKeys.js](<D:/firdge_manager/fridge-manager/api/storageKeys.js>)

- **What it does:** Defines UID-scoped AsyncStorage keys and legacy data
  migration/quarantine/purge-intent journaling. Hex-encodes Firebase UIDs into
  `@pantrio:user:<hex>:...` namespaces and owns the purge-intent state machine.
- **Needs / imports:** `@react-native-async-storage/async-storage`,
  `api/legacyPurgePolicy.cjs`.
- **Exports:** `LEGACY_ASYNC_STORAGE_KEYS`, `getUserStorageKeys`,
  `sanitizeConversationId`, `getUserConversationStorageKeys`,
  conversation payload listing/removal, secure-key helper, legacy owner
  helpers, purge-intent get/list/mark/confirm/record/clear, and legacy
  migration/clear helpers.
- **Used by:** `api/aiProviderSettings.js`, `api/memoryManager.js`,
  `api/userDataPurge.js`, `auth/useAuth.js`, `context/GlobalContext.js`.

### [api/systemPrompt.js](<D:/firdge_manager/fridge-manager/api/systemPrompt.js>)

- **What it does:** Backward-compatible re-export of `buildSystemMessage` so
  older import paths keep a single prompt implementation.
- **Needs / imports:** none.
- **Exports:** re-exports `buildSystemMessage`.
- **Used by:** no current local importers.

### [api/userDataPurge.js](<D:/firdge_manager/fridge-manager/api/userDataPurge.js>)

- **What it does:** Journaled user-data purge. Deletes fridge, shopping,
  settings, custom AI credentials, legacy data, reminders, chat payloads, and
  chat attachments with per-scope `Promise.allSettled` outcomes; keeps a
  retryable purge intent on partial failure.
- **Needs / imports:** `@react-native-async-storage/async-storage`, `i18next`,
  `api/aiProviderSettings.js`, `api/memoryManager.js`,
  `api/reminderScheduler.js`, `api/storageKeys.js`.
- **Exports:** `userDataPurgeErrorMessage`, `purgeStoredUserData`,
  `publicUserDataPurgeResult`, `completePendingUserDataPurge`.
- **Used by:** `auth/useAuth.js`, `context/GlobalContext.js`.

---

## 3. Authentication (`auth/`)

### [auth/accountReauthentication.js](<D:/firdge_manager/fridge-manager/auth/accountReauthentication.js>)

- **What it does:** Chooses and performs the appropriate Firebase
  reauthentication method for permanent account deletion: Apple, Google, or
  email/password.
- **Needs / imports:** `@react-native-google-signin/google-signin`,
  `expo-apple-authentication`, `firebase/auth`, `i18next`, `react-native`,
  `auth/appleAuth.js`, `auth/googleAuth.js`, `auth/googleSignInResponse.js`.
- **Exports:** `getAccountDeletionReauthenticationMethod`,
  `reauthenticateForAccountDeletion`.
- **Used by:** `app/(tabs)/settings.js`.

### [auth/appleAuth.js](<D:/firdge_manager/fridge-manager/auth/appleAuth.js>)

- **What it does:** Apple Sign-In bridge. Creates a SHA-256 nonce and Firebase
  Apple OAuth credential, signs in or reauthenticates, and optionally links
  Apple's single-use authorization code to the backend for later account
  revocation.
- **Needs / imports:** `expo-apple-authentication`, `expo-crypto`,
  `firebase/auth`, `i18next`, `api/accountLifecycleStorage.js`,
  `api/backendConfig.js`, `api/backendErrors.js`, `api/fetchWithTimeout.js`,
  `auth/firebaseClient.native.js`.
- **Exports:** `linkAppleAuthorizationToBackend`,
  `tryLinkAppleAuthorizationToBackend`, `signInWithApple`,
  `reauthenticateWithApple`.
- **Used by:** `app/(auth)/sign-in.js`, `app/(auth)/sign-up.js`,
  `auth/accountReauthentication.js`.

### [auth/firebaseClient.native.js](<D:/firdge_manager/fridge-manager/auth/firebaseClient.native.js>)

- **What it does:** Initializes Firebase App/Auth once with native React Native
  persistence backed by `secureFirebaseStorage`.
- **Needs / imports:** `firebase/app`, `firebase/auth`,
  `auth/secureFirebaseStorage.js`; Firebase env values.
- **Exports:** `auth`.
- **Used by:** `api/gpt.js`, `api/memoryManager.js`, `app/(auth)/sign-in.js`,
  `app/(auth)/sign-up.js`, `auth/appleAuth.js`, `auth/useAuth.js`.

### [auth/googleAuth.js](<D:/firdge_manager/fridge-manager/auth/googleAuth.js>)

- **What it does:** Configures native Google Sign-In and provides sign-in,
  sign-out, and access-revocation wrappers.
- **Needs / imports:** `@react-native-google-signin/google-signin`,
  `firebase/auth`, `i18next`, `auth/googleSignInResponse.js`.
- **Exports:** `configureGoogleSignIn`, `signInWithGoogleNative`,
  `signOutFromGoogleNative`, `revokeGoogleAccessNative`.
- **Used by:** `app/(auth)/sign-in.js`, `app/(auth)/sign-up.js`,
  `auth/accountReauthentication.js`, `auth/useAuth.js`.

### [auth/googleSignInResponse.js](<D:/firdge_manager/fridge-manager/auth/googleSignInResponse.js>)

- **What it does:** Extracts an ID token from Google Sign-In v16 responses.
  Only consults the native token cache after a successful interactive sign-in;
  never after cancellation or unknown responses.
- **Needs / imports:** `i18next`.
- **Exports:** `extractGoogleIdTokenFromSignInResponse`.
- **Used by:** `auth/accountReauthentication.js`, `auth/googleAuth.js`.

### [auth/secureFirebaseStorage.js](<D:/firdge_manager/fridge-manager/auth/secureFirebaseStorage.js>)

- **What it does:** Firebase React Native persistence adapter that encrypts
  session values in SecureStore, chunks large values, migrates legacy
  plaintext AsyncStorage exactly once, and falls back to memory-only if
  SecureStore is unavailable.
- **Needs / imports:** `@react-native-async-storage/async-storage`,
  `expo-crypto`, `expo-secure-store`.
- **Exports:** `secureFirebaseStorage`.
- **Used by:** `auth/firebaseClient.native.js`.

### [auth/useAuth.js](<D:/firdge_manager/fridge-manager/auth/useAuth.js>)

- **What it does:** Central authentication provider. Reconciles Firebase auth
  state, completes interrupted provisioning/deletion workflows, publishes the
  user only after verification, manages post-auth notices, account deletion,
  sign-out/provider cleanup, recovery retries, and device-data clearing.
- **Needs / imports:** `firebase/auth`, `i18next`, `react`,
  `api/accountDeletionApi.js`, `api/accountDeletionPolicy.cjs`,
  `api/accountLifecycleStorage.js`, `api/authProvisioningStorage.js`,
  `api/backendConfig.js`, `api/fetchWithTimeout.js`, `api/storageKeys.js`,
  `api/userDataPurge.js`, `auth/firebaseClient.native.js`, `auth/googleAuth.js`.
- **Exports:** `AuthProvider`, `useAuth`.
- **Used by:** `app/(auth)/sign-up.js`, `app/(tabs)/_layout.js`,
  `app/(tabs)/settings.js`, `app/_layout.js`, `context/AccountSessionContext.js`.

---

## 4. Components (`components/`)

### [components/ActionGridPopover.js](<D:/firdge_manager/fridge-manager/components/ActionGridPopover.js>)

- **What it does:** Reusable popover grid for context actions. Renders an
  `ActionTile` for each supplied action around a measured source rectangle.
- **Needs / imports:** `react`, `react-native`, `react-native-popover-view`,
  `components/ActionTile.js`.
- **Exports:** default `ActionGridPopover`.
- **Used by:** `app/(tabs)/fridge.js`, `components/ConversationListModal.js`.

### [components/ActionTile.js](<D:/firdge_manager/fridge-manager/components/ActionTile.js>)

- **What it does:** Small reusable icon-plus-label button used in popovers and
  bottom action bars.
- **Needs / imports:** `@expo/vector-icons`, `react`, `react-native`.
- **Exports:** default `ActionTile`.
- **Used by:** `components/ActionGridPopover.js`,
  `components/SelectionActionBar.js`.

### [components/ConversationListModal.js](<D:/firdge_manager/fridge-manager/components/ConversationListModal.js>)

- **What it does:** Animated conversation drawer. Lists active and archived
  chats, supports new/select/archive/restore/delete, and shows row action
  popovers.
- **Needs / imports:** `@expo/vector-icons`, `i18next`, `react`,
  `react-i18next`, `react-native`, `react-native-safe-area-context`,
  `components/ActionGridPopover.js`, `context/GlobalContext.js`.
- **Exports:** default `ConversationDrawer`.
- **Used by:** `app/(tabs)/_layout.js`.

### [components/FilterTabsRow.js](<D:/firdge_manager/fridge-manager/components/FilterTabsRow.js>)

- **What it does:** Horizontal pill tab row for filtering lists, with optional
  counts and accessibility state.
- **Needs / imports:** `react`, `react-i18next`, `react-native`.
- **Exports:** default `FilterTabsRow`.
- **Used by:** `app/(tabs)/fridge.js`, `app/(tabs)/list.js`.

### [components/FloatingAddButton.js](<D:/firdge_manager/fridge-manager/components/FloatingAddButton.js>)

- **What it does:** Reusable floating action button.
- **Needs / imports:** `@expo/vector-icons`, `react`, `react-native`.
- **Exports:** default `FloatingAddButton`.
- **Used by:** `app/(tabs)/fridge.js`.

### [components/Header.js](<D:/firdge_manager/fridge-manager/components/Header.js>)

- **What it does:** Shared header components: `PlainHeader`, `IconHeader`,
  `HeaderWithButton`, and `HeaderWithHiddenButton`. Handles safe-area insets,
  centered titles, optional side controls, and back navigation.
- **Needs / imports:** `@expo/vector-icons`, `react`, `react-i18next`,
  `react-native`, `react-native-safe-area-context`, `context/GlobalContext.js`.
- **Exports:** `PlainHeader`, `IconHeader`, `HeaderWithButton`,
  `HeaderWithHiddenButton`.
- **Used by:** `app/(tabs)/_layout.js`, `app/(tabs)/fridge.js`,
  `app/(tabs)/list.js`, `app/(tabs)/settings.js`.

### [components/ImageViewer.native.js](<D:/firdge_manager/fridge-manager/components/ImageViewer.native.js>)

- **What it does:** Native image-viewing re-export shim.
- **Needs / imports:** `react-native-image-viewing`.
- **Exports:** default `ImageViewing`.
- **Used by:** `components/MessageBubble.js`.

### [components/InventoryListItem.js](<D:/firdge_manager/fridge-manager/components/InventoryListItem.js>)

- **What it does:** Reusable inventory item card. Displays name, translated
  state/storage/food-type tags, quantity, expiry or added-time subtitle, and
  selection checkbox in edit mode. Supports measured long-press callbacks.
- **Needs / imports:** `@expo/vector-icons`, `react`, `react-i18next`,
  `react-native`, `utils/tagTranslation.js`.
- **Exports:** default memoized `InventoryListItem`.
- **Used by:** `app/(tabs)/fridge.js`.

### [components/ItemFormModal.js](<D:/firdge_manager/fridge-manager/components/ItemFormModal.js>)

- **What it does:** Add/edit item modal. Collects name, quantity, storage,
  urgency, food type, optional state, and expiration input via days/date or
  “machine estimate.” Includes dropdowns, date popover, keyboard scrolling, and
  submit validation.
- **Needs / imports:** `@expo/vector-icons`,
  `@react-native-community/datetimepicker`, `react`, `react-i18next`,
  `react-native`, `react-native-dropdown-picker`, `react-native-popover-view`,
  `utils/dateInput.js`, `utils/tagTranslation.js`.
- **Exports:** default `ItemFormModal`.
- **Used by:** `app/(tabs)/fridge.js`.

### [components/LinkPreviewCard.js](<D:/firdge_manager/fridge-manager/components/LinkPreviewCard.js>)

- **What it does:** Inline link-preview card for assistant Markdown URLs.
  Enforces the link-preview safety policy, fetches metadata only when requested
  or explicitly safe, and opens the URL through `Linking`.
- **Needs / imports:** `link-preview-js`, `react`, `react-i18next`,
  `react-native`, `context/GlobalContext.js`, `utils/linkPreviewPolicy.js`.
- **Exports:** default memoized `LinkPreviewCard`.
- **Used by:** `components/MarkdownText.js`.

### [components/MarkdownText.js](<D:/firdge_manager/fridge-manager/components/MarkdownText.js>)

- **What it does:** Renders assistant Markdown as a selectable text run using
  `@bsky.app/react-native-uitextview`. Parses the Markdown flow, renders inline
  styling, code blocks, quotes, headings, rules, and inserts preview cards for
  extracted URLs.
- **Needs / imports:** `@bsky.app/react-native-uitextview`, `react`,
  `react-native`, `components/LinkPreviewCard.js`, `utils/markdownFlow.js`,
  `utils/markdownSegments.js`.
- **Exports:** default memoized `MarkdownText`.
- **Used by:** `components/MessageBubble.js`.

### [components/MessageBubble.js](<D:/firdge_manager/fridge-manager/components/MessageBubble.js>)

- **What it does:** Renders a chat message bubble. Handles image-only messages,
  user/assistant text styling, Markdown for assistant text, user-message link
  preview cards, long-press selectable text modal, and image preview modal.
- **Needs / imports:** `@bsky.app/react-native-uitextview`, `link-preview-js`,
  `react`, `react-i18next`, `react-native`,
  `components/ImageViewer.native.js`, `components/MarkdownText.js`,
  `context/GlobalContext.js`, `utils/linkPreviewPolicy.js`,
  `utils/markdownFlow.js`.
- **Exports:** default memoized `MessageBubble`.
- **Used by:** `components/MessageList.js`.

### [components/MessageInput.js](<D:/firdge_manager/fridge-manager/components/MessageInput.js>)

- **What it does:** Text-only chat composer. Calculates min/max height from
  content and viewport, renders the Plus menu for images, and sends text or
  image payloads. Voice input is intentionally disabled but preserved in
  comments.
- **Needs / imports:** `@expo/vector-icons`, `react`, `react-i18next`,
  `react-native`, `components/PlusMenu.js`, `context/GlobalContext.js`,
  `utils/composerLayout.js`, `utils/voiceInput.js`.
- **Exports:** default `MessageInput`.
- **Used by:** `app/(tabs)/chat.js`.

### [components/MessageList.js](<D:/firdge_manager/fridge-manager/components/MessageList.js>)

- **What it does:** Chat message list and confirmation-card renderer. Converts
  messages to bubble/recipe-card/UI-action/typing rows, renders action cards,
  opens the item confirmation sheet, and applies confirmed actions through the
  `onUiAction` callback.
- **Needs / imports:** `react`, `react-i18next`, `react-native`,
  `react-native-dropdown-picker`, `components/MessageBubble.js`,
  `components/RecipeResultCards.js`, `context/GlobalContext.js`,
  `utils/bulkProposal.js`, `utils/fridgeProposal.js`,
  `utils/tagTranslation.js`.
- **Exports:** default `MessageList`.
- **Used by:** `app/(tabs)/chat.js`.

### [components/PlusMenu.js](<D:/firdge_manager/fridge-manager/components/PlusMenu.js>)

- **What it does:** Chat attachment picker. Requests camera/media permissions,
  launches camera/gallery, validates image size/dimensions/pixels, resizes and
  JPEG-compresses images, and returns a base64 request URI plus a managed
  display URI (or temporary URI in incognito).
- **Needs / imports:** `@expo/vector-icons`, `expo-image-manipulator`,
  `expo-image-picker`, `i18next`, `react`, `react-i18next`, `react-native`,
  `api/chatAttachments.js`, `context/GlobalContext.js`.
- **Exports:** default `PlusMenu`.
- **Used by:** `components/MessageInput.js`.

### [components/RecipeMissingItemsButton.js](<D:/firdge_manager/fridge-manager/components/RecipeMissingItemsButton.js>)

- **What it does:** Recipe card button that adds missing structured ingredients
  to the shopping list exactly once, while showing skipped/already-on-list
  feedback.
- **Needs / imports:** `react`, `react-i18next`, `react-native`,
  `context/GlobalContext.js`, `utils/recipeShoppingList.js`.
- **Exports:** default `RecipeMissingItemsButton`.
- **Used by:** `components/RecipeResultCards.js`.

### [components/RecipeResultCards.js](<D:/firdge_manager/fridge-manager/components/RecipeResultCards.js>)

- **What it does:** Renders `recipe_cards` messages as tappable cards and a
  detail modal showing metadata, ingredients present/missing, missing-item
  button, reason, publisher steps, and a link to the original recipe.
- **Needs / imports:** `react`, `react-i18next`, `react-native`,
  `components/RecipeMissingItemsButton.js`, `context/GlobalContext.js`,
  `utils/recipeCards.js`.
- **Exports:** default memoized `RecipeResultCards`.
- **Used by:** `components/MessageList.js`.

### [components/SearchAndSortBar.js](<D:/firdge_manager/fridge-manager/components/SearchAndSortBar.js>)

- **What it does:** Reusable search input and sort button used by fridge and
  shopping list screens.
- **Needs / imports:** `@expo/vector-icons`, `react`, `react-i18next`,
  `react-native`.
- **Exports:** default `SearchAndSortBar`.
- **Used by:** `app/(tabs)/fridge.js`, `app/(tabs)/list.js`.

### [components/SectionHeaderPill.js](<D:/firdge_manager/fridge-manager/components/SectionHeaderPill.js>)

- **What it does:** Section header with optional count pill and
  danger/warning/neutral styling.
- **Needs / imports:** `@expo/vector-icons`, `react`, `react-native`.
- **Exports:** default `SectionHeaderPill`.
- **Used by:** `app/(tabs)/fridge.js`.

### [components/SelectionActionBar.js](<D:/firdge_manager/fridge-manager/components/SelectionActionBar.js>)

- **What it does:** Bottom action bar for multi-select mode. Shows selection
  count, select-all/clear, and action tiles.
- **Needs / imports:** `react`, `react-i18next`, `react-native`,
  `components/ActionTile.js`.
- **Exports:** default `SelectionActionBar`.
- **Used by:** `app/(tabs)/fridge.js`.

### [components/SortSheetModal.js](<D:/firdge_manager/fridge-manager/components/SortSheetModal.js>)

- **What it does:** Reusable bottom-sheet sort modal for selecting a sort key
  and toggling ascending/descending order.
- **Needs / imports:** `@expo/vector-icons`, `react`, `react-i18next`,
  `react-native`.
- **Exports:** default `SortSheetModal`.
- **Used by:** `app/(tabs)/fridge.js`, `app/(tabs)/list.js`.

---

## 5. Context providers (`context/`)

### [context/AccountSessionContext.js](<D:/firdge_manager/fridge-manager/context/AccountSessionContext.js>)

- **What it does:** Account session and entitlement provider. Fetches
  `GET /api/session`, normalizes entitlement/quota/model, verifies Apple
  transaction evidence, refreshes sessions on foreground, coordinates Apple
  purchase/restore/refresh operations, and exposes realtime quota updates.
- **Needs / imports:** `i18next`, `react`, `react-native`,
  `api/accountDeletionPolicy.cjs`, `api/backendConfig.js`,
  `api/backendErrors.js`, `auth/useAuth.js`, `context/SubscriptionContext.js`,
  `context/refreshPolicy.js`.
- **Exports:** `AccountSessionProvider`, `useAccountSession`.
- **Used by:** `api/gpt.js`, `app/(tabs)/_layout.js`, `app/(tabs)/settings.js`.

### [context/GlobalContext.js](<D:/firdge_manager/fridge-manager/context/GlobalContext.js>)

- **What it does:** Largest state provider. Owns fridge and shopping-list data,
  settings, theme, tags, expiry derivation, food-type inference, storage
  hydration/persistence, chat state and conversation index, purge/clear-all,
  reminder scheduling, and the action surface consumed by screens and GPT
  tools.
- **Needs / imports:** `@react-native-async-storage/async-storage`, `i18next`,
  `react`, `react-native`, `uuid`, many `api/` services, and many `utils/`
  helpers.
- **Exports:** `GlobalContext`, `ChatContext`, `ChatActionsContext`,
  `GlobalProvider`.
- **Used by:** nearly every screen, component, and AI tool module.

### [context/refreshPolicy.js](<D:/firdge_manager/fridge-manager/context/refreshPolicy.js>)

- **What it does:** Pure helpers for session/subscription refresh policy and
  account-data gating. Computes ordered product-key identity, product coverage,
  refresh freshness, and whether account data may be exposed.
- **Needs / imports:** none.
- **Exports:** `orderedStringListKey`, `productCatalogCoversIds`,
  `isRefreshFresh`, `canExposeAccountData`.
- **Used by:** `app/(tabs)/_layout.js`, `context/AccountSessionContext.js`,
  `context/SubscriptionContext.js`.

### [context/SubscriptionContext.js](<D:/firdge_manager/fridge-manager/context/SubscriptionContext.js>)

- **What it does:** Apple subscription provider. Configures the StoreKit product
  catalog, loads localized products, reads subscription status, performs
  purchase/restore/finish-transaction calls, and subscribes to native status and
  transaction events.
- **Needs / imports:** `i18next`, `react`, `react-native`,
  `context/refreshPolicy.js`, `modules/apple-subscriptions/src/index.js`.
- **Exports:** `SubscriptionContext`, `AppleSubscriptionProvider`,
  `useAppleSubscription`.
- **Used by:** `app/(tabs)/_layout.js`, `app/(tabs)/settings.js`,
  `context/AccountSessionContext.js`.

---

## 6. Utility modules (`utils/`)

### [utils/bulkProposal.js](<D:/firdge_manager/fridge-manager/utils/bulkProposal.js>)

- **What it does:** Bulk fridge update proposal lifecycle helpers. Creates
  action IDs, computes stable action keys, and claims/releases/marks one-time
  `bulk_fridge_update` cards.
- **Needs / imports:** none.
- **Exports:** `createBulkProposalActionId`, `bulkProposalActionKey`,
  `isBulkProposalActionConsumed`, `claimBulkProposalAction`,
  `releaseBulkProposalAction`, `markBulkProposalActionConsumed`.
- **Used by:** `api/gptTools.js`, `app/(tabs)/chat.js`,
  `components/MessageList.js`.

### [utils/chatMessageOrder.js](<D:/firdge_manager/fridge-manager/utils/chatMessageOrder.js>)

- **What it does:** Places a new assistant message above a pending action card
  or structured message so streaming text renders before cards.
- **Needs / imports:** none.
- **Exports:** `insertAssistantAboveActionCard`,
  `insertAssistantAboveStructuredMessage`.
- **Used by:** `api/gpt.js`.

### [utils/chatStoragePolicy.js](<D:/firdge_manager/fridge-manager/utils/chatStoragePolicy.js>)

- **What it does:** Chat sanitization, bounding, and conversation-index policy.
  Normalizes v1/v2 conversation lists, manages archive/restore/remove,
  collects attachment URIs, replaces images with placeholders for persistence,
  and enforces runtime/persisted message and byte limits.
- **Needs / imports:** `utils/recipeCards.js`.
- **Exports:** chat constants, title/list/index helpers, archive/restore/remove
  helpers, attachment helpers, `boundRuntimeChatMessages`,
  `prepareChatMessagesForPersistence`, `collectChatAttachmentUris`,
  `replaceChatImagesWithPlaceholders`, `shouldPersistChat`,
  `shouldClearChatOnIncognitoExit`.
- **Used by:** `api/memoryManager.js`, `context/GlobalContext.js`.

### [utils/composerLayout.js](<D:/firdge_manager/fridge-manager/utils/composerLayout.js>)

- **What it does:** Calculates composer min/max height, line height, padding,
  and scroll behavior from content height, font size, and viewport height.
- **Needs / imports:** none.
- **Exports:** composer constants and `calculateComposerLayout`.
- **Used by:** `components/MessageInput.js`.

### [utils/dateInput.js](<D:/firdge_manager/fridge-manager/utils/dateInput.js>)

- **What it does:** Local-time date helpers for start/end of day, date-only ISO
  conversion, `YYYY-MM-DD`/`MM/DD/YYYY` parsing, formatting, and local day
  arithmetic.
- **Needs / imports:** none.
- **Exports:** `startOfDayLocal`, `endOfDayLocal`, `isoFromLocalDateOnly`,
  `parseDateInputToIso`, `formatYYYYMMDDLocal`, `addLocalDaysIso`, `MS_PER_DAY`.
- **Used by:** `components/ItemFormModal.js`.

### [utils/expiration.js](<D:/firdge_manager/fridge-manager/utils/expiration.js>)

- **What it does:** Computes expiry metadata from `expiresAt`, including
  expired/almost-expired flags, whole-day `daysUntil`, expiry timestamp, and
  derived urgency key.
- **Needs / imports:** none.
- **Exports:** `DEFAULT_ALMOST_EXPIRE_DAYS`, `getExpiryMeta`.
- **Used by:** `context/GlobalContext.js`.

### [utils/expiryPredictor.js](<D:/firdge_manager/fridge-manager/utils/expiryPredictor.js>)

- **What it does:** Predicts an item's expiration date from storage, food type,
  and state tags. Normalizes shelf-life days and rejects implausible absolute
  dates.
- **Needs / imports:** none.
- **Exports:** `addDaysIso`, `toIsoOrNull`, `pickTagLabel`,
  `estimateShelfLifeDays`, `predictExpiresAtIso`, `MAX_SHELF_LIFE_DAYS`,
  `normalizeShelfLifeDays`, `isPlausibleExpiresAtIso`.
- **Used by:** `api/gptTools.js`, `context/GlobalContext.js`,
  `utils/migrations.js`.

### [utils/foodTypeInference.js](<D:/firdge_manager/fridge-manager/utils/foodTypeInference.js>)

- **What it does:** Infers a food-type tag label from an item name using a
  keyword rule table, optionally restricted to allowed preset labels.
- **Needs / imports:** none.
- **Exports:** `FOOD_TYPE_RULES`, `inferFoodTypeLabelFromName`.
- **Used by:** `context/GlobalContext.js`.

### [utils/fridgeProposal.js](<D:/firdge_manager/fridge-manager/utils/fridgeProposal.js>)

- **What it does:** Add-all-to-fridge and missing-ingredient proposal lifecycle
  helpers. Normalizes categories/quantity, creates action IDs, and handles
  one-time claim/release/consume behavior for confirmation cards.
- **Needs / imports:** none.
- **Exports:** category/quantity normalization, category label extraction,
  action ID/key/claim/release/mark-consumed helpers.
- **Used by:** `api/gptTools.js`, `app/(tabs)/chat.js`,
  `components/MessageList.js`.

### [utils/itemTagLabels.js](<D:/firdge_manager/fridge-manager/utils/itemTagLabels.js>)

- **What it does:** Builds tag lookup maps and helper functions for converting
  labels to tag IDs, extracting typed labels from tag IDs, replacing one tag
  per type, and deduping tags by type.
- **Needs / imports:** none.
- **Exports:** `buildTagMaps`, `makeLabelToTagId`, `makeGetTagLabelByType`,
  `makeLabelsFromTagIds`, `makeReplaceTagByType`, `makeDedupeTagsByType`.
- **Used by:** `app/(tabs)/fridge.js`, `context/GlobalContext.js`.

### [utils/latestTaskQueue.js](<D:/firdge_manager/fridge-manager/utils/latestTaskQueue.js>)

- **What it does:** Latest-wins async task queue. Ensures only the newest queued
  task executes, while superseded tasks return a caller-provided value.
- **Needs / imports:** none.
- **Exports:** `createLatestTaskQueue`.
- **Used by:** `api/reminderScheduler.js`.

### [utils/linkPreviewPolicy.js](<D:/firdge_manager/fridge-manager/utils/linkPreviewPolicy.js>)

- **What it does:** Safety policy for link-preview fetching. Rejects
  non-HTTPS, credentialed, loopback, local, private IPv4/IPv6, and malformed
  hosts. Explicitly disables automatic metadata loading.
- **Needs / imports:** none.
- **Exports:** `canFetchLinkPreview`, `shouldAutoLoadLinkPreview`.
- **Used by:** `components/LinkPreviewCard.js`, `components/MessageBubble.js`.

### [utils/markdownFlow.js](<D:/firdge_manager/fridge-manager/utils/markdownFlow.js>)

- **What it does:** Parses assistant Markdown into a serializable block/segment
  tree using `markdown-it`, with no raw HTML or auto-linking. Also converts
  Markdown to plain text for sharing/copying.
- **Needs / imports:** `markdown-it`.
- **Exports:** `createMarkdownParser`, `parseMarkdownFlow`,
  `markdownToPlainText`.
- **Used by:** `components/MarkdownText.js`, `components/MessageBubble.js`.

### [utils/markdownSegments.js](<D:/firdge_manager/fridge-manager/utils/markdownSegments.js>)

- **What it does:** Splits assistant text into text/URL segments while
  preserving fenced code blocks, inline code, and Markdown links so URLs can be
  replaced by preview cards.
- **Needs / imports:** none.
- **Exports:** `cleanUrl`, `splitMessageSegments`.
- **Used by:** `components/MarkdownText.js`.

### [utils/migrations.js](<D:/firdge_manager/fridge-manager/utils/migrations.js>)

- **What it does:** Migrates persisted fridge/shopping items into the newest
  shape and decides when legacy provider credentials may be moved.
- **Needs / imports:** `utils/expiryPredictor.js`.
- **Exports:** `canMigrateLegacyProviderCredentials`, `migrateFridgeItems`,
  `migrateShoppingItems`.
- **Used by:** `context/GlobalContext.js`.

### [utils/recipeCards.js](<D:/firdge_manager/fridge-manager/utils/recipeCards.js>)

- **What it does:** Normalizes and bounds recipe payloads into chat-safe recipe
  cards, orders missing ingredients by importance, and exposes a visible
  preview count.
- **Needs / imports:** none.
- **Exports:** `prioritizeMissingIngredients`, `visibleMissingIngredients`,
  `normalizeRecipeCard`, `normalizeRecipeCards`.
- **Used by:** `api/gpt.js`, `components/RecipeResultCards.js`,
  `utils/chatStoragePolicy.js`.

### [utils/recipePreferences.js](<D:/firdge_manager/fridge-manager/utils/recipePreferences.js>)

- **What it does:** Recipe preference schema, normalization, patching,
  proposal application, formatting, and reset. Separates explicit preferences
  from currently inactive learned scores.
- **Needs / imports:** `i18next`.
- **Exports:** schema/version/default constants, `createDefaultRecipePreferences`,
  `normalizeRecipePreferences`, `normalizeRecipePreferencePatch`,
  `applyRecipePreferenceProposal`, `formatRecipePreferencePatch`,
  `patchRecipePreferences`, `resetRecipePreferences`.
- **Used by:** `api/gptTools.js`, `app/(tabs)/chat.js`,
  `context/GlobalContext.js`.

### [utils/recipeShoppingList.js](<D:/firdge_manager/fridge-manager/utils/recipeShoppingList.js>)

- **What it does:** Pure bookkeeping for adding recipe missing ingredients to a
  shopping list. Normalizes names with Unicode NFC/case/whitespace folding,
  splits existing versus batch-duplicate items, and derives button status.
- **Needs / imports:** none.
- **Exports:** `normalizeShoppingItemName`, `planShoppingListAdditions`,
  `shoppingItemsForRecipe`, `missingItemsStatus`.
- **Used by:** `components/RecipeMissingItemsButton.js`, `context/GlobalContext.js`.

### [utils/notificationRouting.js](<D:/firdge_manager/fridge-manager/utils/notificationRouting.js>)

- **What it does:** Payload contract and routing rules for local reminders: the
  `pantrio-local-reminder-v1` marker, the freshness window a tap has to fall
  inside before it is acted on, and the rule that only an item the signed-in
  account owns may be focused. Kept free of native imports so it can be unit
  tested from plain Node.
- **Needs / imports:** none.
- **Exports:** `REMINDER_MARKER`, `NOTIFICATION_ROUTE_MAX_AGE_MS`,
  `buildReminderRoute`, `resolveFocusedItemId`.
- **Used by:** `api/reminderScheduler.js` (marker),
  `hooks/useNotificationRouting.js` (routing).

### [utils/reminderPolicy.js](<D:/firdge_manager/fridge-manager/utils/reminderPolicy.js>)

- **What it does:** Pure reminder policy helpers. Determines whether reminders
  can synchronize, builds a change-detection signature, and schedules up to 40
  expiration reminders at 09:00. An item that is already inside its notify
  window re-arms for the next 09:00 instead of being dropped.
- **Needs / imports:** none.
- **Exports:** `canSynchronizeReminders`, `buildReminderSyncSignature`,
  `buildExpirationReminderSchedule`.
- **Used by:** `api/reminderScheduler.js`, `context/GlobalContext.js`.

### [utils/tags.js](<D:/firdge_manager/fridge-manager/utils/tags.js>)

- **What it does:** Normalizes category inputs (typed object, legacy array,
  comma string, label/key/id) into deduped preset tag IDs without inventing
  unknown tags.
- **Needs / imports:** none.
- **Exports:** `buildTagById`, `findPresetTagId`, `normalizeToPresetTagIds`.
- **Used by:** `context/GlobalContext.js`.

### [utils/tagTranslation.js](<D:/firdge_manager/fridge-manager/utils/tagTranslation.js>)

- **What it does:** Translates canonical English tag labels to localized
  display text at render time; stored values remain English.
- **Needs / imports:** `i18next`.
- **Exports:** `translateTagLabel`.
- **Used by:** `components/InventoryListItem.js`, `components/ItemFormModal.js`,
  `components/MessageList.js`.

### [utils/voiceInput.js](<D:/firdge_manager/fridge-manager/utils/voiceInput.js>)

- **What it does:** Currently active composer text helpers; disabled voice
  transcript/upload helpers remain in comments for later restoration.
- **Needs / imports:** none.
- **Exports:** `normalizeComposerText`, `shouldShowSendButton`.
- **Used by:** `components/MessageInput.js`.

---

## 7. Native Expo modules (`modules/`)

### [modules/apple-intelligence/expo-module.config.json](<D:/firdge_manager/fridge-manager/modules/apple-intelligence/expo-module.config.json>)

- **What it does:** Declares the Apple Intelligence module as an Apple-only
  native module.
- **Needs / imports:** none.
- **Exports:** JSON config.
- **Used by:** Expo autolinking.

### [modules/apple-intelligence/ios/AppleIntelligence.podspec](<D:/firdge_manager/fridge-manager/modules/apple-intelligence/ios/AppleIntelligence.podspec>)

- **What it does:** CocoaPods specification for the Apple Intelligence native
  module.
- **Needs / imports:** `ExpoModulesCore`; Swift 5.9, iOS 16.4.
- **Exports:** podspec.
- **Used by:** iOS build.

### [modules/apple-intelligence/ios/AppleIntelligenceModule.swift](<D:/firdge_manager/fridge-manager/modules/apple-intelligence/ios/AppleIntelligenceModule.swift>)

- **What it does:** Native Expo module for Apple Intelligence/Foundation
  Models. Probes availability, opens Apple Intelligence settings, generates
  plain-text responses, and generates structured tool/final turns through a
  `@Generable` schema.
- **Needs / imports:** `ExpoModulesCore`, `UIKit`, `FoundationModels`.
- **Exports:** native functions `getAvailability`, `openSettings`, `generate`,
  `generateToolTurn`.
- **Used by:** `modules/apple-intelligence/src/index.js` and settings via the
  JS bridge.

### [modules/apple-intelligence/src/index.js](<D:/firdge_manager/fridge-manager/modules/apple-intelligence/src/index.js>)

- **What it does:** JS bridge for the Apple Intelligence native module, with
  platform guards and friendly unsupported-platform/development-build results.
- **Needs / imports:** `expo-modules-core`, `react-native`.
- **Exports:** `getAppleIntelligenceAvailability`, `openAppleIntelligenceSettings`,
  `generateWithAppleIntelligence`, `generateAppleIntelligenceToolTurn`.
- **Used by:** `api/gpt.js`, `app/(tabs)/settings.js`.

### [modules/apple-subscriptions/expo-module.config.json](<D:/firdge_manager/fridge-manager/modules/apple-subscriptions/expo-module.config.json>)

- **What it does:** Declares the Apple Subscriptions module as an Apple-only
  native module.
- **Needs / imports:** none.
- **Exports:** JSON config.
- **Used by:** Expo autolinking.

### [modules/apple-subscriptions/ios/AppleSubscriptions.podspec](<D:/firdge_manager/fridge-manager/modules/apple-subscriptions/ios/AppleSubscriptions.podspec>)

- **What it does:** CocoaPods specification for the StoreKit subscription
  bridge.
- **Needs / imports:** `ExpoModulesCore`, `StoreKit`; Swift 5.9, iOS 16.4.
- **Exports:** podspec.
- **Used by:** iOS build.

### [modules/apple-subscriptions/ios/AppleSubscriptionsModule.swift](<D:/firdge_manager/fridge-manager/modules/apple-subscriptions/ios/AppleSubscriptionsModule.swift>)

- **What it does:** Native StoreKit 2 module. Configures product IDs, loads
  localized products, reads current subscription status, purchases with an
  app-account token, restores purchases, lists unfinished transactions,
  finishes accepted transactions, and emits status/transaction events from
  StoreKit updates and app foreground.
- **Needs / imports:** `ExpoModulesCore`, `Foundation`, `StoreKit`, `UIKit`.
- **Exports:** native functions/events `configure`, `getCurrentStatus`,
  `getProducts`, `purchase`, `restorePurchases`,
  `getUnfinishedTransactions`, `finishTransactions`, status/transaction event
  observers.
- **Used by:** `modules/apple-subscriptions/src/index.js`.

### [modules/apple-subscriptions/src/index.js](<D:/firdge_manager/fridge-manager/modules/apple-subscriptions/src/index.js>)

- **What it does:** JS bridge and normalization layer for the StoreKit module.
  Normalizes snapshots, products, transaction evidence/outcomes, and provides
  typed product/status/purchase/restore/finish/listener APIs.
- **Needs / imports:** `expo-modules-core`, `react-native`.
- **Exports:** event names, `EMPTY_APPLE_SUBSCRIPTION`, configured product ID
  helper, normalization helpers, `getAppleSubscriptionProducts`,
  `getAppleSubscriptionStatus`, `purchaseAppleSubscription`,
  `restoreAppleSubscriptions`, `getUnfinishedAppleTransactions`,
  `finishAppleTransactions`, status/transaction listener functions.
- **Used by:** `context/SubscriptionContext.js`.

---

## 8. Scripts (`scripts/`)

### [scripts/run-unit-tests.cjs](<D:/firdge_manager/fridge-manager/scripts/run-unit-tests.cjs>)

- **What it does:** Runs every `tests/*.test.js` with Node's built-in test
  runner and the i18next ESM preload.
- **Needs / imports:** Node `fs`, `path`, `child_process`, `url`.
- **Exports:** none; CLI entry.
- **Used by:** `npm test` / `npm run test:unit`.

### [scripts/i18n-test-setup.mjs](<D:/firdge_manager/fridge-manager/scripts/i18n-test-setup.mjs>)

- **What it does:** ESM preload that initializes the same `i18next` singleton
  with English values so unit tests see real user-facing strings.
- **Needs / imports:** `node:module`, `i18next`, `locales/en.json`.
- **Exports:** none; preload module.
- **Used by:** `scripts/run-unit-tests.cjs`.

### [scripts/check-i18n-keys.cjs](<D:/firdge_manager/fridge-manager/scripts/check-i18n-keys.cjs>)

- **What it does:** Scans source for `t()`/`i18next.t()` keys and verifies all
  are present in `locales/en.json`; also checks every locale mirrors the
  English key set.
- **Needs / imports:** Node `fs`, `path`, locale JSON files.
- **Exports:** none; CLI entry.
- **Used by:** manual quality gate.

### [scripts/extract-text.cjs](<D:/firdge_manager/fridge-manager/scripts/extract-text.cjs>)

- **What it does:** Babel-based heuristic scanner that extracts candidate
  user-facing strings from app source and writes them to a JSON report for
  translation curation.
- **Needs / imports:** Node `fs`, `path`, `@babel/parser`, `@babel/traverse`.
- **Exports:** none; CLI entry.
- **Used by:** manual localization workflow.

---

## 9. Internationalization (`i18n/`)

### [i18n/index.js](<D:/firdge_manager/fridge-manager/i18n/index.js>)

- **What it does:** Initializes `i18next` and `react-i18next` with English and
  Simplified Chinese resources. Resolves language as saved preference →
  device locale → English, and persists the user's explicit selection.
- **Needs / imports:** `@react-native-async-storage/async-storage`,
  `expo-localization`, `i18next`, `react-i18next`, `locales/en.json`,
  `locales/zh.json`.
- **Exports:** `SUPPORTED_LANGUAGES`, `LANGUAGE_STORAGE_KEY`,
  `getDeviceLanguageCode`, `getSavedLanguageCode`, `setAppLanguage`, default
  `i18n`.
- **Used by:** `app/(tabs)/settings.js`, `app/_layout.js`.

---

## 10. Root build and configuration files

### [app.config.js](<D:/firdge_manager/fridge-manager/app.config.js>)

- **What it does:** Dynamic Expo build configuration gate. Loads project env,
  validates EAS/Firebase/Google project consistency, requires production
  HTTPS/WSS and legal URLs, derives the Google iOS URL scheme, injects the
  Google Sign-In plugin, and hardens iOS ATS in production.
- **Needs / imports:** `@expo/env`.
- **Exports:** CommonJS config function.
- **Used by:** Expo/EAS build.

### [app.json](<D:/firdge_manager/fridge-manager/app.json>)

- **What it does:** Static Expo app configuration: bundle ID, scheme, icons,
  plugins, permissions, Sentry plugin, EAS project ID, updates URL, and
  fingerprint runtime version.
- **Needs / imports:** none.
- **Exports:** JSON config.
- **Used by:** `app.config.js` and Expo/EAS.

### [metro.config.js](<D:/firdge_manager/fridge-manager/metro.config.js>)

- **What it does:** Metro bundler configuration based on Sentry's Expo Metro
  config.
- **Needs / imports:** `@sentry/react-native/metro`.
- **Exports:** CommonJS Metro config.
- **Used by:** Expo bundler.

### [eas.json](<D:/firdge_manager/fridge-manager/eas.json>)

- **What it does:** EAS Build and Submit profiles for development, preview, and
  production, pinning Node and selecting matching environments/channels.
- **Needs / imports:** none.
- **Exports:** JSON config.
- **Used by:** EAS CLI.

### [eslint.config.js](<D:/firdge_manager/fridge-manager/eslint.config.js>)

- **What it does:** ESLint flat configuration using Expo's base config, with
  ignores for `dist`/`.expo` and an intentional i18next import rule override.
- **Needs / imports:** `eslint-config-expo/flat`, `eslint/config`.
- **Exports:** CommonJS config.
- **Used by:** `expo lint` and IDE.

### [tsconfig.json](<D:/firdge_manager/fridge-manager/tsconfig.json>)

- **What it does:** TypeScript config extending Expo, enabling strict mode and
  `@/*` path aliases.
- **Needs / imports:** none.
- **Exports:** JSON config.
- **Used by:** TypeScript tooling.
- **Notes:** The project currently has no `.ts`/`.tsx` sources; the include
  list also references the older `app/tabs/index.js` path.

### [expo-env.d.ts](<D:/firdge_manager/fridge-manager/expo-env.d.ts>)

- **What it does:** Expo TypeScript environment reference file.
- **Needs / imports:** `expo/types`.
- **Exports:** ambient declarations.
- **Used by:** TypeScript tooling.

### [package.json](<D:/firdge_manager/fridge-manager/package.json>)

- **What it does:** Project manifest with dependencies, scripts, and Node
  engine ranges.
- **Needs / imports:** none.
- **Exports:** JSON manifest.
- **Used by:** npm/Expo tooling.

---

## 11. Unit tests (`tests/`)

These files are currently present on disk but excluded by `.gitignore`.
They are run by `node scripts/run-unit-tests.cjs`.

### [tests/accountDeletionPolicy.test.js](<D:/firdge_manager/fridge-manager/tests/accountDeletionPolicy.test.js>)

- **What it does:** Tests `api/accountDeletionPolicy.cjs`.
- **Covers:** complete/processing response classification, retry versus
  definitive outcomes, deleted-Firebase errors, purge gating, and oldest
  pending deletion selection.

### [tests/aiProviderPolicy.test.js](<D:/firdge_manager/fridge-manager/tests/aiProviderPolicy.test.js>)

- **What it does:** Tests `api/aiProviderPolicy.js`.
- **Covers:** Apple/provider selection and legacy custom-setting compatibility.

### [tests/aiProviderSlotComparison.test.js](<D:/firdge_manager/fridge-manager/tests/aiProviderSlotComparison.test.js>)

- **What it does:** Tests legacy URL-keyed versus slot-keyed AI provider design
  migration/equivalence.
- **Covers:** URL normalization, preset lookup, validation, in-memory backend,
  migrations, slot persistence, and user-flow equivalence.
- **Note:** Currently imports a missing `../refactor/aiProviderSlotModel.js`
  path, so this suite is the observed red test.

### [tests/appleIntelligence.test.js](<D:/firdge_manager/fridge-manager/tests/appleIntelligence.test.js>)

- **What it does:** Tests `modules/apple-intelligence/src/index.js` through a
  transformed module.
- **Covers:** lazy non-iOS behavior, iOS forwarding, and development-build
  fallback.

### [tests/appleSubscriptionSnapshotPolicy.test.js](<D:/firdge_manager/fridge-manager/tests/appleSubscriptionSnapshotPolicy.test.js>)

- **What it does:** Tests native Apple subscription snapshot semantics.
- **Covers:** routine status snapshots enumerating current entitlements and
  explicit restore snapshots requesting full history.

### [tests/buildSystemMessageLanguage.test.js](<D:/firdge_manager/fridge-manager/tests/buildSystemMessageLanguage.test.js>)

- **What it does:** Tests `api/buildSystemMessage.js`.
- **Covers:** no list inlining, required tools, English/Chinese selection,
  unsupported language fallback, and tool-provided values staying untranslated.

### [tests/bulkProposal.test.js](<D:/firdge_manager/fridge-manager/tests/bulkProposal.test.js>)

- **What it does:** Tests `utils/bulkProposal.js`.
- **Covers:** stable id-scoped keys, one-time claims/releases, and consumed
  card handling.

### [tests/chatMessageOrder.test.js](<D:/firdge_manager/fridge-manager/tests/chatMessageOrder.test.js>)

- **What it does:** Tests `utils/chatMessageOrder.js`.
- **Covers:** assistant insertion above a tracked action card and fallback
  append behavior.

### [tests/chatStoragePolicy.test.js](<D:/firdge_manager/fridge-manager/tests/chatStoragePolicy.test.js>)

- **What it does:** Tests `utils/chatStoragePolicy.js`.
- **Covers:** persistence image stripping, web blob rejection, message/byte
  bounding, recipe-card persistence, conversation normalization, archive
  helpers, and attachment URI dedupe.

### [tests/composerLayout.test.js](<D:/firdge_manager/fridge-manager/tests/composerLayout.test.js>)

- **What it does:** Tests `utils/composerLayout.js`.
- **Covers:** growth through six lines, viewport capping, invalid/empty content
  fallback, and min/max height behavior.

### [tests/expiration.test.js](<D:/firdge_manager/fridge-manager/tests/expiration.test.js>)

- **What it does:** Tests `utils/dateInput.js`, `utils/expiration.js`, and
  `utils/expiryPredictor.js`.
- **Covers:** local end-of-day semantics, shelf-life normalization, and
  implausible-date rejection.

### [tests/fridgeProposal.test.js](<D:/firdge_manager/fridge-manager/tests/fridgeProposal.test.js>)

- **What it does:** Tests fridge proposal normalization, persistence, and
  one-time application behavior.
- **Covers:** category/quantity normalization, legacy categories, add-all
  single application, claim/release, and missing-ingredient shopping-list
  behavior.

### [tests/googleSignInResponse.test.js](<D:/firdge_manager/fridge-manager/tests/googleSignInResponse.test.js>)

- **What it does:** Tests `auth/googleSignInResponse.js`.
- **Covers:** v16 success token extraction, cancellation safety, cached-token
  use only after success, unknown responses, and legacy direct token response.

### [tests/gptToolOwnership.test.js](<D:/firdge_manager/fridge-manager/tests/gptToolOwnership.test.js>)

- **What it does:** Tests `api/gptTools.js`.
- **Covers:** client/server ownership filtering, one-time tool claims,
  proposal tools, category/expiry conversion, unknown label rejection, and
  bulk proposal tag/expiry behavior.

### [tests/latestTaskQueue.test.js](<D:/firdge_manager/fridge-manager/tests/latestTaskQueue.test.js>)

- **What it does:** Tests `utils/latestTaskQueue.js`.
- **Covers:** invalidation after active work and only newest queued task
  execution.

### [tests/legacyPurgePolicy.test.js](<D:/firdge_manager/fridge-manager/tests/legacyPurgePolicy.test.js>)

- **What it does:** Tests `api/legacyPurgePolicy.cjs`.
- **Covers:** removing ownerless/matching legacy data and preserving another
  user's data.

### [tests/markdownFlow.test.js](<D:/firdge_manager/fridge-manager/tests/markdownFlow.test.js>)

- **What it does:** Tests `utils/markdownFlow.js`.
- **Covers:** plain text, empty input, plain-text conversion, inline styles,
  headings, lists, code blocks, quotes, rules, links, tables, line breaks, and
  image alt fallback.

### [tests/markdownSegments.test.js](<D:/firdge_manager/fridge-manager/tests/markdownSegments.test.js>)

- **What it does:** Tests `utils/markdownSegments.js`.
- **Covers:** URL trimming, text/URL splitting, trailing punctuation, fenced
  code, inline code, Markdown links, multiple URLs, and invalid input.

### [tests/privacyPolicy.test.js](<D:/firdge_manager/fridge-manager/tests/privacyPolicy.test.js>)

- **What it does:** Tests privacy-related utilities.
- **Covers:** incognito non-persistence, incognito exit clearing, no automatic
  link previews, and link-preview URL policy.

### [tests/recipeAssistant.test.js](<D:/firdge_manager/fridge-manager/tests/recipeAssistant.test.js>)

- **What it does:** Tests `api/recipeAssistant.js`.
- **Covers:** the explicit `findRecipes` UI action, removal of the client text
  classifier, context bounding, custom-provider tool policy, recipe-safe
  descriptions, and Apple Intelligence tool generation.

### [tests/recipeCards.test.js](<D:/firdge_manager/fridge-manager/tests/recipeCards.test.js>)

- **What it does:** Tests `utils/recipeCards.js`.
- **Covers:** bounded trusted card fields, dropping invalid cards, and missing
  ingredient preview ordering.

### [tests/recipePreferences.test.js](<D:/firdge_manager/fridge-manager/tests/recipePreferences.test.js>)

- **What it does:** Tests `utils/recipePreferences.js`.
- **Covers:** safe defaults, normalization, patch merge, proposal operations,
  formatter output, and reset.

### [tests/recipeShoppingList.test.js](<D:/firdge_manager/fridge-manager/tests/recipeShoppingList.test.js>)

- **What it does:** Tests `utils/recipeShoppingList.js`.
- **Covers:** case/whitespace/Unicode name matching, dedupe, structured recipe
  items, status calculation, malformed entry handling, and numeric coercion.

### [tests/refreshPolicy.test.js](<D:/firdge_manager/fridge-manager/tests/refreshPolicy.test.js>)

- **What it does:** Tests `context/refreshPolicy.js`.
- **Covers:** account-data gating, ordered catalog keys, refresh freshness, and
  product coverage.

### [tests/notificationRouting.test.js](<D:/firdge_manager/fridge-manager/tests/notificationRouting.test.js>)

- **What it does:** Tests `utils/notificationRouting.js`.
- **Covers:** tap-to-item routing, foreign payloads, stale taps, non-tap
  actions, reminders with no item to focus, and the rule that only an item the
  current account owns is focused.

### [tests/reminderPolicy.test.js](<D:/firdge_manager/fridge-manager/tests/reminderPolicy.test.js>)

- **What it does:** Tests `utils/reminderPolicy.js`.
- **Covers:** hydration failure safety, signature specificity (including the
  retired daily toggle), 09:00 scheduling, in-window re-arming, and the
  40-reminder cap.

### [tests/storageMigrationPolicy.test.js](<D:/firdge_manager/fridge-manager/tests/storageMigrationPolicy.test.js>)

- **What it does:** Tests `utils/migrations.js`.
- **Covers:** migrating legacy provider credentials only after authoritative
  settings load.

### [tests/tagNormalization.test.js](<D:/firdge_manager/fridge-manager/tests/tagNormalization.test.js>)

- **What it does:** Tests `utils/tags.js`.
- **Covers:** typed object categories, empty-state skipping, dedupe, and legacy
  array/id-list/comma-string forms.

### [tests/voiceInput.test.js](<D:/firdge_manager/fridge-manager/tests/voiceInput.test.js>)

- **What it does:** Tests `utils/voiceInput.js`.
- **Covers:** active composer text normalization and send-button visibility.

---

## 12. Quick reference by directory

| Directory | Primary role |
| --- | --- |
| `app/` | Expo Router screens and route layouts |
| `api/` | Backend, AI, storage, reminder, and account services |
| `auth/` | Firebase, Google, Apple, and secure persistence |
| `components/` | Reusable UI and chat rendering |
| `context/` | Global state, account session, and subscription providers |
| `utils/` | Pure domain, policy, and formatting helpers |
| `modules/` | Apple-only native StoreKit and Apple Intelligence bridges |
| `scripts/` | Unit-test runner and i18n/text quality tools |
| `i18n/` | i18next bootstrap |
| `tests/` | Node unit tests for pure services and policies |

For system-level explanations and diagrams, see
[docs/CODEBASE_REPORT.md](<D:/firdge_manager/fridge-manager/docs/CODEBASE_REPORT.md>)
and
[docs/architecture-flowchart.md](<D:/firdge_manager/fridge-manager/docs/architecture-flowchart.md>).
