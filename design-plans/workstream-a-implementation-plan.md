# Workstream A implementation plan — in-app changes

Parent document: `design-plans/app-review-compliance-plan.md`.

Inputs assumed complete elsewhere: workstream C (hosted privacy policy text) and
workstream D (entitlement, infrastructure, archive checks) are done; workstream B
(App Store Connect) is handled by the product owner.

This document is the build order for A1–A7, with exact files, copy keys, tests, and
verification. Every user-visible string lands in `locales/en.json` **and**
`locales/zh.json`; `node scripts/check-i18n-keys.cjs` is the gate for that.

## Decisions this plan assumes

The parent plan left five decisions open. Four of them touch workstream A, so this
plan picks the safer reading of each and states the delta if the decision flips.

| # | Decision | Assumed here | Delta if flipped |
| --- | --- | --- | --- |
| 1 | Vendor naming | Name the third-party AI provider explicitly in the consent card and provider row | Replace the vendor name with "a third-party AI provider" in three strings; nothing else changes |
| 2 | Consent mechanism | One-time blocking acknowledgement before the first message, per account | Drop the gate, keep a persistent notice; weaker evidence of "explicit permission" |
| 3 | Account requirement | Unchanged: login required, justified in the review notes (server-side quota, sync, subscription) | Wire the existing guest helpers into onboarding; out of scope for A |
| 4 | Auth layout | Auth screens become stacked, full-width buttons | Keep the icon row and accept the HIG risk on the Apple button |

Decision 5 (age rating) is workstream B and has no code impact beyond A1/A3 wording.

## Build order

1. **A4** — one-line removal, ships independently.
2. **A1** — largest user-visible change; every later step is unaffected by it.
3. **A2** — needs a native build to verify; can be developed in parallel with A1.
4. **A5** — refactors app startup; touched last of the P0/P1 set so it can be
   device-tested with everything else in place.
5. **A3** — additive UI on an existing menu.
6. **A7** — cleanup, must be last so dependency removal happens against final code.

A1, A4, and A5 verify in a dev build. A2 needs a device build (`expo run:ios` or an
EAS build) because the native button does not exist in Expo Go.

---

## A1. Third-party AI disclosure and explicit consent

**Goal.** Before an account's first message, the user is told in plain language that
messages and photos are processed by Pantrio's servers and a third-party AI
provider, and the app records that they agreed.

### A1.1 New pure policy helper (testable, matches repo convention)

The repo keeps decision logic in pure CommonJS modules so the Node test runner can
load them (`guestStoragePolicy.cjs`, `termsAcceptancePolicy.cjs`,
`accountDeletionPolicy.cjs`). Follow that.

New file `utils/aiDisclosurePolicy.cjs`:

```js
const AI_DISCLOSURE_SETTINGS_VERSION = 1;

function isAiDisclosureAcknowledged(settings) {
  const chat = settings && typeof settings === "object" ? settings.chat : null;
  const record = chat && typeof chat === "object" ? chat : {};
  return record.aiDisclosureAcknowledged === true &&
    record.aiDisclosureVersion === AI_DISCLOSURE_SETTINGS_VERSION;
}

function needsAiDisclosure(settings) {
  return !isAiDisclosureAcknowledged(settings);
}

module.exports = {
  AI_DISCLOSURE_SETTINGS_VERSION,
  isAiDisclosureAcknowledged,
  needsAiDisclosure,
};
```

The `=== true` plus version check means a future wording change can re-ask by bumping
the constant, and malformed stored settings fail closed (ask again) rather than
silently skipping consent.

New file `tests/aiDisclosurePolicy.test.js` covering: missing settings, empty object,
`true` with the wrong version, `"true"` as a string, and the acknowledged case.

### A1.2 Settings defaults and merge

- `context/GlobalContext.js` `defaultSettings()`: extend the `chat` block (`~:352`) to
  `chat: { chatgptStyle: false, aiDisclosureAcknowledged: false, aiDisclosureVersion: 0 }`.
- `mergeStoredSettings()` (`~:244`): add an explicit `chat` merge alongside `privacy`
  and `expiration`:

  ```js
  const storedChat = isPlainRecord(parsedSettings.chat) ? parsedSettings.chat : {};
  // ...
  chat: { ...previousSettings.chat, ...storedChat },
  ```

  Without this, the blanket `...parsedSettings` spread lets an older stored `chat`
  object drop the new keys. The read path already fails closed, but the merge keeps
  defaults intact and prevents future drift.

### A1.3 Consent card component

New file `components/AiDataConsentCard.js`:

- Props: `onAcknowledge`, `theme`, `fontSize`.
- Renders a card inside the empty chat state: title, body, a primary "Continue"
  button, and an inline privacy-policy link using `openLegalUrl(PRIVACY_POLICY_URL)`
  from `utils/legalLinks.js`.
- Accessibility: `accessibilityRole="button"` on the primary action, body text as
  static text, card announced as a group.
- No timers and no auto-advance; the user must tap.

### A1.4 Wire it into the chat screen

`app/(tabs)/chat.js`:

1. Destructure `updateSetting` from `GlobalContext` in `ChatScreen` (`~:180`). It is
   exposed today at `context/GlobalContext.js:2849` (state) and `:2919` (actions).
2. Compute `const aiDisclosureAcknowledged = isAiDisclosureAcknowledged(settings)`.
3. `ChatEmptyState` (`:98`): when not acknowledged, render `<AiDataConsentCard />` in
   place of the suggestion chips and the `chat.aiNotice` line. When acknowledged,
   render exactly what ships today. Never show both.
4. Acknowledge handler:

   ```js
   const acknowledgeAiDisclosure = useCallback(() => {
     updateSetting("chat", "aiDisclosureAcknowledged", true);
     updateSetting("chat", "aiDisclosureVersion", AI_DISCLOSURE_SETTINGS_VERSION);
   }, [updateSetting]);
   ```

5. **Gate every send path**, not just the chips: the composer's send handler, the
   suggestion handler, and `handleSendImage` / `usePhotoCapture`'s `onCapture` all
   early-return (or show the card) while `needsAiDisclosure(settings)` is true. The
   chips are hidden in the unacknowledged state, but the attach button and a restored
   draft could otherwise bypass the gate.

### A1.5 Copy

Add or rewrite in `locales/en.json` and `locales/zh.json`:

| Key | Purpose |
| --- | --- |
| `chat.aiConsentTitle` | Short heading, e.g. "Before you chat" |
| `chat.aiConsentBody` | The disclosure: the assistant is AI; messages and photos are sent to Pantrio's servers and processed by a third-party AI provider (OpenAI) to generate answers; answers can be wrong and are not food-safety advice; link to the privacy policy |
| `chat.aiConsentAccept` | "Continue" |
| `chat.aiNotice` | Rewrite: keep the "AI, can be wrong, not food-safety advice" line and add that messages are processed by a third-party AI provider |
| `onboarding.aiDisclosure` | Same substance as `chat.aiConsentBody`, shorter |
| `settings.pantrioCloudAiDetail` | Replace "Uses Pantrio's hosted AI service" with wording that names the provider |

Existing keys keep their names, so no call sites change beyond the additions.

### A1.6 Verification

- Fresh account: opening Chat shows the consent card and no chips; sending is
  impossible until Continue is tapped; after Continue the chips and the normal empty
  state return.
- Kill and relaunch: the card does not return.
- Second account on the same device: the card returns (per-account, not per-device).
- Account deletion and re-signup: the card returns (settings are purged with the
  account).
- `npm run test:unit` passes with the new test file.

---

## A2. Apple's Sign in with Apple button

**Goal.** Replace the icon-only Apple control with `AppleAuthenticationButton`, so the
button is Apple-approved by construction.

### A2.1 Shared component

New file `components/AppleSignInButton.js`:

```jsx
import * as AppleAuthentication from "expo-apple-authentication";

export default function AppleSignInButton({ onPress, disabled, style }) {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    let active = true;
    AppleAuthentication.isAvailableAsync().then((value) => {
      if (active) setAvailable(value);
    });
    return () => { active = false; };
  }, []);

  if (!available) return null;
  return (
    <AppleAuthentication.AppleAuthenticationButton
      buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
      buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE_OUTLINE}
      cornerRadius={12}
      style={[{ width: "100%", height: 50, opacity: disabled ? 0.5 : 1 }, style]}
      onPress={disabled ? () => {} : onPress}
    />
  );
}
```

Confirmed against the installed `expo-apple-authentication` (~57.0.1):
`AppleAuthenticationButtonType.CONTINUE = 1` and `SIGN_IN = 0`;
`AppleAuthenticationButtonStyle.WHITE_OUTLINE = 1`. Height and width **must** come from
`style` or the button renders invisible, and `style` must not carry `backgroundColor`
or `borderRadius` — the module documents both restrictions and enforces them natively.

### A2.2 Screen changes

- `app/(auth)/sign-in.js`: replace the `Platform.OS === "ios"` Pressable block
  (`~:241-263`) with `<AppleSignInButton onPress={onApple} disabled={isBusy} />`. Use
  `CONTINUE` here, or `SIGN_IN`; pick one and use the same type on both screens.
- `app/(auth)/sign-up.js`: same replacement for the block at `~:660-690`.
- Restyle both auth button areas into a stack: the Apple button full width, and the
  Google control promoted from a square icon button to a full-width labeled button
  with the same height, corner radius, and typography. Two stacked buttons of equal
  size is the cleanest reading of 4.8's "equivalent option".
- Keep `AppleAuthentication.isAvailableAsync()` as the availability gate and drop the
  `Platform.OS === "ios"` check it replaces: the module reports false on Android, so
  the component renders nothing there.
- Keep the existing loading state: show the spinner beside or over the button and
  disable presses while `isBusy`.

### A2.3 Verification

- Device, iOS 26: the button shows Apple's own styling, localized text, and
  "Continue with Apple" wording; tapping completes the sheet and provisions an account.
- Verify VoiceOver announces the button. The native button supplies its own label; if
  it does not, wrap it in a `View` with `accessible` and
  `accessibilityLabel={t("auth.continueWithApple")}`.
- Android build: the component returns `null` and the layout leaves no gap.
- Screenshot the sign-in screen for the review notes.

---

## A3. Report an assistant response

**Goal.** Give 1.2 — and 4.7.1 if a reviewer classifies the assistant as a chatbot — a
concrete in-app reporting path.

### A3.1 Mechanism

The transcript already supports multi-select: a long press enters select mode
(`components/MessageBubble.js:208` → `openSelectMode`), and
`components/SelectionActionBar.js` renders a bottom bar with an `actions` array (same
shape as `ActionGridPopover` actions).

1. In `app/(tabs)/chat.js`, wherever `SelectionActionBar` is rendered for the
   transcript, add an action:

   ```js
   {
     id: "report",
     labelKey: "selectionBar.report",
     icon: "flag-outline",
     onSelect: () =>
       void openSupportContact({
         title: t("selectionBar.reportTitle"),
         failureMessage: t("selectionBar.reportFailed"),
       }),
   }
   ```

   Offer it only when at least one selected message is from the assistant
   (`message.role === "assistant"`), so a report never targets the user's own text.
2. Confirm at implementation time how the actions array is currently wired for
   messages; if the bar is action-less today, this is its first entry.
3. No chat content is attached automatically. The support form asks the user to paste
   the response if they want to, which keeps a report from transmitting chat content
   without an explicit user action.

### A3.2 Copy

`selectionBar.report`, `selectionBar.reportTitle`, `selectionBar.reportFailed` in both
locales.

### A3.3 Verification

Long press an assistant message → the bar offers Report → tapping opens the support
form, or the `mailto:` fallback when `EXPO_PUBLIC_SUPPORT_FORM_URL` is unset. User
messages do not offer it.

---

## A4. Stop requesting full photo-library access

`hooks/usePhotoCapture.js`:

- `pickPhoto` (`~:147-158`) becomes a direct call, passing a no-op permission request
  so `captureFromLibrary` stays unchanged:

  ```js
  const pickPhoto = () =>
    captureFromLibrary({
      requestPermission: async () => ({ status: "granted" }),
      permissionTitle: t("plusMenu.photoPermissionTitle"),
      permissionMessage: t("plusMenu.photoPermissionMessage"),
      pick: () =>
        ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7 }),
      failureMessage: t("plusMenu.imagePrepFailed"),
    });
  ```

- The camera path (`takePhoto`) keeps calling
  `ImagePicker.requestCameraPermissionsAsync()` exactly as it does now.
- Keep `NSPhotoLibraryUsageDescription` in `app.json`: the picker path still declares
  it, and iOS still records the string in the built Info.plist.
- Leave the `plusMenu.photoPermission*` strings in place. They are unused on iOS now,
  but harmless if the library path ever needs a real prompt again.

**Verification.** On a device where photo permission was never granted, "Choose from
gallery" opens the system picker with no permission dialog and the photo still
attaches. With camera permission denied, "Take a photo" still shows the existing
alert.

---

## A5. User-visible diagnostics opt-out

**Goal.** 5.1.1(ii): the user can withdraw consent to diagnostics collection, and the
choice survives relaunch.

### A5.1 Why device-level storage

The Sentry decision has to be known before the account is resolved (cold start), and
it must not be deleted along with an account. An account-scoped key inside
`getUserStorageKeys(uid)` cannot be read before `uid` exists, so the switch stores one
device-level AsyncStorage key, separate from the per-user `appSettings` blob.

### A5.2 New module `utils/diagnostics.js`

Moves the existing configuration out of `app/_layout.js` verbatim and adds control:

```js
const DIAGNOSTICS_KEY = "@pantrio:diagnosticsEnabled:v1";
let initialized = false;

export function initDiagnostics() { /* the current Sentry.init config */ }
export async function isDiagnosticsEnabled() { /* read key, default true */ }
export async function initDiagnosticsIfEnabled() { /* read, then init once */ }
export async function setDiagnosticsEnabled(enabled) {
  // write the key, then enabled ? initDiagnostics() : Sentry.close()
}
```

Configuration carried over unchanged: `dsn`, `environment`, `sendDefaultPii: false`,
`enableLogs: false`, `replaysSessionSampleRate: 0`,
`replaysOnErrorSampleRate: __DEV__ ? 0 : 0.1`, the `mobileReplayIntegration` masks
(`maskAllText`, `maskAllImages`, `maskAllVectors`), and the `beforeSend` header and PII
scrubbing including the `event.user.id`-only rule.

`Sentry.close()` is exported by the installed SDK (`@sentry/react-native` 7.11
re-exports `close`), so turning the switch off takes effect immediately without a
relaunch.

### A5.3 `app/_layout.js`

- Delete the module-scope `Sentry.init` block (`:26-66`) and import
  `initDiagnosticsIfEnabled` from `utils/diagnostics`.
- Call `void initDiagnosticsIfEnabled()` inside the existing mount effect (`:317-337`,
  the one that restores the language), so it runs once per launch after the stored
  preference is read.
- Keep `Sentry.wrap` and `Sentry.ErrorBoundary`. Wrap is a HOC that tolerates a
  not-yet-initialized client; if it warns in practice, replace `Sentry.wrap(Layout)`
  with the plain `Layout` component, since the error boundary still catches render
  errors and keeps the existing fallback.
- Leave `setAuthEmailSendReporter` as is; auth email failures only occur after init.

**Accepted trade-off.** Events from the first moments of a cold start are no longer
captured, because init now waits for the stored preference. That is the price of a real
opt-out, and it is worth stating in the review notes if asked.

### A5.4 Settings switch

In `app/(tabs)/settings.js`, `case "privacy"` (`~:3300`): add a row styled exactly like
the Incognito row — title, help text, `Switch` — with local state hydrated in an
effect:

```js
const [diagnosticsEnabled, setDiagnosticsEnabledState] = useState(true);
useEffect(() => {
  let active = true;
  isDiagnosticsEnabled().then((value) => {
    if (active) setDiagnosticsEnabledState(value);
  });
  return () => { active = false; };
}, []);
```

`onValueChange` sets local state and calls `setDiagnosticsEnabled(next)`.

### A5.5 Copy

`settings.diagnosticsTitle` ("Share diagnostics") and `settings.diagnosticsBody`
(what is sent: crash reports plus a screen recording of sessions that error, with text,
images, and vectors masked; never chat content and never photos; how to turn it off),
in both locales.

### A5.6 Verification

- Toggle off, force an error from a known failing path, and confirm no event reaches
  Sentry; toggle on and confirm events resume without a relaunch.
- Cold start with the preference off sends nothing.
- The App Privacy answers in workstream B must declare Diagnostics and Usage Data, so
  the label, the policy, and this switch agree.

---

## A6. Age-rating posture

No code. Workstream A only guarantees the wording that supports an honest rating: the
consent card and the chat notice state that answers are AI-generated and can be wrong,
and the report action exists. The rating decision itself is item B3.

---

## A7. Cleanup

1. **`react-native-webview`** — declared in `package.json`, never imported, but
   autolinked into the binary. Remove the entry, run `npm install` to refresh
   `package-lock.json`, then `node scripts/build-licenses.cjs` and confirm the entry is
   gone from `assets/legal/licenses.json`. After the next prebuild, confirm
   `react-native-webview.podspec` no longer appears under `ios/Pods`.
2. **Expo template art** — delete `assets/images/react-logo.png`,
   `react-logo@2x.png`, `react-logo@3x.png`, and `partial-react-logo.png` after
   `rg "react-logo|partial-react-logo"` confirms there are no references.
3. **Guest-mode helpers** (`api/guestStorageOwner.js`, `api/guestStoragePolicy.cjs`) —
   leave them. Metro bundles only referenced modules, so unreferenced code does not
   ship, and `api/storageKeys.js` imports `isGuestStorageOwner` from the policy module
   as part of its migration rules, so deleting it is riskier than the benefit. Revisit
   only if decision 3 flips to "enable guest mode".

---

## Test and verification plan

From `fridge-manager/`:

```
npm run lint
npm run test:unit                    # includes the new tests/aiDisclosurePolicy.test.js
node scripts/check-i18n-keys.cjs     # en/zh key parity after the copy changes
npm run config:check                 # build-config validation
node scripts/build-licenses.cjs      # after A7
```

Device pass on iOS 26 from a fresh install:

1. Onboarding → the consent card appears on the first Chat open; sending is blocked
   until Continue; the card never returns afterwards.
2. Sign up with Apple through the native button, then separately with Google; both
   provision.
3. Send text and a photo; the photo attach never triggers a library permission dialog;
   the camera path still prompts once.
4. Report an assistant response from the selection bar; the support destination opens.
5. Toggle diagnostics off and on and verify the Sentry behaviour above.
6. Delete the account, re-create it, and confirm the consent card returns and chat
   storage is empty.

## Rollback notes

- A1 is the only change that alters a user flow (one extra tap before the first
  message). If it must be softened, keep the card but stop gating the send: the
  disclosure stays, the explicit-permission evidence weakens.
- A2, A5, and A7 are independent of each other and of A1; any one can be reverted
  alone.
- A5 is the only change that touches startup. Its revert is restoring the module-scope
  `Sentry.init`; in that case the diagnostics switch in Settings must be removed in the
  same commit, or it will lie to the user.
