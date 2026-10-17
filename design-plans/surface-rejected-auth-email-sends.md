# Surface rejected auth email sends (verification, resend, email change, password reset)

Written against: `8615c7b` (the working tree already contains unrelated uncommitted edits to `app/(auth)/sign-up.js`, `context/EmailVerificationContext.js`, `app/_layout.js`, `locales/en.json`, `locales/zh.json`, `api/gpt.js`, `app/(tabs)/chat.js`, `components/MessageList.js`, `utils/chatStoragePolicy.js`, and others — build on the working tree, not on `HEAD`)

## Evidence chain

- Problem: several auth email sends discard the rejection, so a refused request is indistinguishable from a delivered one.
  - `app/(auth)/sign-up.js:269` — `await sendEmailVerification(cred.user).catch(() => {});` throws the error away entirely. The account is created, provisioning completes, and the user is told nothing.
  - `context/EmailVerificationContext.js:141-176` — `sendVerification` does surface an error through `describeError` (`:64-69`), but the fallback is `nextError?.message || t("common.unknownError")`, so an unmapped code renders as raw SDK English or a message with no code attached.
  - `app/(auth)/forgot-password.js:63-84` — `sendPasswordResetEmail` masks more than intended. `:67` handles `auth/too-many-requests` and `:71` handles `auth/network-request-failed`/no code, but the `else` at `:76-82` converts **every other** rejection into the success confirmation at `:81`. `auth/operation-not-allowed`, `auth/invalid-api-key`, and `auth/quota-exceeded` therefore report "we sent you a link" when nothing was sent.
- The email-change path is not the silent one. `auth/emailChange.js:11-24` → `verifyBeforeUpdateEmail` throws to `context/EmailVerificationContext.js:195`, whose `catch` at `:202-209` sets the password latch and calls `describeError`. A rejected change is already displayed; only its code is missing.
- There is no durable record. `@sentry/react-native` is initialised at `app/_layout.js:25` (with `ErrorBoundary` at `:337` and `beforeSend` at `:49`), but nothing in `auth/`, `context/`, or `app/(auth)/` ever calls `Sentry.captureException`. A user who taps past an error leaves no trace.
- The recovery affordance already exists, so this is a visibility problem, not a new-flow problem. The sign-up path sets `requestEmailVerificationPrompt(cred.user.uid)` (`app/(auth)/sign-up.js:270-272`) whenever `needsEmailVerification` is true — independent of whether the send succeeded — and the prompt it opens carries the "Resend link" action (`components/EmailVerificationPrompt.js:66-68`, `:134-149`).
- Design evidence:
  - `api/emailVerificationStorage.js:20-32`: the prompt request is deliberately memory-only and uid-scoped, consumed at most once. It is the established channel for "something happened at sign-in that the signed-in screen should mention".
  - `context/EmailVerificationContext.js:118-133`: the consumer side — snooze check first, then `takeEmailVerificationPromptRequest`, then `setPromptVisible(true)`.
  - `components/EmailVerificationPrompt.js:104-149`: the nudge already renders an `accessibilityRole="alert"` error line (`:122-129`) above the resend action, and a separate "sent again" note (`:116-121`).
  - `auth/useAuth.js:802-815` + `app/_layout.js:255-275`: `queuePostAuthNotice` → durable store → `Alert.alert` after provisioning, gated on `audienceUid` matching the signed-in user. This is how the verified-confirmation notice is already delivered (`context/EmailVerificationContext.js:88-95`).
  - `app/(tabs)/settings.js:1846-1866`: the email status row with the "not verified" body and the `openVerificationPrompt` action — the only persistent, revisit-anytime surface for email state.
  - `auth/authErrorMessages.js:1-40`: one map from Firebase code to catalog key, plus `authErrorMessageKey` and the non-component `authErrorMessage`. The header comment warns that `scripts/check-i18n-keys.cjs` scans **comments as well as code** for literal quoted translation calls, so this file's prose must not contain that pattern.
- Owner: `app/(auth)/sign-up.js` (swallowed sign-up send), `context/EmailVerificationContext.js` (resend + email change error copy), `app/(auth)/forgot-password.js` (over-broad masking), `auth/authErrorMessages.js` (code → copy), `api/emailVerificationStorage.js` (carrying the failure to the prompt).
- Scope and affected surfaces: sign-up, the verification nudge/resend, the email-change form, forgot-password, the Settings email row, EN and ZH strings, and the Sentry event stream.
- Uncertainty: none for surfacing. The plan deliberately cannot observe a **successful** send that is later dropped or spam-foldered — `verifyBeforeUpdateEmail` and `sendEmailVerification` resolving only means Firebase queued the message. That limits what any client-side change can promise (see Exclude).

### Verified against the working tree

- `sendEmailVerification` has exactly two call sites: `app/(auth)/sign-up.js:269` and `context/EmailVerificationContext.js:161`. `sendPasswordResetEmail` has one, `app/(auth)/forgot-password.js:63`. `verifyBeforeUpdateEmail` has one module, `auth/emailChange.js`, called twice inside it.
- Every caller that wants a message today reaches the same map: `authErrorMessageKey` at `app/(auth)/sign-up.js:303`, `app/(auth)/sign-in.js:75`, `context/EmailVerificationContext.js:64`. `authErrorMessage` (the non-component variant) currently has no caller at all, so it is free to become the shared entry point.
- `app/(auth)/sign-in.js:71` requests the prompt but never sends mail, so it needs no send-failure plumbing; it inherits whatever the prompt does.
- The prompt request is consumed in exactly one place, `context/EmailVerificationContext.js:127`, so changing `takeEmailVerificationPromptRequest`'s return shape touches one call site.
- `EMAIL_VERIFICATION_RESEND_COOLDOWN_MS` (`utils/emailVerificationPolicy.js:12`) is already shared by the prompt and forgot-password, so the two surfaces throttle identically today. No new constant is needed.
- `tests/authErrorMessages.test.js` exists and already asserts the code→key map, so it is the natural home for new mappings. `scripts/check-i18n-keys.cjs` scans `app`, `components`, `context`, `utils`, `api`, `auth`, `i18n` for literal `t()`/`i18next.t()` calls and fails when a key is missing from `locales/en.json`.
- `npm test` = `node scripts/run-unit-tests.cjs`; `npm run lint` = `expo lint` (`package.json` scripts). No test currently exercises any auth email send path.

## Intended behavior change

Today a refused send is either invisible (sign-up), unattributable (resend, email change), or misreported as success (forgot-password, for operational failures). After this change every refused send produces (a) localized, code-bearing copy on the surface that triggered it, (b) a durable Sentry event carrying the Firebase code and the scope, and (c) no change to the enumeration-protection posture — identity-shaped rejections stay masked.

This is a diagnostics change with one deliberate product consequence: the success copy stops asserting delivery. "Sent again to {{email}}." becomes a request statement, because the client cannot know that a queued message arrived.

## Design decision

Route every send through one pure-ish helper, and give each surface the failure in the way that surface already speaks.

1. **One wrapper decides everything about a rejection.** A new `utils/authEmailSend.js` owns the try/catch, extracts `error.code`, maps it, and reports to Sentry. Callers stop hand-rolling `.catch(() => {})`.
2. **The sign-up failure rides the prompt request.** Sign-up is inside the `(auth)` stack; `EmailVerificationProvider` and the prompt mount only under `app/(tabs)/_layout.js:613`, and `app/_layout.js:275` renders post-auth notices with an `Alert`. Rather than an alert on top of account creation, carry the rejected code in the same memory-only payload that already asks the prompt to appear, and let the prompt show it in the error slot it already has. The user sees one screen, in context, with the resend action underneath.
3. **The code is a development detail, the message is the product.** Mapped codes render their localized copy. Unmapped codes render one generic localized line, with `(auth/…)` appended only when `__DEV__`. Sentry always gets the raw code, so production keeps the diagnostic without showing users SDK strings.
4. **Masking becomes an allowlist, not a default.** Forgot-password keeps hiding the codes that reveal whether an account exists, and surfaces the ones that mean the request never left — an operation failure is not an enumeration signal.

Rejected alternatives: a global toast/banner component (nothing in the app renders one today; `SectionHeaderPill` is label-only and `Alert` is the established mechanism), and a blocking `Alert` on sign-up (interrupts provisioning for a recoverable, non-blocking condition).

## Reuse

- `auth/authErrorMessages.js` — `AUTH_ERROR_MESSAGE_KEYS`, `authErrorMessageKey`, and the currently-unused `authErrorMessage`. No parallel error-copy path.
- `api/emailVerificationStorage.js:20-32` — the memory-only, uid-scoped prompt request; extended, not duplicated.
- `context/EmailVerificationContext.js:141-176` — the existing `busy` / `setError` / cooldown states and the "Resend link" action.
- `components/EmailVerificationPrompt.js:122-129` — the `accessibilityRole="alert"` error line already in the nudge.
- `auth/useAuth.js:802-815` + `app/_layout.js:255-275` — `queuePostAuthNotice` for any failure that must outlive the screen.
- `app/(tabs)/settings.js:1846-1866` — the email row and its `openVerificationPrompt` action.
- `utils/emailVerificationPolicy.js:12` — the shared resend cooldown.
- Sentry is already initialised (`app/_layout.js:25`); only `captureException` calls are new.

## Changes

1. `utils/authEmailSend.js` (new)
   - Change: export `attemptAuthEmailSend({ scope, send })` returning `{ ok: true }` or `{ ok: false, code, messageKey }`. It awaits `send()`, and on rejection resolves `code` from `error.code` (trimmed, or `null`), `messageKey` from `authErrorMessageKey`, and reports `Sentry.captureException(error, { tags: { scope } })` in a `catch` that can never rethrow. `scope` is one of `"sign-up-verify" | "resend-verify" | "email-change" | "password-reset"`, so events are filterable.
   - Preserve: it never throws, never swallows silently (every rejection reaches Sentry), and never mutates the error.
   - Verify: `tests/authEmailSend.test.js` — resolves `ok: true` on success; resolves `ok: false` with the exact code on rejection; a throwing `send` and a rejection with no `code` both produce `code: null`; Sentry is called once and its own throw is contained.

2. `auth/authErrorMessages.js`
   - Change: add map entries for the operational codes that currently have none and are plausible for out-of-band sends — `auth/quota-exceeded`, `auth/internal-error`, `auth/invalid-api-key`, `auth/user-token-expired`, `auth/network-request-failed` (exists), `auth/operation-not-allowed` (exists). Add `AUTH_EMAIL_SEND_FAILED_KEY = "auth.errorEmailSendFailed"` as the unmapped fallback, and `formatAuthErrorMessageKey(messageKey, code)` returning the key plus a `(code)` suffix only when `__DEV__`.
   - Preserve: the existing code→key values verbatim (the file's own comment explains that identity codes intentionally collapse into `auth/invalid-credential`), and the comment-scanning constraint — do not write a literal quoted translation call anywhere in this file, including comments.
   - Verify: `tests/authErrorMessages.test.js` extended with the new codes, the fallback key, and the dev-only suffix.

3. `api/emailVerificationStorage.js`
   - Change: widen the memory-only request to carry a failure. `requestEmailVerificationPrompt(uid, { sendErrorCode } = {})` stores the trimmed code alongside `pendingPromptUid`; `takeEmailVerificationPromptRequest(uid)` returns `null` when there is nothing to take and `{ sendErrorCode }` when there is. `clearEmailVerificationPromptRequest` clears both.
   - Preserve: memory-only lifetime, uid matching, at-most-once consumption, and the deliberate absence of any cold-launch replay.
   - Verify: taking for a different uid still returns `null`; taking twice returns the payload once; a `null` code round-trips as `null`.

4. `app/(auth)/sign-up.js`
   - Change: replace `await sendEmailVerification(cred.user).catch(() => {});` (`:269`) with `attemptAuthEmailSend({ scope: "sign-up-verify", send: () => sendEmailVerification(cred.user) })`, then pass the result into `requestEmailVerificationPrompt(cred.user.uid, { sendErrorCode: result.ok ? null : result.code })` at `:270-272`. The existing `clearEmailVerificationPromptRequest` on the rollback path (`:281-283`) still clears everything.
   - Preserve: the send stays non-blocking — a rejected verification email must never fail account creation — and the rollback/`deleteUser` path is untouched.
   - Verify: a rejected send still completes sign-up, the account is not deleted, and the prompt opens with the error line populated.

5. `context/EmailVerificationContext.js`
   - Change: in the prompt-request effect (`:118-133`), consume the returned payload instead of a bare boolean and seed the error state from `sendErrorCode` via the new formatter. Add `const result = await attemptAuthEmailSend({ scope: "resend-verify", send: () => sendEmailVerification(user) })` in `sendVerification` (`:159-165`) and set the error from `result.code` when `!result.ok`. Extend the context value with `lastSendErrorCode` so Settings can display it.
   - Preserve: the 60s cooldown and its countdown copy, the `busy` guard, the mounted-ref guard around `setState`, the per-uid reset on account switch (`:67-78`), and the rule that a successful resend never clears `promptVisible`.
   - Verify: an unmapped code renders the generic line plus a dev-only `(code)`; a mapped code renders its existing string; the cooldown still blocks a resend before the send is attempted.

6. `components/EmailVerificationPrompt.js`
   - Change: swap the success note copy to a request statement (see Changes 9) and keep it visually distinct from the error line, which already exists at `:122-129`.
   - Preserve: the three-action layout, the "wrong address" mode, `resetLocalState` on `onShow`, and the fact that the success state does not close the modal.
   - Verify: error and success notes never render at once; the error is announced (`accessibilityRole="alert"`).

7. `app/(auth)/forgot-password.js`
   - Change: replace the blanket `else` at `:76-82` with an explicit masked set — `auth/user-not-found`, `auth/invalid-email`, `auth/missing-email` — that keeps the identical confirmation, and surface everything else through the same error path `:67`/`:71` already use. Route the call through `attemptAuthEmailSend({ scope: "password-reset", ... })`.
   - Preserve: enumeration protection. The masked set must keep returning the same confirmation text and must not vary with account existence; the successful path and its cooldown stamp (`:80`) are unchanged.
   - Verify: `auth/operation-not-allowed` and `auth/invalid-api-key` now show an error instead of a false confirmation; `auth/user-not-found` still shows the confirmation.

8. `app/(tabs)/settings.js`
   - Change: under the existing email row (`:1846-1866`), render the mapped copy for `lastSendErrorCode` when one exists, alongside the current "not verified" body. No new action — the existing `openVerificationPrompt` button is the recovery.
   - Preserve: the row's layout, the `showEmailStatus` gate (`:1846`), and the provider-relay note at `:422-424`.
   - Verify: the line appears only after a failure and clears on a later success or account switch.

9. `locales/en.json` + `locales/zh.json`
   - Change: add `auth.errorEmailSendFailed` ("Couldn't send the email. Try again in a moment.") plus keys for the new codes in Changes 2, beside the existing block at `en.json:221-231`. Change `auth.verifyEmailResent` (`en.json:242`) from a delivery claim to a request statement, with matching Chinese copy.
   - Preserve: every existing key, especially the identity-collapsing `errorInvalidCredential` values; do not rename `auth.verifyEmailResent`.
   - Verify: `node scripts/check-i18n-keys.cjs` passes; no `zh` value is left in English.

10. `tests/`
    - Change: add `tests/authEmailSend.test.js`; extend `tests/authErrorMessages.test.js` with the new map entries, the fallback key, and the dev-only suffix.
    - Preserve: every existing test.
    - Verify: `npm test` and `npm run lint`.

## Scope

- Inherit: every refused verification, resend, email-change, and password-reset send; the verification prompt's error slot; the Settings email row; the Sentry event stream.
- Verify: the email-change surface already displays errors — confirm the added code does not change its wording for codes that already map, and that the password latch at `context/EmailVerificationContext.js:202-209` still latches upward only.
- Exclude: detecting a message that Firebase accepted and a mailbox later dropped. No client change can observe that; it needs custom SMTP with a provider that reports delivery. State this in the PR description so the change is not read as a fix for missing mail.
- Exclude: customizing the action URL (`mode`/`oobCode` handling). The app has no `applyActionCode` caller and no action-code route, so repointing the link would break confirmations rather than instrument them.
- Exclude: `app/(auth)/sign-in.js`. It requests the prompt but sends nothing.

## Validation

- Product: trigger a rejected verification send (force it by exhausting the resend rate limit, or by unit-testing the wrapper) → the prompt opens with a localized error and a working Resend under it; a rejected password-reset send with an operational code shows an error instead of a false confirmation; a rejected email change still shows the password field when reauthentication is required.
- Interface: the error line and the success note never appear together; the error is announced by the screen reader; the dev-only code suffix does not appear in a production build; the Settings line appears and clears correctly; long error copy wraps at 320px.
- System: no `Alert` fires during sign-up; a rejected sign-up send still creates the account and completes provisioning; the masked forgot-password set never varies with account existence.
- Repository: `npm test` → all unit tests pass; `npm run lint` → no new errors; `node scripts/check-i18n-keys.cjs` → passes.

## Stop conditions

- Stop if surfacing the forgot-password rejection cannot be done without varying the response with account existence — enumeration protection wins over diagnostics.
- Stop if carrying the sign-up failure through `requestEmailVerificationPrompt` requires the request to survive a cold launch. It must stay memory-only; a stale failure from a previous session is worse than no failure.
- Stop if `attemptAuthEmailSend` cannot be written without React Native imports — it must stay loadable by `node scripts/run-unit-tests.cjs` the way `utils/emailVerificationPolicy.js` is.
- Stop if Sentry's `beforeSend` (`app/_layout.js:49`) filters these events; confirm the scope tag survives before relying on it.

## Design documentation

- After acceptance and validation: record in `docs/CODEBASE_REPORT.md` that auth email sends are non-blocking and surfaced through one wrapper, that the success copy states a request rather than a delivery, and that delivery itself is not observable from the client. Add the Sentry scope names (`sign-up-verify`, `resend-verify`, `email-change`, `password-reset`) to the troubleshooting note in `README.md` so a future reader can find the events.
