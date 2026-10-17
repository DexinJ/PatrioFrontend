# Pantrio App Store submission pack

Working notes for the first App Store release: the copy to paste into App Store Connect,
the declarations to complete, and the placeholders that must be resolved first.

Companion pages published on the legal site:

* `index.html` — Privacy Policy
* `terms-of-use.html` — Terms of Use
* `support.html` — Support
* `delete-account.html` — Account Deletion
* `subprocessors.html` — Sub-processors
* `licenses.html` — Licences and acknowledgements

## 1. Placeholders

Resolved. The published pages contain no `class="fill"` highlights and no bracketed
placeholders. Verified 6 October 2026.

| Item | Page | Value as published |
| --- | --- | --- |
| Legal entity name | Terms of Use | Dexin Jin, defined as "Pantrio," "we," "our," or "us" |
| Liability cap | Terms of Use | The greater of 12 months of fees paid, or 50 USD |
| Governing law | Terms of Use | State of California, United States |
| Venue | Terms of Use | Los Angeles County, California |
| Controller | Privacy Policy | Dexin Jin, named in the opening paragraph |
| Serper processing region | Sub-processors | Not published by Serper; it states that it operates globally |
| Hosting provider | Sub-processors | Railway |
| Hosting region | Sub-processors | United States (US West, California) |
| Support form | Support, Privacy Policy, Account Deletion | https://forms.gle/4fCafUrpwthu34Gm6 |
| Licences notice | Licences | Removed; the full texts ship in the app |

The support contact published on every legal page is `support.pantrio@gmail.com`.

Re-run before launch: `rg -n 'class="fill"' docs` must return nothing.

## 2. App information

| Field | Value |
| --- | --- |
| Name (30 characters) | Pantrio |
| Subtitle (30 characters) | Fridge, lists, and AI recipes |
| Primary category | Food and Drink |
| Secondary category | Utilities (optional) |
| Bundle ID | com.chilltech.pantrio |
| SKU | Internal value, for example pantrio-ios-001 |
| Privacy Policy URL | Published index.html URL |
| Support URL | Published support.html URL |
| Marketing URL | Optional; the support page works |
| Copyright | 2026 followed by the seller name |

Description should cover fridge, freezer, and pantry inventory; expiration tracking; the
shopping list; recipes built from what you already have; and the three AI provider
options. Suggested keywords: fridge, pantry, expiration, food waste, shopping list,
recipes, meal planner, grocery, kitchen, AI.

## 3. App Privacy answers

These answers must match the Privacy Policy and the shipped build. All declared data is
linked to the user's identity and none of it is used for tracking.

| Apple data type | Collected | Linked to user | Tracking | Purposes |
| --- | --- | --- | --- | --- |
| Contact Info: Email Address | Yes | Yes | No | App Functionality |
| Identifiers: User ID | Yes | Yes | No | App Functionality |
| Purchases: Purchase History | Yes | Yes | No | App Functionality |
| User Content: Photos or Videos | Yes | Yes | No | App Functionality |
| User Content: Other User Content | Yes | Yes | No | App Functionality |
| Usage Data: Product Interaction | Yes | Yes | No | App Functionality |
| Diagnostics: Crash Data | Yes | Yes | No | App Functionality |
| Diagnostics: Performance Data | Yes | Yes | No | App Functionality |
| Diagnostics: Other Diagnostic Data | Yes | Yes | No | App Functionality |

Notes and decisions still open:

* Data is collected for account authentication, the hosted AI service, recipe search,
  subscription entitlement, usage quotas, and crash diagnostics. Nothing is used for
  advertising or measurement, and there is no third-party advertising SDK.
* Dietary patterns and allergens are user-entered preferences that are transmitted to the
  AI provider and to the search provider. Decide whether to declare them, whether to stop
  sending them to search, and whether the Privacy Policy needs an explicit consent or
  minimisation statement. This is the highest-risk item in the submission.
* IP addresses reach Sentry and the Pantrio backend through normal network requests. They
  are not stored as a separate category beyond diagnostics and request handling.
* Photos are transmitted to the AI provider for the request. They are not used for
  advertising or to train Pantrio models.

Also complete:

| Question | Answer |
| --- | --- |
| Does the app use the advertising identifier? | No |
| Does the app track users across other companies' apps or websites? | No |
| Does the app include third-party advertising or analytics SDKs? | No |
| Does the app request App Tracking Transparency permission? | No, because nothing is tracked |

## 4. Age rating, content rights, and compliance

* Age rating questionnaire: the app has no user-to-user content, no gambling, no
  advertising, and no unrestricted web browsing. Links to recipe pages open in the system
  browser rather than an embedded browser, so answer the unrestricted-web question
  accordingly. Expect 4+ or 9+.
* Content rights: Pantrio retrieves publicly available recipe pages and displays the
  publisher's ingredient list, instructions, and source link. Confirm with a lawyer how to
  answer the third-party content question, and whether displaying publisher instructions
  is acceptable or should be reduced to ingredient data plus a link.
* Export compliance: already answered in `app.json` with
  `ITSAppUsesNonExemptEncryption: false`. Pantrio uses only standard HTTPS, WSS, and
  keychain encryption. Revisit this answer if you ever add custom cryptography.
* EU distribution: complete the Digital Services Act trader declaration in App Store
  Connect. If the app is distributed in the EU, users must also be clearly told they are
  interacting with an AI system.

## 5. App Review information

Demo account: create a dedicated Pantrio account for review and keep it active with the
free tier available. Send the credentials in the review notes, not in a screenshot.

Suggested review notes:

> Pantrio requires an account because every AI request runs on our hosted service, which
> needs authentication, a usage allowance, and subscription state. To review:
>
> 1. Sign in with the demo account above. Email/password, Sign in with Apple, and Google
>    are all supported; Sign in with Apple is presented alongside the other options.
> 2. Fridge, Freezer, Pantry, and the shopping list work offline and store data on the
>    device.
> 3. Open Chat and send a message to use the AI assistant. The free tier includes a daily
>    token allowance, so the assistant works without a subscription.
> 4. Settings, AI Provider lets the reviewer choose Pantrio Cloud AI, Apple Intelligence on
>    supported devices, or their own OpenAI-compatible provider.
> 5. Settings, Plan and Usage shows App Store plans with localized prices. Purchases use
>    StoreKit and are verified by our server. Restore Purchases is available in the same
>    screen, as is a link to manage an Apple subscription.
> 6. Settings, Account, Delete account permanently deletes the account and local data. The
>    flow requires a recent sign-in, which is why the screen may ask for the password again.
> 7. Privacy Policy, Terms of Use, and the account deletion instructions are linked from
>    the subscription screen and from our support site.
>
> The app contains no advertising, no analytics SDK, no tracking, and no user-generated
> public content. Recipe results link to third-party recipe pages that open in Safari.

Test details to provide: whether App Store Server Notifications point at production, that
`APPLE_ALLOW_SANDBOX_IN_PRODUCTION` is disabled for the public build, and that a sandbox
account can complete a purchase.

## 6. Screenshots

Required because the app supports iPad on iPhone-shaped and iPad-shaped devices.

| Slot | What to capture |
| --- | --- |
| 6.9 inch iPhone | Onboarding, fridge list with urgency tags, chat with a recipe card, subscription screen |
| 6.5 inch iPhone | Reused from the 6.9 inch set if App Store Connect accepts the size |
| 13 inch iPad | Fridge list, chat, settings, subscription screen |

Each set needs at least three images. Keep the status bar clean, use realistic test data,
and do not show placeholder legal URLs.

## 7. Subscriptions in App Store Connect

* Create one subscription group containing the monthly and yearly products, and keep the
  product IDs in `EXPO_PUBLIC_APPLE_SUBSCRIPTION_PRODUCT_IDS` in sync.
* Fill in a display name, description, price, and localization for each product, plus a
  review screenshot for each.
* Add the Privacy Policy URL and Terms of Use URL to the subscription metadata. If you keep
  Apple's standard EULA, point the terms field at Apple's URL; if you set a custom EULA,
  point it at the published terms page.
* Register the App Store Server Notifications V2 URL:
  `https://<api-host>/api/webhooks/apple/app-store-server-notifications-v2`
* Generate the In-App Purchase key and the Sign in with Apple key described in the
  backend README, and store them as deployment secrets.

## 8. In-app AI disclosure

An AI disclosure already ships: `onboarding.aiDisclosure` in `locales/en.json` and
`locales/zh.json`, displayed on the onboarding screen.

Still open: whether to repeat the disclosure at the point of interaction. EU AI Act
Article 50 applies from 2 August 2026 and attaches to the interaction rather than to
onboarding, so a short notice in the chat empty state is the closest match. Wording and
placement are pending a decision.

## 9. Pre-build checklist

* Set `EXPO_PUBLIC_PRIVACY_POLICY_URL` to the published privacy page. Production builds
  fail without it, and the in-app link is hidden when it is empty.
* Set `EXPO_PUBLIC_TERMS_OF_USE_URL` to the published terms page. Production builds now
  fail without it, because the sign-up checkbox and the acceptance gate record the user's
  agreement to whatever it points at.
* Remove the microphone permission and the `expo-audio` plugin from `app.json`, drop
  `expo-audio` from `package.json`, and remove the mic button and voice strings from
  `components/MessageInput.js` and the locale files.
* Remove the unused `react-logo*.png` and `partial-react-logo.png` assets.
* Generate and bundle the full open-source licence texts, or link the generated file from
  the Licences page.
* Confirm every legal page is reachable over HTTPS and has no placeholder text.
* Put the legal site under version control so the published wording is reproducible.
* Verify the built archive includes the privacy manifests shipped by Firebase, Sentry, and
  the Expo modules.
