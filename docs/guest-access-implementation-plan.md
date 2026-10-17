# Pantrio Guest Access — Implementation Plan

Status: proposal, nothing implemented. Prepared 2026-10-15.
Revised 2026-10-16 after a review pass found four defects in the first draft.
See section 0.

Goal: make Pantrio usable without an account for the features that work on the device,
so the app stops contradicting App Review Guideline 5.1.1(v), while keeping hosted AI,
sync, and subscription account-based.

---

## 0. Corrections made after review (2026-10-16)

The first draft of this plan contained four defects. They are recorded here
because three of them would have shipped as bugs, and one changes the size of
the change set.

**C1 — the proposed account-only guard would have bricked guest mode.**
The draft added `assertAccountStorageOwner()` inside `purgeStoredUserData()`.
`clearAllData` (`context/GlobalContext.js:2753`) calls
`markUserDataPurgePending(storageOwnerUid)` and then
`completePendingUserDataPurge(storageOwnerUid)`. With a guest owner that writes a
`:purgeIntent` under the guest namespace, the assertion throws,
`recordUserDataPurgeFailure` journals the failure, and every later launch finds
the confirmed intent in the sweep at `context/GlobalContext.js:1085`, throws
again, and calls `resolveAllReadOnly(error)` — parking the app on the local-data
recovery screen with no way out.
Resolution: the guard was dropped entirely. `purgeStoredUserData` is already
owner-generic (`clearChatData(uid)`, `deleteChatAttachments(uid)`, and the
SecureStore helpers all take an owner string, and `safeUserDirectoryName` runs
the id through `encodeURIComponent`), so it works unchanged for a guest owner.
Phases 5.1 and 5.2 below are now verification work, not code changes, and
`clearAllData` needs no edit at all.

**C2 — branching the tabs provider tree would have silently disabled features.**
The draft rendered a second, session-free tree for guests. But `ThemedTabs`
calls `useAccountSession()` unconditionally for `beginAccountTeardown` and
`initializing`, and the chat runtime calls it at `api/gpt.js:668` for
`applyRealtimeState`. `AccountSessionContext` has a full no-op default object
(`context/AccountSessionContext.js:275`), so the app would not have crashed — it
would have quietly lost account teardown and realtime state instead.
Resolution: keep the single provider chain and pass `authUser={user ?? null}`.
`AccountSessionProvider` already supports that (`initialized = !authUser`,
`loading = Boolean(authUser)`). Only the subscription provider and the session
gate change. See Phase 2.2.

**C3 — the guest bootstrap would have slowed every signed-in cold start.**
The draft read the guest preference unconditionally, adding a storage read to
the signed-in path, and a hung read would have delayed startup because `.catch`
only covers rejection.
Resolution: consult the guest preference only when there is no Firebase user,
inside the existing loading gate. See Phase 2.3.

**C4 — an unused import.**
`isGuestStorageOwner` was imported into `api/guestStorageOwner.js` and never
used, which `expo lint` rejects. It was also a symptom of C2, where the function
was actually needed.

**Ordering hazard, now enforced in code rather than by comment.**
The device id must be committed before the preference that resumes guest mode.
The reverse order lets a launch resume a guest session with no owner, which the
data layer can only answer with read-only storage and the recovery screen.
`api/guestStorageOwner.js` exposes `enableGuestMode()`, which performs both
steps in the safe order internally, so a caller cannot get it wrong.

## 1. What the code does today (verified by reading it)

| Area | File / line | Behaviour |
| --- | --- | --- |
| First launch | `app/(auth)/_layout.js` | `initialRouteName="onboarding"` |
| Onboarding | `app/(auth)/onboarding.js` | Five pages, header comment says "NO SKIP"; last page offers only Create account / Log in |
| Root routing | `app/_layout.js` `AppNavigator` | `Stack.Protected` guards; `(tabs)` mounts only when `Boolean(user)` |
| Tabs gate | `app/(tabs)/_layout.js:615-635` | `if (!user) return null;` then `AppleSubscriptionProvider key={user.uid}` → `AccountSessionProvider` → `SessionBackedGlobalProvider` → `GptProvider` → `EmailVerificationProvider` → `ThemedTabs` |
| Session gate | `context/refreshPolicy.js` `canExposeAccountData` + `(tabs)/_layout.js:117` | A null session renders "account access could not be verified" instead of the app |
| Storage owner | `context/GlobalContext.js:975` | `const storageOwnerUid = user?.uid \|\| null;` — one owner for every slice |
| Storage keys | `api/storageKeys.js:22,69` | `normalizeUid()` throws `"An authenticated user is required for local storage."`; `getUserStorageKeys(uid)` namespaces everything under that owner |
| No-owner path | `context/GlobalContext.js:1110` | `if (!storageOwnerUid) { resolveAllReadOnly(); return; }` — the data layer already knows how to run with no owner, but only read-only |
| Secure storage | `api/aiProviderSettings.js:70` | Custom AI provider credentials are UID-scoped via `getUserSecureStorageKey` |
| Backend calls | `api/gpt.js:1202,1254,1911` | Already fail cleanly without a user: `AUTH_REQUIRED` + `errors.signInForRecipes` |
| Legacy data | `api/storageKeys.js:336` | Deliberately *deletes* unowned legacy data rather than assigning it to whoever signs in |
| Provider without an account | `context/SubscriptionContext.js:67` | `enabled={false}` is supported and yields `EMPTY_APPLE_SUBSCRIPTION` |
| Email verification | `context/EmailVerificationContext.js:45,50` | Context default is `null`; provider uses `user?.uid \|\| null`, so consumers must not render without the provider |
| Policy tests | `tests/rootStackRouting.test.js`, `tests/routeGlobalProvider.test.js` | Source-text assertions: every top-level route declared, navigator mounts only after `loading` resolves, every `GlobalContext` consumer sits under a provider |

Net effect: the wall is not just navigation. The storage layer itself cannot write without
an account, so guest access is a data-layer change with a small routing change on top.

---

## 2. Design decision

**Treat the guest as a storage owner, not as a special case.**

```js
// context/GlobalContext.js:975
const storageOwnerUid = user?.uid || guestOwnerId || null;
```

The guest owner is a device-scoped id under a reserved prefix (`guest:<uuid>`) that can
never collide with a Firebase uid. Because hydration, persistence, chat storage, purge
journals, and secure keys are all already parameterised by an owner string, everything
downstream keeps working with no per-screen special casing.

Three product decisions to confirm before coding:

| # | Decision | Recommendation |
| --- | --- | --- |
| D1 | What happens to guest data when an account is created on the same device | Prompt, then claim on confirmation. Never silent — same stance as the existing legacy-data code |
| D2 | What a guest can do | Fridge, shopping list, expiration tracking, reminders, settings, privacy, clear-data. Account required for hosted AI, sync, subscription |
| D3 | What sign-out returns to | Onboarding, as today (not back into guest mode), so a shared device never silently exposes someone else's local data |

---

## 3. Change list, in dependency order

### Phase 1 — storage foundation

Status: **landed 2026-10-16.** Files: `api/guestStoragePolicy.cjs` (new),
`api/guestStorageOwner.js` (new), `api/storageKeys.js` (two guards),
`tests/guestStoragePolicy.test.js` (new), `tests/guestStorageGuards.test.js` (new).

**1.1 `api/guestStoragePolicy.cjs`** — the pure half. `GUEST_OWNER_PREFIX = "guest:"`,
`buildGuestStorageOwnerId(deviceId)`, `isGuestStorageOwner(value)`, and
`isAccountStorageOwner(value)`. Kept in CommonJS so the Node tests can require it and so
non-UI modules can use it without loading AsyncStorage.

**1.2 `api/storageKeys.js`** — one require plus two early returns, placed before any storage
access. `migrateLegacyAsyncStorageForUser()` and `clearLegacyStorageForUser()` return
without touching disk for a guest owner. `normalizeUid()` stays strict: a guest id is a
non-empty string and passes through it unchanged, so `getUserStorageKeys()` needed no edit
at all.

**1.3 `api/guestStorageOwner.js`** — the AsyncStorage half, deliberately thin because the
Node tests cannot load it. `getGuestStorageOwnerId()` (create-once, share-promise, never
negative-cache), `isGuestModeEnabled()`, `enableGuestMode()` (id before preference),
`disableGuestMode()`, `clearGuestStorageOwner()`.

**1.4 Tests.** `guestStoragePolicy.test.js` covers the prefix, the builder, the
account/guest split, and the property that makes the whole change inert for real accounts —
a Firebase uid can never read as a guest owner. `guestStorageGuards.test.js` is a
source-text test in the style of `rootStackRouting.test.js`: it asserts both guards exist,
test the `uid` argument directly, and run *before* any storage access.

Note: `.gitignore` line 48 ignores `tests/`, so these test files run locally but are not
version-controlled — the same as every other test in the repo.

### Phase 2 — provider plumbing

**2.1 `context/GlobalContext.js`**
Resolve the owner through the guest id at line 975 (`user?.uid || guestOwnerId || null`),
add `isGuest` and `guestOwnerId` to the context value, and skip the backend username fetch
for guests (line 1729 onward), keeping `settings.user.name = "freeUser"`.
`clearAllData` needs no change: it is already owner-generic. The earlier claim that it
"reports success without touching storage" was only true when no owner existed at all,
which after Phase 2 cannot happen inside the tabs.

**2.2 `app/(tabs)/_layout.js`**
Keep the single provider chain (see C2) and thread the guest owner through it:

```jsx
const ownerId = user?.uid || guestOwnerId;

<AppleSubscriptionProvider key={ownerId} accountId={ownerId} enabled={Boolean(user)}>
  <AccountSessionProvider authUser={user ?? null}>
    <SessionBackedGlobalProvider authUser={user ?? null} guestOwnerId={guestOwnerId}>
      <GptProvider>
        <EmailVerificationProvider>
          <ThemedTabs />
```

Four edits in total:

- `if (!user) return null;` (line 620) becomes `if (!user && !isGuest) return null;`
- the subscription provider is disabled for guests. `enabled={false}` is supported and
  yields `EMPTY_APPLE_SUBSCRIPTION`, but `purchaseApplePlan` and `restoreApplePurchases`
  throw `subscriptions.iosOnly` while disabled, so the plan UI must be gated (Phase 3.3);
- `SessionBackedGlobalProvider` gains a guest branch that returns
  `GlobalProvider authUser={null} accountProfile={null} guestOwnerId={guestOwnerId}`
  directly, above the `canExposeAccountData` gate;
- that guest branch must be inserted **above** the `termsAcceptanceRequired` early return
  that in-flight terms work added to the same function. For a guest the flag is false
  anyway (there is no session), but the ordering keeps the intent explicit and survives
  future changes to the gate.

**2.3 `auth/useAuth.js`**
Add `guestOwnerId` state plus `enterGuestMode()`, `exitGuestMode()`, and `isGuest` to the
context value (built around line 1256). Leave `loggedIn` as `Boolean(user)`.

- `enterGuestMode()` delegates to `enableGuestMode()` in `api/guestStorageOwner.js`, so the
  id-before-preference ordering is enforced in one place (section 0);
- the resume read happens only when there is no Firebase user (C3), inside the existing
  loading gate, so a signed-in cold start is untouched;
- signing in calls `disableGuestMode()`, so a later sign-out returns to onboarding instead
  of silently into device data.

**2.4 `app/_layout.js`**
Guards become `!loading && (user || isGuest)` for `(tabs)` and `!loading && !user &&
!isGuest` for `(auth)`. Preserve the invariant that the navigator does not mount while
`loading` is true, and keep every top-level route declared — both are asserted by
`tests/rootStackRouting.test.js`.

### Phase 3 — entry point and per-screen gating

**3.1 `app/(auth)/onboarding.js`** — add "Continue without an account" on the last page and
allow moving back out of the carousel; call `enterGuestMode()` then `router.replace("/(tabs)")`.

**3.2 `app/(tabs)/chat.js`** — guests get a sign-in prompt in place of the composer. Reuse
the existing `errors.signInForRecipes` wording; the transport already returns `AUTH_REQUIRED`.

**3.3 `app/(tabs)/settings.js`** — hide or disable Account, Plan & Usage, and the custom AI
provider section (its SecureStore keys are UID-scoped). Show a "Sign in to sync" entry
instead. Keep appearance, notifications, expiration, privacy, and clear-data.

**3.4 Optional follow-up** — allow on-device Apple Intelligence for guests, since it is
local. This needs the provider path audited before promising it.

### Phase 4 — guest to account handoff

**4.1 New `api/guestDataClaimPolicy.cjs` + `tests/guestDataClaimPolicy.test.js`**
Pure policy: `shouldClaimGuestData({ hasGuestData, hasAccountData, confirmed })` and the
conflict rule — account wins on id collision, guest-only items append.

**4.2 Claim implementation** — on the first sign-in while the guest namespace holds data,
prompt, copy into the account namespace, then clear the guest namespace. Never silent,
matching the stance documented at `api/storageKeys.js:336`.

**4.3 Do not claim SecureStore credentials.** Secrets are intentionally excluded from
memory-style migration — see the comment on `canMigrateLegacyProviderCredentials`.

### Phase 5 — purge and deletion safety

This phase is verification plus tests, not new code, after C1.

**5.1** No guard is added inside `purgeStoredUserData()`. Verify instead that the
account-deletion call sites in `auth/useAuth.js` (lines 312, 316, 1096, 1098) only ever
receive `user.uid`, which is true today.

**5.2** `clearAllData` needs no change: it marks a purge intent and purges by owner, which is
correct for a guest. Confirm that a guest "clear local data" cannot leave a stuck intent —
the sweep at `context/GlobalContext.js:1085` retries a confirmed intent and clears it on
success.

**5.3** Decide whether "delete account and clear device data" also clears the guest
namespace, and call `clearGuestStorageOwner()` if so. Recommendation: yes, and say so in
the deletion copy.

**5.4** Decide what happens to reminders. `cancelPantrioReminders()` is device-level, so a
guest's reminders and an account's reminders cannot coexist on one device. Whatever is
chosen, test that clearing guest data does not silently cancel an account's reminders.

**5.5** Tests: guest data untouched by account deletion, account data untouched by a guest
wipe, and the guest purge path leaving no `:purgeIntent` behind.

### Phase 6 — docs and submission

**6.1** Rewrite the review notes in `docs/app-store-connect-submission.md`. They currently
open with "Pantrio requires an account because every AI request runs on our hosted service",
which becomes an inconsistency the moment guest mode ships.

**6.2** Re-check the App Privacy and Play Data safety answers, since what is collected
before sign-in changes.

**6.3** Note on the legal pages that guest data is device-local.

---

## 4. Risks and gotchas

- **Rehydration on owner switch.** The hydration effect is keyed on `storageOwnerUid` and
  guards against stale owners, so guest → account re-reads correctly. Test the transition
  explicitly rather than assuming it.
- **Legacy sweep.** Guests must not run `migrateLegacyAsyncStorageForUser`, or opening the
  app as a guest can delete data that predates the current storage scheme.
- **One guest namespace per device.** Two Firebase accounts on the same device share it.
  The claim prompt is the only bridge, and it must be explicit.
- **Reminders.** Guests can schedule local notifications; clearing guest data must cancel
  them.
- **Screens that dereference `user`.** `app/(tabs)/settings.js:515` already reads
  `loggedIn`; audit the rest before flipping the gate.
- **Existing policy tests.** `tests/rootStackRouting.test.js` and
  `tests/routeGlobalProvider.test.js` will constrain how the guards and providers are
  written. Keep them passing rather than weakening them.

---

## 5. Order and checkpoints

| Sprint | Work | Checkpoint |
| --- | --- | --- |
| 1 | 1.1–1.3 | Storage foundation lands, unit tests green, no user-visible change |
| 2 | 2.1–2.4 | App boots into guest mode and all five tabs render with no account — the riskiest change; do it on a branch |
| 3 | 3.1–3.3 | A fresh install can reach inventory and the list without an account, and chat asks for one |
| 4 | 4.x–5.x | Guest data survives registration and is cleared safely on deletion |
| 5 | 6.x | Submission copy matches the shipped behaviour |

Definition of done, by hand on a simulator: fresh install → onboarding → "Continue without
an account" → add a fridge item → force-quit and relaunch → item is still there → open Chat
→ sign-in prompt appears instead of a send button → create an account → claim prompt →
items appear inside the account → delete the account → both the account namespace and guest
namespace are gone.

---

## 6. Verified since the first draft (2026-10-16)

1. `AccountSessionProvider` accepts `authUser={null}`: `initialized = !authUser`,
   `loading = Boolean(authUser)`, and every effect guards on the uid. The provider chain
   therefore needs no guest variant.
2. `GptProvider` opens no socket on mount — `wsRef` is created lazily on send — so mounting
   it for a guest is inert.
3. `EmailVerificationProvider` guards `user.reload()` behind `!user ||
   !needsEmailVerification(user)`, and its context default is `null`, so it is safe to keep
   mounted for guests.
4. `purgeStoredUserData` is owner-generic: `clearChatData(uid)`, `deleteChatAttachments(uid)`
   (folder name via `encodeURIComponent`), and the SecureStore helpers all accept any owner
   string.
5. `storageOwnerUid` is already exported from `GlobalContext` (line 2885), so conversation
   and attachment storage follow the guest owner with no extra wiring.

## 7. Still open

1. Whether every `SubscriptionContext` consumer behaves with `EMPTY_APPLE_SUBSCRIPTION`.
   The settings screen renders plan UI unconditionally today, and while the provider is
   disabled `purchaseApplePlan` throws `subscriptions.iosOnly`.
2. Whether the on-device Apple Intelligence path is genuinely account-independent.
3. Whether any screen outside the grepped set dereferences `user` directly.
4. Whether the backend has any endpoint that would misbehave if the app runs without a
   token at all (nothing in the client should call it in guest mode, but that is a claim
   about the client, not about the server).

