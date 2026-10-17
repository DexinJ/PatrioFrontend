# Pantrio Client — Architecture Flowcharts

Derived from a full read of the repository at commit `c4181d6` (`main`).
Every node below corresponds to a real module or route in the tree; paths are
relative to the repository root.

---

## 1. System context — the client and everything it talks to

```mermaid
flowchart LR
    subgraph Device["iOS device (React Native / Expo)"]
        UI["Screens and components<br/>app/, components/"]
        STATE["GlobalContext + ChatContext<br/>context/GlobalContext.js"]
        AI["GptProvider<br/>api/gpt.js"]
        STORE["AsyncStorage + SecureStore<br/>api/storageKeys.js, auth/secureFirebaseStorage.js"]
        FILES["Chat attachment files<br/>api/chatAttachments.js"]
        NATA["Apple Intelligence module<br/>modules/apple-intelligence"]
        NATS["StoreKit module<br/>modules/apple-subscriptions"]
    end

    FB["Firebase Authentication<br/>auth/firebaseClient.native.js"]
    API["Pantrio backend REST API<br/>EXPO_PUBLIC_API_BASE_URL"]
    WS["Pantrio backend chat socket<br/>EXPO_PUBLIC_WS_URL"]
    APPLE["Apple App Store<br/>StoreKit 2 + App Store Server"]
    SENTRY["Sentry<br/>app/_layout.js"]

    UI --> STATE
    UI --> AI
    STATE --> STORE
    STATE --> FILES
    AI --> WS
    AI --> API
    AI --> NATA
    STATE --> API
    FB --> STORE
    NATS --> APPLE
    UI -.errors.-> SENTRY
```

The backend is a separate service (not in this repository). The client holds no
OpenAI or Apple server credentials; only `EXPO_PUBLIC_*` build values and the
user's own provider key (SecureStore) ever reach the device.

---

## 2. Boot, provider nesting, and route gating

```mermaid
flowchart TD
    A["app/_layout.js<br/>Sentry.init + Sentry.wrap"] --> B["Sentry.ErrorBoundary<br/>RootErrorFallback"]
    B --> C["AuthProvider<br/>auth/useAuth.js"]
    C --> D{"authRecoveryError?"}
    D -- yes --> E["AuthRecoveryFallback<br/>retry / sign out / clear device data"]
    D -- no --> F["AppNavigator<br/>expo-router Stack"]

    F --> G{"loading?"}
    G -- yes --> H["Loading overlay"]
    G -- no --> I{"Firebase user?"}
    I -- no --> J["(auth) group<br/>onboarding → sign-in / sign-up"]
    I -- yes --> K["(tabs) group"]

    subgraph Tabs["app/(tabs)/_layout.js provider nest"]
      K1["AppleSubscriptionProvider<br/>context/SubscriptionContext.js"] --> K2["AccountSessionProvider<br/>context/AccountSessionContext.js"]
      K2 --> K3["SessionBackedGlobalProvider<br/>canExposeAccountData gate"]
      K3 --> K4["GlobalProvider<br/>context/GlobalContext.js"]
      K4 --> K5["GptProvider<br/>api/gpt.js"]
      K5 --> K6["ThemedTabs<br/>index / chat / fridge / list / settings"]
    end

    K --> K1
    K6 --> L["ConversationDrawer<br/>components/ConversationListModal.js"]

    subgraph Gates["Blocking gates inside ThemedTabs"]
      M1["initializing || !storageHydrated<br/>→ account + local data spinner"]
      M2["storageRecoveryRequired<br/>→ retry hydration / log out"]
      M3["!canExposeAccountData(session)<br/>→ verify access / retry / log out"]
    end
    K6 -.-> M1
    K6 -.-> M2
    K3 -.-> M3
```

`GlobalProvider` is mounted twice on purpose: the auth group needs theme and
settings before a session exists, and the tabs group mounts it again with
`authUser` + `accountProfile` so the same state is UID-scoped.

---

## 3. Chat request lifecycle

```mermaid
flowchart TD
    A["ChatScreen.handleSend<br/>app/(tabs)/chat.js"] --> B["streamMessage<br/>api/gpt.js"]
    B --> C["addMessage → chat state<br/>api/memoryManager.js"]
    C --> D["explicit uiAction only<br/>text routing lives on the backend"]
    D --> E["buildSystemMessage<br/>api/buildSystemMessage.js"]
    E --> F["buildRecipeContext<br/>fridge + preferences + selected items"]
    F --> G{"settings.advanced.aiProvider"}

    G -- pantrio --> H["WebSocket start payload<br/>requestId, token, model, messages"]
    G -- custom --> P["runCustomAi<br/>OpenAI-compatible /chat/completions"]
    G -- apple --> Q["runAppleAi<br/>Foundation Models via native module"]

    H --> H1["delta events → 50 ms batched render<br/>flushAssistantDelta"]
    H --> H2["tool_calls / awaiting_tool_results"]
    H2 --> H3["claimClientOwnedGPTToolCalls<br/>api/gptTools.js"]
    H3 --> H4["execute handler locally"]
    H4 --> H5["ws.send tool_results"]
    H --> H6["tool: recommendRecipes → recipe_cards message"]
    H --> H7["done / error → settle promise"]

    P --> P1["6-step loop<br/>tool_choice forced per intent"]
    P1 --> P2["requestRecipeRecommendations REST<br/>POST /api/recipes/recommend"]
    Q --> Q1["6-step loop<br/>generateAppleIntelligenceToolTurn"]
    Q1 --> P2

    H7 --> R["insertAssistantAboveStructuredMessage<br/>assistant text above cards"]
    P2 --> R
    R --> S["Chat persistence engine<br/>GlobalContext queue + generation guard"]
```

Failure handling is uniform: `AUTH_REQUIRED`, `QUOTA_EXHAUSTED`,
`RATE_LIMITED`, `REQUEST_TIMEOUT`, `CONNECTION_CLOSED`, and `REQUEST_CANCELLED`
are turned into user-facing text in `getChatErrorMessage` (`chat.js`) and
`backendErrors.js`.

---

## 4. Authentication and account-lifecycle state machine

```mermaid
stateDiagram-v2
    [*] --> Loading
    Loading --> SignedOut: onAuthStateChanged(null)
    Loading --> Reconciling: onAuthStateChanged(user)

    Reconciling --> SignedIn: no markers, profile verified
    Reconciling --> SigningOut: authProvisioning marker without backend profile
    Reconciling --> FinishingDeletion: purge intent + deletion tombstone
    Reconciling --> Recovery: status unknown / verification failed

    SignedOut --> Provisioning: sign-up (beginProvisioning)
    Provisioning --> SignedIn: POST /api/users succeeded → completeProvisioning
    Provisioning --> SignedOut: abortProvisioning + deleteUser / firebaseSignOut

    SignedIn --> SigningOut: signOut / logout
    SigningOut --> SignedOut: firebaseSignOut complete

    SignedIn --> DeletingAccount: Settings → Delete Account (reauthenticate first)
    DeletingAccount --> FinishingDeletion: DELETE accepted (or 410 tombstone)
    FinishingDeletion --> SignedOut: local purge + provider revoke + sign-out
    FinishingDeletion --> Recovery: purge or sign-out failed
    DeletingAccount --> Recovery: status could not be proven

    Recovery --> SignedIn: retryAuthRecovery
    Recovery --> SignedOut: signOutFromRecovery
    Recovery --> DeviceCleared: clearPendingDeletionDataFromRecovery
```

Durable breadcrumbs (`api/accountLifecycleStorage.js`,
`api/authProvisioningStorage.js`, `api/storageKeys.js` purge intents) are what
make the flow crash-safe: the app would rather stay locked on a verification
screen than publish a half-provisioned or half-deleted account.

---

## 5. Local data: hydration, persistence, and purge

```mermaid
flowchart TD
    A["GlobalProvider mount<br/>storageOwnerUid = authUser.uid"] --> B["listUserDataPurgeIntents()"]
    B --> C{"pending confirmed/purging intents?"}
    C -- yes --> D["completePendingUserDataPurge(uid)<br/>before any read"]
    C -- no --> E["migrateLegacyAsyncStorageForUser(uid)"]
    D --> E
    E --> F["Promise.allSettled per slice:<br/>fridge, shopping, settings, chat, chat index"]
    F --> G["per-slice resolveSlice(writeEnabled, error)"]

    G --> H{"all four slices resolved?"}
    H -- no --> H1["storageHydrated = false → gate screen"]
    H -- yes --> I["storageHydrated = true → tabs render"]

    I --> J["write effects per slice<br/>only if that slice writeEnabled"]
    J --> K["AsyncStorage.setItem (UID-scoped keys)<br/>api/storageKeys.js"]
    K -.write failure.-> L["markStorageWriteFailure → slice becomes read-only<br/>+ recovery screen"]

    I --> M["chat persistence queue<br/>generation-guarded, per conversations"]
    M --> N["saveConversationChatData + pruneChatAttachments"]

    I --> O{"settings.privacy.incognito"}
    O -- on --> P["memory only; erase conversation payloads on exit"]
    O -- off --> M
```

All keys are namespaced as `@pantrio:user:<hex-encoded-uid>:…`, so two accounts
on one device can never read each other's inventory, settings, or chats.

---

## 6. Inventory domain model and derived urgency

```mermaid
flowchart LR
    subgraph Presets["Preset tag taxonomy — context/GlobalContext.js"]
        T1["storage<br/>Fridge / Freezer / Pantry"]
        T2["urgency<br/>Expired → Eat first → Use soon → Lasts a while → Long keeper"]
        T3["food_type<br/>Produce … Frozen"]
        T4["state<br/>Opened / Unopened / Raw / Cooked / Cut / Whole"]
    end

    A["ItemFormModal payload<br/>name, quantity, label set, expiresAt"] --> B["normalizeCategoriesToTagIds<br/>utils/tags.js"]
    B --> C["raw item: tagIds + createdAt + expiresAt"]
    C --> D["getExpiryMeta<br/>utils/expiration.js"]
    E["urgencyDays thresholds<br/>settings.expiration"] --> D
    D --> F["derived urgencyKey → tag replaced on read<br/>fridgeItems memo"]
    F --> G["FridgeScreen sections:<br/>Expired / Expiring soon / Items"]
    F --> H["HomeScreen dashboard counts"]
    F --> I["Reminder scheduling<br/>utils/reminderPolicy.js"]

    C --> J{"expiresAt missing on add/edit?"}
    J -- yes --> K["predictExpiresAtIso<br/>utils/expiryPredictor.js<br/>storage × food_type × state matrix"]
    K --> C
```

Urgency is derived, never stored stale: the persisted item keeps the user's
tags, and `GlobalContext` recomputes and re-stamps the urgency tag on every
read, on a midnight timer and on app foreground.

---

## 7. Confirm-before-commit proposal flow (AI writes)

```mermaid
sequenceDiagram
    participant U as User
    participant M as Model (any provider)
    participant T as api/gptTools.js
    participant C as Chat message list
    participant S as GlobalContext actions

    U->>M: add what you see in this photo
    M->>T: proposeAddAllToFridge(items)
    T->>C: ui_action message (status: pending, actionId)
    T-->>M: card shown, nothing committed
    M-->>U: review the card and confirm
    U->>C: taps Confirm
    C->>S: addManyToFridge(items)
    C->>C: markFridgeProposalActionConsumed (status: completed)
    S-->>U: summary message with applied/skipped counts
```

The same pattern covers `proposeBulkFridgeUpdate`, recipe-preference changes,
and "add missing ingredients to the shopping list". Each proposal carries an
`actionId`, is claimed once via a `Set` in `chat.js`, and is marked consumed in
the message list so a re-render cannot double-apply it.
