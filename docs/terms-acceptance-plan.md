# Pantrio Terms Acceptance at Registration - Final Change Plan

Status: implemented 2026-10-15
Scope: terms/privacy acceptance for accounts created after this ships (email/password, Google,
Apple), enforced by the backend and surfaced by the app. Existing accounts are untouched.
Last updated: 2026-10-15

**As built - deviations from this plan:**

* The gate is a component rendered by the signed-in stack's existing blocking
  surface in `app/(tabs)/_layout.js`, not a new root route, so `app/_layout.js`
  and `auth/useAuth.js` are unchanged and no route was added.
* `ensureUserProfile()` refuses to create any row instead of taking an
  acceptance option, which makes `POST /api/users` the only creator and removes
  the need for a `legal` block in the session payload.
* `saveUserProfileToBackend` moved to `api/userProfile.js` so sign-up and the
  gate share one call site.
* `POST /api/users` checks the deletion tombstone before the acceptance
  requirement, so a deleted account is never reported as an acceptance problem.
* The sign-up button stays enabled and explains the requirement with an alert
  rather than being disabled.
* `test/sessionService.test.js` was ported: four tests seed the profile, and the
  provisioning test became two - one asserting the refusal, one asserting the
  session contract for an accepted profile.
* Open, unrelated to this change: the free-tier quota returned by
  `buildSession` is `1_000_000_000` while this plan and the pricing plan say
  `20_000`.

---

## 1. Short answer: is this required?

No law says "there must be a checkbox". What the rules require is that your Terms
actually bind, and that the privacy notice reaches the user before you collect their
data. A checkbox before account creation is the cheapest way to satisfy both, and for
this app it is also effectively required by Apple.

| Layer | What it actually demands | What satisfies it here |
|---|---|---|
| US contract law | The Terms bind only if the user had reasonable notice of them and clearly manifested assent. A passive line like "by continuing you agree" (browsewrap) is weakly enforceable; a checkbox before the account exists (clickwrap) is the standard that survives challenge. | Pre-creation checkbox that gates the action, plus a link to the full text. |
| GDPR / UK GDPR (any EU/UK user) | Art 13: the privacy notice must be available *at the time* personal data is collected - i.e. before the form is submitted. Consent is not the lawful basis for creating an account (contract performance is), so a checkbox must not be labelled as consent to data processing. Art 7: where consent *is* relied on, it must be unbundled and specific. | "I agree to the Terms of Use and acknowledge the Privacy Policy" - agreement for the contract, acknowledgement for the notice. Two distinct links. |
| Apple App Store | The app is an auto-renewable subscription app. Guideline 3.1.2 expects Terms of Use (EULA) and Privacy Policy links in the app metadata and reachable in the app; App Store Connect requires a privacy policy URL for every app; Guideline 5.1.1 expects consent for data collection. Pantrio already links both from Settings (`app/(tabs)/settings.js`). | Same two links at sign-up, with the user's agreement recorded. Turns "the links exist" into "the user agreed". |
| Your own Terms | Section 2 (account), 5 (food/nutrition safety), 6 (subscriptions), 11-13 (disclaimers, liability, indemnity) and 15 (governing law) only help if the user accepted them. There is no arbitration or class-action waiver here, so the stakes are lower than for apps that have one - but the disclaimer and liability sections still depend on assent. | A record showing who accepted which version and when. |

**Bottom line.** Not a statutory checkbox requirement, but it is expected, it is cheap,
and a reviewer will look for it. The real work is not the checkbox - it is that the
acceptance has to be enforced where the account is created, and there is currently a path
that creates accounts without it (section 3).

---

## 2. What ships

1. **Gate on the action, not on a label.** On `app/(auth)/sign-up.js` the "Create account"
   button stays disabled (or refuses with an alert) until the checkbox is ticked. Same for
   the Google and Apple buttons on that screen. An unchecked box must produce no Firebase
   account at all.
2. **Close the sign-in loophole.** `app/(auth)/sign-in.js` has Google and Apple buttons
   that call Firebase sign-in directly. For a first-time provider identity, Firebase
   *creates* an account, and the backend then auto-provisions a `users` row through
   `GET /api/session` -> `ensureUserProfile()`. A user can therefore get a working account
   without ever seeing the sign-up screen. This is the one hole a client-only checkbox
   leaves open.
3. **Make the backend the gate.** Refuse to *create* a `users` row unless the request
   carries a valid acceptance. Existing rows are never checked, which is exactly the
   "don't care about current users" requirement: no backfill, no forced re-consent, no
   lockout of anyone who already has an account.
4. **Record it server-side.** Server-stamped time plus the document version that was
   current when the account was created. Client timestamps are not evidence.
5. **Keep one wording rule.** "Agree" for the Terms, "acknowledge" for the Privacy Policy.
   Do not use one "I agree to the Terms and Privacy Policy" checkbox: in the EU/UK that
   reads as consent to processing, which is not your basis, and it is the pattern that
   regulators criticise.

---

## 3. Enforcement model

Provisioning happens in two places, both on the backend:

| Path | Trigger | Row creation |
|---|---|---|
| `POST /api/users` | `app/(auth)/sign-up.js` -> `saveUserProfileToBackend()`, after Firebase creates the user | `INSERT INTO users ... ON CONFLICT(uid) DO UPDATE` (`src/http/routes.js`, ~line 1044) |
| `GET /api/session` | Any signed-in session, including provider sign-in from the sign-in screen | `ensureUserProfile()` (`src/session/sessionService.js`) inserts with a fallback username when no row exists |

`GET /api/users/:uid` is read-only (404 when there is no row) and needs no change. So the
gate belongs at those two `INSERT INTO users` sites - re-run
`rg "INSERT INTO users" src` when implementing and confirm the list is still exactly
those two.

**Enforcement rule.** When a request would create a row, require a valid acceptance
payload and stamp `terms_accepted_at` with server time plus the server's current
`terms_version`. When the row already exists, ignore the field entirely and never fail.
That single rule gives:

* no acceptance, brand-new user -> `403 { code: "TERMS_ACCEPTANCE_REQUIRED", termsVersion }`
* acceptance supplied, brand-new user -> row created with the record
* any existing user, any client version -> unchanged behaviour

The client maps that 403 to the acceptance screen, and re-runs the session bootstrap after
the accept call succeeds.

**Do not delete the Firebase account on refusal.** On the email/password path the checkbox
is checked before `createUserWithEmailAndPassword` runs, so refusal means nothing was
created. On the provider path the account already exists by the time the backend answers;
refusing to provision is the correct outcome, and the user can accept later or sign out.

### 3.1 Wire contracts

```http
POST /api/users
{ "username": "...", "termsAccepted": true }
-> 200 { ok, uid, username, subscription, legal: { termsVersion, termsAcceptedAt } }
-> 403 { code: "TERMS_ACCEPTANCE_REQUIRED", termsVersion }   # only when a row would be created

GET /api/session
-> 200 { ...session, legal: { termsVersion, termsAcceptedAt } }
-> 403 { code: "TERMS_ACCEPTANCE_REQUIRED", termsVersion }
```

Server-stamped version is deliberate: the app never needs to know which version is current,
and a wording revision means changing one constant plus republishing the page. The tradeoff
is a narrow race where the app shows yesterday's text while the server records today's
version - acceptable here, and the payload gives the app what it needs to display it.

---

## 4. Backend changes

`D:\mobileSearcherBackend`

| File | Change |
|---|---|
| `src/db/schema.sql` | Add `terms_accepted_at INTEGER`, `terms_version TEXT` to `users`. Nullable, because existing rows are not backfilled. |
| `src/db/initDb.js` | Add a `USER_TERMS_COLUMN_MIGRATIONS` list following the existing `ALTER TABLE users ADD COLUMN` pattern; bump `DATABASE_SCHEMA_VERSION` from 2 to 3. |
| `src/legal/termsPolicy.js` (new) | Single source of truth: `CURRENT_TERMS_VERSION` (start with `"2026-09-30"`, the published effective date), `normalizeTermsAcceptance(body)`, and `TermsAcceptanceRequiredError`. |
| `src/http/routes.js` | `POST /api/users`: accept `{ termsAccepted: true }` (or `{ terms: { accepted: true } }`), validate through the policy, write `terms_accepted_at = strftime('%s','now')` and `terms_version` **only when inserting**. |
| `src/http/routes.js` | `GET /api/session`: catch `TermsAcceptanceRequiredError` and return the 403 shape above instead of `500 SESSION_LOAD_FAILED`. |
| `src/session/sessionService.js` | `ensureUserProfile()` takes an options flag for acceptance; `buildSession()` threads it through from the route. The throwing path must be typed so the route can distinguish it from a real failure. |
| `src/session/sessionService.js` | Include `legal: { termsVersion, termsAcceptedAt }` in the session payload so the app can display the version it is recording. |
| `test/` | Cover: no acceptance + no row -> 403; no acceptance + existing row -> 200; acceptance + no row -> row created with server time and version; acceptance + existing row -> existing timestamp not overwritten. |

**Deletion note.** `DELETE /api/users/:uid` removes the row, so the acceptance record
disappears with the account. That is consistent with the privacy policy's deletion
promise and is the right default; keeping a non-identifying hash purely as evidence is a
decision to make deliberately, not by accident (see section 8).

---

## 5. Client changes

`D:\firdge_manager\fridge-manager`

| File | Change |
|---|---|
| `utils/legalLinks.js` (new) | Extract `TERMS_OF_USE_URL` / `PRIVACY_POLICY_URL` out of `app/(tabs)/settings.js` so sign-up, the acceptance screen, and Settings all read the same constants. |
| `components/TermsAcceptanceRow.js` (new) | Checkbox + "I agree to the Terms of Use and acknowledge the Privacy Policy." with two tappable links. Must meet the existing accessibility conventions (`accessibilityRole`, `accessibilityState`, label sized from `settings.ux.fontSize`). |
| `app/(auth)/sign-up.js` | Checkbox state above the submit button. `submit()`, `onPressGoogle()` and `onPressApple()` all read it; unchecked -> `Alert` and return before any Firebase call. Pass the flag into `saveUserProfileToBackend()`. |
| `app/(auth)/accept-terms.js` (new) | Blocking screen for accounts that already exist in Firebase but are not provisioned. Body: the same checkbox, the version/effective date from the session or 403 payload, "Accept and continue", and "Sign out". No back navigation into the tabs. |
| `api/termsAcceptance.js` (new) | `TERMS_ACCEPTANCE_REQUIRED` constant, `isTermsAcceptanceRequiredError(error)`, and `acceptTerms()` -> `POST /api/users` with the acceptance flag. |
| `api/termsAcceptancePolicy.cjs` + `tests/termsAcceptancePolicy.test.js` (new) | Pure logic kept out of the components, matching the `accountDeletionPolicy.cjs` / `legacyPurgePolicy.cjs` convention: is the box ticked, is this error the acceptance 403, should this route be shown. |
| `context/AccountSessionContext.js` | `GET /api/session` currently throws a generic backend error on any non-2xx. Detect the 403 code first and publish `termsAcceptanceRequired` instead of an error string. |
| `auth/useAuth.js` | Same detection in the reconcile path (`backendAccountExists()` at ~line 629): a 403 means "signed in, not provisioned", which must not be treated as a failed session or trigger cleanup. |
| `app/_layout.js` | Route into `accept-terms` while `termsAcceptanceRequired` is set, and keep the tabs withheld. |
| `app/(tabs)/settings.js` | Use the shared legal constants instead of its local `TERMS_OF_USE_URL` / `PRIVACY_POLICY_URL` copies (~lines 82-86) so there is one source for both screens. |
| `locales/en.json`, `locales/zh.json` | New keys for the checkbox label, the refusal alert, the acceptance screen title/body/buttons, and any error text. Both locales must be complete before shipping - there is a test suite that reads them. |
| `app.config.js` | `EXPO_PUBLIC_TERMS_OF_USE_URL` is only validated when present (~lines 128-129). Now that a user must agree to the linked text, shipping the Apple fallback is a wrong-terms bug rather than a cosmetic default: add it to the production required list so `config:check` fails loudly. |
| `.env.example` | Update the terms/privacy comments: the terms URL is required in production and must point at Pantrio's own page, not Apple's EULA. |
| `app/(auth)/sign-in.js` | **Verify only, no change expected.** Firebase sign-in succeeds, then the bootstrap 403 routes to `accept-terms`. Confirm on a device that a first-time provider sign-in lands there and cannot reach the tabs. |
| `README.md`, `docs/app-store-connect-submission.md` | Both still describe the Apple EULA fallback as acceptable (README ~lines 106-112, submission checklist ~line 188); update once the gate exists. |

### 5.1 Configuration

No new environment variable is introduced. Two existing ones carry the gate, and one changes
status:

| Variable | Used by | Status after this change |
|---|---|---|
| `EXPO_PUBLIC_PRIVACY_POLICY_URL` | Settings, checkbox, acceptance screen | Already required in production builds |
| `EXPO_PUBLIC_TERMS_OF_USE_URL` | Settings, checkbox, acceptance screen | Changes from optional-with-Apple-fallback to required, pointing at Pantrio's own page |
| `EXPO_PUBLIC_API_BASE_URL`, `EXPO_PUBLIC_WS_URL` | Backend, websocket | Unchanged |
| `EXPO_PUBLIC_SUPPORT_FORM_URL` | Sign-in screen, Settings | Unchanged - stays optional with the `mailto:` fallback |

```env
EXPO_PUBLIC_PRIVACY_POLICY_URL=https://<pages-site>/index.html
EXPO_PUBLIC_TERMS_OF_USE_URL=https://<pages-site>/terms-of-use.html
```

The published GitHub Pages layout is authoritative: `index.html` is the Privacy Policy and
`terms-of-use.html` is the Terms, so both values resolve at the site root. Note that `docs/`
in this repo has no `index.html` and does contain `privacy-policy.html`, so it is not a mirror
of the deployed site - keep the published repo authoritative.

`EXPO_PUBLIC_SUPPORT_FORM_URL` remains the only other URL-shaped variable, empty by design.
The URLs App Store Connect wants typed into its own metadata - Support URL, Privacy Policy
URL, account-deletion URL - are not app variables.

---

## 6. Wording and i18n keys

English: **"I agree to the Terms of Use and acknowledge the Privacy Policy."**

Chinese: **"我同意《使用条款》并确认《隐私政策》。"**

The link labels reuse the existing `settings.termsOfUse` / `settings.privacyPolicy` keys, so
only the sentence scaffolding is new.

| Key | English | Chinese |
|---|---|---|
| `auth.termsAgreementPrefix` | `I agree to the ` | `我同意` |
| `auth.termsAgreementMiddle` | ` and acknowledge the ` | `并确认` |
| `auth.termsAgreementSuffix` | `.` | `。` |
| `auth.acceptTermsTitle` | `Agreement required` | `需要同意条款` |
| `auth.acceptTermsToContinue` | `Agree to the Terms of Use and acknowledge the Privacy Policy to create your account.` | `请先同意《使用条款》并确认《隐私政策》以创建账号。` |
| `auth.termsScreenTitle` | `Before you continue` | `继续之前` |
| `auth.termsScreenBody` | `Pantrio needs your agreement to finish setting up your account.` | `Pantrio 需要你同意后才能完成账号设置。` |
| `auth.termsVersionLabel` | `Effective {{version}}` | `生效日期 {{version}}` |
| `auth.termsAcceptAndContinue` | `Accept and continue` | `同意并继续` |
| `auth.termsSignOut` | `Sign out` | `退出登录` |
| `errors.termsAcceptanceFailed` | `Could not save your agreement. Please try again.` | `无法保存你的同意，请重试。` |

---

## 7. Sequencing

| Phase | Work | Why this order |
|---|---|---|
| 1 | Backend: schema + migration, policy module, both insert sites, `GET /api/session` 403, tests | The rule must exist before any client depends on it |
| 2 | App: shared legal constants, checkbox component, sign-up gating, `accept-terms` route, session/bootstrap mapping, i18n, unit tests | Consumes the contract from phase 1 |
| 3 | `.env.example`, README and submission-doc updates, then the manual pass below | Removes the now-stale Apple-fallback advice |

If the app is already live, add a server-side flag around phase 1 enforcement and flip it
only once the phase 2 build has reached essentially everyone; otherwise new users on the
old binary get a 403 and a generic save failure. The submission checklist in
`docs/app-store-connect-submission.md` reads as pre-release, so this is likely
unnecessary - confirm before assuming it.

### Manual verification

* Email sign-up with the box unticked: alert, no Firebase user, no `users` row.
* Email sign-up with the box ticked: account created, row has server-stamped time and version.
* Google and Apple buttons on sign-up with the box unticked: nothing happens beyond the alert.
* Google and Apple buttons on sign-up with the box ticked: normal flow.
* **Google/Apple from the sign-in screen with a brand-new identity:** lands on the
  acceptance screen, cannot reach the tabs, and provisioning happens only after accepting.
* Existing account (no `terms_*` values): signs in with no prompt and no error.
* Refusal on the acceptance screen: stays signed in but unprovisioned, or signs out cleanly.
* Both locales render the new strings; Settings' existing Terms/Privacy links still work.

---

## 8. Decisions taken

1. Checkbox wording as in section 6 - agreement for the Terms, acknowledgement for the
   Privacy Policy. A German or French locale would need its own legal review if those
   locales are ever added.
2. The acceptance record does not survive account deletion.
3. Re-prompting on a future Terms revision is designed for (`terms_version`) but not
   implemented; current users are explicitly out of scope.
4. The acceptance screen shows the recorded version as an effective date.
5. The server, not the client, decides which version is current.

---

## 9. Out of scope

* Re-consenting existing users or backfilling `terms_*` for them.
* In-app rendering of the legal documents: the app opens them with `Linking.openURL` today
  and this plan keeps that. A `react-native-webview` reader is a separate change.
* Checkout/StoreKit subscription disclosure - already handled by the subscription flow.
* The EU AI Act Article 50 interaction notice, tracked separately in
  `docs/ai-provider-disclosure-plan.md`.
