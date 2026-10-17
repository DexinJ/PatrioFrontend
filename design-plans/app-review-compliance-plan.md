# App Review compliance plan — Pantrio (iOS)

Baseline audited: commit `8615c7b` plus the uncommitted working-tree changes present
on 2026-10-16. Guidelines source: App Store Review Guidelines as published on
developer.apple.com, footer "Last Updated: October 16, 2026".

Scope: the iOS app in `fridge-manager/` and the backend in `mobileSearcherBackend/`
wherever the privacy policy or review notes have to describe it.

Severity model:

- **P0** — will block submission or is the most likely cause of a rejection.
- **P1** — reviewer friction; expect a question or an information request.
- **P2** — hygiene; remove before archiving but not rejection-critical.

---

## Workstream A — in-app code changes

### A1. Third-party AI disclosure and explicit permission — P0

**Guideline:** 5.1.2(i) ("must clearly disclose where personal data will be shared
with third parties, including with third-party AI, and obtain explicit permission
before doing so"), 5.1.1(i), 5.1.1(ii).

**Current state.** Chat text and attached photos leave the device. Photos are
converted to base64 JPEG and sent as `image_url` parts
(`hooks/usePhotoCapture.js:96`, `api/gpt.js:509`). The default provider posts to the
Pantrio backend, which calls OpenAI (`mobileSearcherBackend/src/chat/openaiStream.js`),
and web search goes through a third-party search API. In-app copy exists
(`onboarding.aiDisclosure`, `chat.aiNotice`) but only says the assistant "is an AI
system" — it never says data is shared with a third party, and the provider row says
"Uses Pantrio's hosted AI service" (`locales/en.json:1119`).

**Fix.**

1. Rewrite `chat.aiNotice` and `onboarding.aiDisclosure` so they state, in plain
   language, that messages and photos the user sends are processed by Pantrio's
   servers and by a third-party AI provider, and link to the privacy policy.
2. Add a one-time acknowledgement before the first message is sent from an account:
   an inline card in the empty chat state with a "Continue" button, recorded per
   user (AsyncStorage flag next to the existing scoped keys in `api/storageKeys.js`).
   Dismissal must be recorded, not re-shown.
3. Rewrite `settings.pantrioCloudAiDetail` (and the zh equivalent) so the default
   provider names the third-party AI rather than "hosted".
4. Keep the BYO-provider copy as is; the user supplies that key and endpoint.

**Files.** `locales/en.json`, `locales/zh.json`, `app/(tabs)/chat.js`,
`components/MessageList.js` (empty state), `api/storageKeys.js`, plus the privacy
policy (workstream C).

**Verification.** Both locales render the new copy; the acknowledgement shows once
per account and never again; screenshots captured for the review notes.

### A2. Use Apple's Sign in with Apple button — P0

**Guideline:** 4.8 plus the Sign in with Apple Human Interface Guidelines.

**Current state.** Apple sign-in is a custom icon-only `Pressable` with the Ionicons
`logo-apple` glyph (`app/(auth)/sign-in.js:241`, `app/(auth)/sign-up.js:672`). The
substance of 4.8 is satisfied (Apple is offered next to Google, with Apple's sheet
handling private email relay), but Apple's guidance expects the Apple-provided button
or approved artwork with the "Continue with Apple" wording. Icon-only Apple buttons
are a known review pushback.

**Fix.**

1. Replace the Apple `Pressable` on both screens with
   `AppleAuthenticationButton` from `expo-apple-authentication`, type `SIGN_IN` (or
   `CONTINUE`), style `WHITE_OUTLINE` to sit on the current background, width matched
   to the Google control.
2. Gate rendering on `AppleAuthentication.isAvailableAsync()` instead of
   `Platform.OS === "ios"`, and keep the press handler and loading state wired to the
   existing `onApple` / `onPressApple` handlers.
3. Accept the layout consequence: the official button is not icon-only, so the auth
   row becomes stacked (Apple button, then Google). Both must stay visually
   equivalent in prominence.

**Files.** `app/(auth)/sign-in.js`, `app/(auth)/sign-up.js`.

**Verification.** Fresh device install: Apple sheet completes, account provisions,
backend link call succeeds, `auth.continueWithApple` accessibility label still
present, loading state visible.

### A3. In-app path to report an AI response — P1

**Guideline:** 1.2 (its current wording explicitly covers AI content creation apps)
and 4.7.1 if a reviewer classifies the assistant as a chatbot.

**Current state.** Support contact exists (`utils/supportContact.js`, Settings row)
but there is no way to flag an individual assistant response.

**Fix.**

1. Add "Report this response" to the existing assistant-message long-press / overflow
   menu in `components/MessageBubble.js` (the same menu that already offers copy).
2. Route it through `openSupportContact` so the build-time support form (or the
   `mailto:` fallback) receives the report. Do not attach chat content automatically;
   let the user paste it if they choose.
3. Keep the existing published contact route intact for 1.5.

**Files.** `components/MessageBubble.js`, `locales/*.json`.

**Verification.** Menu item present on assistant messages only, opens the support
destination, no crash when the support URL is unset (mailto fallback).

### A4. Stop requesting full photo-library access — P1

**Guideline:** 5.1.1(iii) (prefer the out-of-process picker over full access).

**Current state.** `hooks/usePhotoCapture.js:152` calls
`ImagePicker.requestMediaLibraryPermissionsAsync()` before
`launchImageLibraryAsync()`, so users get the full library-access prompt for an
action the system picker can serve without any permission.

**Fix.** Drop the pre-request for the library path only (keep the camera permission
request unchanged). Keep the existing denial alert for the camera path.

**Files.** `hooks/usePhotoCapture.js`.

**Verification.** On a device with photo permission never granted, "Choose from
gallery" opens the system picker with no permission dialog, and the photo still
attaches. `NSPhotoLibraryUsageDescription` stays in `app.json` because the picker
path still declares it.

### A5. User-visible diagnostics opt-out — P1

**Guideline:** 5.1.1(ii) requires an easily accessible way to withdraw consent to
collection.

**Current state.** Sentry initialises at module load with no PII, masked replay, and
a 10% error-session sample (`app/_layout.js:26`). The Privacy settings section offers
incognito, on-device reset, and clear chat, but nothing governs diagnostics.

**Fix.**

1. Add a "Share diagnostics" switch to the Privacy section in
   `app/(tabs)/settings.js` (`case "privacy"`), persisted with the other settings.
2. Move `Sentry.init` into an exported function and call it once the stored
   preference is known (the existing settings hydration path in
   `context/GlobalContext.js`), defaulting to enabled. When the user turns it off,
   call `Sentry.close()`; when turned back on, re-init.
3. Declare Diagnostics and Usage Data in App Privacy (workstream B2) so the label and
   the toggle agree.

**Files.** `app/_layout.js`, `app/(tabs)/settings.js`, `context/GlobalContext.js`,
`locales/*.json`.

**Verification.** Toggle off → no further events arrive in Sentry; cold start with the
preference off sends nothing; toggle back on restores reporting.

### A6. Age rating posture for generated content — P1

**Guideline:** 2.3.6 (honest rating) and 2.3.1(a) (accurate description of features).

**Current state.** Nothing in the app collects birthdate or age, and the assistant
can generate unrestricted text.

**Fix.** No code change required beyond A1/A3. Decide the rating deliberately
(see Open decisions), answer the questionnaire as if the assistant is a
general-purpose text generator, and describe the assistant's guardrails in the review
notes. Do not ship a low rating next to an unrestricted chat.

### A7. Remove unused surface — P2

1. `react-native-webview` is declared in `package.json` and never imported, so it is
   autolinked into the binary. Remove it, then regenerate the in-app licence list
   with `node scripts/build-licenses.cjs`.
2. Delete the unused Expo template art: `assets/images/react-logo.png`,
   `react-logo@2x.png`, `react-logo@3x.png`, `partial-react-logo.png`.
3. Decide the fate of the guest-mode helpers (`api/guestStorageOwner.js`,
   `api/guestStoragePolicy.cjs`): either wire them up (see Open decisions) or delete
   them so no unreachable feature ships.

---

## Workstream B — App Store Connect and review process

### B1. Demo account and Notes for Review — P0

The app is fully account-gated and chat requires the backend. Provide:

- An active demo account (email + password) with an entitled subscription, so the
  reviewer is not limited by the free daily token quota.
- Backend services live for the whole review window.
- Notes covering, specifically: the assistant and its providers (hosted, Apple
  Intelligence, bring-your-own-key), photo-to-AI analysis, the Private Cloud Compute
  entitlement and why PCC is preferred over the on-device model, subscription products
  and the free tier, where account deletion lives, incognito mode, the first-run
  tutorials and their sample data, and that recipe cards show AI-written summaries of
  third-party pages with a link back to the source.

### B2. App Privacy labels — P0

Map each data type to a real code path before answering:

| Data type | Source | Toggle / control |
| --- | --- | --- |
| Contact info (email, name) | Firebase Auth, `username` on the backend | account deletion |
| Purchases | StoreKit 2 through the `apple-subscriptions` module | Apple-managed |
| User content (photos, other content) | chat attachments and messages | incognito, clear chat |
| Identifiers (user ID) | Firebase uid, `appAccountToken` | account deletion |
| Diagnostics / usage | Sentry crash reports and error-session replay | A5 toggle |

Third-party AI processing of user content must be represented here, not only in the
policy.

### B3. Age rating questionnaire — P1

Answer honestly for a general-purpose assistant and align with the decision in
Open decisions.

### B4. Subscription metadata and paywall completeness — P1

**Guideline:** 3.1.2(c).

The paywall already shows plan name, `displayPrice`, period, an auto-renew footnote,
restore, and change-plan (`app/(tabs)/settings.js`, plan cards near `:2393`). Confirm:

- The Terms (EULA) and Privacy links render on the paywall itself without scrolling;
  `utils/legalLinks.js` already resolves both, with Apple's standard EULA as the
  fallback for Terms.
- Each subscription's localized description in App Store Connect states what the user
  gets per period.
- All configured products are reachable and functional in the submitted build, and
  any product the reviewer cannot reach is explained in the notes.

### B5. Privacy policy URL field — P0

The App Store Connect metadata field must be populated with the same URL the app uses
(`EXPO_PUBLIC_PRIVACY_POLICY_URL`), and the page must satisfy workstream C.

### B6. Screenshots and previews — P1

Screenshots must show the app in use rather than title art or login
(`2.3.3`). Capture real screens: the fridge list, the chat with a recipe card, and the
subscription screen.

---

## Workstream C — hosted privacy policy text

The policy is the artifact Apple reads when 5.1 is questioned. It must:

1. Identify what is collected and why: email/username, chat messages, attached photos,
   inventory and shopping-list entries, subscription state, diagnostics.
2. **Name the processors** — the third-party AI provider, the web-search provider,
   Firebase/Google for auth, Sentry for diagnostics — and confirm each provides equal
   protection.
3. State retention per category, including that chat history is stored **on the
   device** only. The backend does not write conversations or messages: the tables in
   `src/db/schema.sql` are legacy and no current code inserts into them. Do not let
   the policy claim server-side chat storage. Server-side retention is: the user row,
   daily usage counters, Apple subscription/transaction records, and the encrypted
   Sign in with Apple credential — all removed on deletion.
4. Describe withdrawal and deletion: in-app Settings → Delete Account, plus the
   support route for people who cannot sign in (`utils/supportContact.js`).
5. Cover incognito mode, children's data, and international transfers.

---

## Workstream D — entitlement, infrastructure, archive checks

### D1. Private Cloud Compute entitlement — P0

`plugins/withPrivateCloudComputeEntitlement.js` injects
`com.apple.developer.private-cloud-compute` into every iOS build. It is a managed
entitlement granted per team; without the grant the build fails at code signing.

1. Confirm the App ID for `com.chilltech.pantrio` has the entitlement provisioned. If
   not, request it from Apple before archiving.
2. Make the plugin conditional on an env flag so a build can be produced before the
   grant lands, and so the entitlement is only requested when PCC is actually wanted.
3. Explain the entitlement and its use in the review notes.

### D2. IPv6-only reachability — P1

`2.5.5` requires the app to work on IPv6-only networks. Verify the API and WebSocket
hosts resolve and connect over IPv6 (production URLs are already enforced to `https:`
and `wss:` in `api/backendConfig.js`).

### D3. Privacy manifests at archive time — P2

Only eight pods in `node_modules` ship a `PrivacyInfo.xcprivacy` locally. Sentry's and
Google's manifests normally arrive with their CocoaPods dependencies at pod-install
time, so this is likely fine. Treat the App Store Connect validation email
(ITMS-91053 / ITMS-91056) as the authority after the first archive rather than
assuming either way.

### D4. Over-the-air update policy — P2

`expo-updates` may ship JS-level fixes only. No OTA update may add or change native
functionality, entitlements, or the app's core feature set (`2.5.2`).

---

## Sequencing

**Phase 1 — before the first submission.** A1, A2, A4, A5, C1–C5, B1, B2, B5, D1.
These are the items that can independently cause a rejection.

**Phase 2 — same release, if time allows.** A3, A6, B3, B4, B6, D2. These convert
likely questions into prepared answers.

**Phase 3 — cleanup before archiving.** A7, D3, D4.

## Verification and definition of done

Run from `fridge-manager/`:

```
npm run lint
npm run test:unit
node scripts/check-i18n-keys.cjs      # en/zh key parity after copy changes
npm run config:check                  # build-config validation
node scripts/build-licenses.cjs       # after the dependency removal in A7
```

Then, on device: fresh install → onboarding and the new AI disclosure → sign up with
Apple and with Google → first chat with text and a photo → report a response →
subscription purchase, restore, and cancel → notification permission from Settings →
incognito on and off → delete account and confirm the account cannot be recreated
from a cached session. Finish with a TestFlight build and read the App Store
Connect validation email.

## Open decisions (blocking the corresponding items)

1. **Vendor naming.** Name the AI provider explicitly in-app (A1), or describe it as
   "a third-party AI provider"? Naming is the safer read of 5.1.2(i).
2. **Consent mechanism.** One-time acknowledgement before the first send (A1), or
   disclosure plus policy only? The acknowledgement is the stronger evidence of
   "explicit permission".
3. **Age rating.** 12+ or 17+ for an unrestricted assistant? Drives B3.
4. **Account requirement.** Keep login required and justify it (server-side quota,
   sync, subscription), or enable the guest path that already exists in code? Drives
   5.1.1(v) exposure and A7.
5. **Auth layout.** Accept the stacked Apple/Google auth buttons that
   `AppleAuthenticationButton` requires (A2)?

## Accepted residual risk

Recipe cards summarise third-party pages rather than reproducing them: robots.txt is
honoured, private address space is blocked, the publisher's prose is never rendered or
persisted, summaries pass a verbatim-overlap guard, and every card links to the
source. The guard only catches verbatim reuse, so this design should be stated plainly
in the review notes rather than left for a reviewer to discover.
