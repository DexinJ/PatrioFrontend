# Account-Requirement Review Prompt (App Store + Google Play)

Copy everything inside the code fence below into an AI with live internet access.
It is written to be self-contained, so it does not need any other Pantrio context.

```
You have live internet access. Research the CURRENT, official app-store policy and answer
one question: will requiring a user to register an account before they can use the app
cause it to fail review? Answer from published policy text and cited sources, not from
memory, and do not fill gaps with plausible-sounding generalities.

## What my app is

"Pantrio" is a React Native / Expo mobile app being submitted for iOS first (bundle id
com.chilltech.pantrio, US App Store, launching soon). There is no Google Play listing yet,
but answer for Google Play as well so I can plan the Android release.

Primary category: Food and Drink. Secondary: Utilities. Household utility, not a
professional tool. Free tier plus a monthly/yearly subscription.

Features:
- Fridge / freezer / pantry inventory with expiration dates and urgency warnings
- Shopping list, with one-tap moves from the list into inventory
- AI assistant for recipes, meal ideas, and "what can I cook with this?", running on my
  hosted backend with a daily free allowance; optionally Apple Intelligence on-device, or a
  user-supplied OpenAI-compatible provider
- Photo input: the user photographs a fridge shelf or grocery haul and the AI recognizes
  the items
- Expiration reminders by push notification
- Terms of Use, Privacy Policy, and a public account-deletion web page
- No ads, no tracking, no advertising or analytics SDKs

## Exactly how registration is enforced today

- First launch shows a five-page onboarding carousel with no Skip button and no "continue
  without an account" option.
- The last onboarding page offers only "Create account" and "Log in" (email/password,
  Google, and Sign in with Apple).
- The root navigator uses protected routes: while no Firebase user is signed in, only the
  onboarding, sign-in, and sign-up screens are reachable. The main tabs (Home, Fridge,
  Shopping List, Chat, Settings) cannot be mounted at all.
- Inventory, shopping list, settings, and chat history are stored on the device under
  per-user (UID-scoped) keys, and they work offline — but only after signing in. There is
  no guest, demo, or local-only mode that reaches them without an account.
- The AI assistant needs an authenticated backend token; subscription entitlement is
  account-linked and server-verified.
- Sign in with Apple is offered alongside Google sign-in and email/password.
- Email verification is offered after sign-up but does not block app use.
- Account deletion is available in-app and on a public web page.

## Questions to answer

1. Does Apple's policy require an app to be usable without an account? Quote the exact
   current guideline text, give the guideline number, the URL, and the date you retrieved
   it. Check the guideline revision history — Apple edits these documents periodically —
   and note when that sentence was last changed.
2. Under what conditions is an account wall acceptable to Apple? What test is actually
   applied: is the account required to provide "significant account-based features", and
   does a hosted AI backend plus synced inventory satisfy that test? Quote whatever
   language establishes it.
3. Is requiring registration by itself a rejection trigger, or does the outcome depend on
   the surrounding facts — total gate versus partial gate, what is collected, whether the
   reason is explained in the app, and whether anything works without an account?
4. Does Google Play impose an equivalent restriction? Quote the relevant Play policy or
   Console requirement and cite the URL. If Play has no equivalent rule, say so plainly.
5. For an app shaped like mine, what exactly must exist to be compliant on each store?
   Cover at least: reviewer demo credentials in App Review notes; account deletion in-app
   and via a public web link; Sign in with Apple alongside third-party sign-in; data
   collection declarations and privacy labels; the Play Data safety form; and whether
   gating the app compounds any data-sharing or consent requirement.
6. Rank these four variants from most to least likely to fail review, and explain each
   verdict: (a) my current design, a hard wall with no guest path; (b) the same wall with
   in-app copy explaining why the account is needed; (c) inventory and shopping list usable
   without an account, with the account required only for AI, sync, and subscription;
   (d) an account required only the first time an AI, sync, or subscription feature is
   used, with everything local-only available immediately.
7. What is the smallest change to my current design that removes the risk on each store?

## Output format

1. "Bottom line" first: three sentences or fewer, answering directly whether my design
   passes, passes with a note, or fails, and naming the exact rule that decides it. State
   your confidence as high, medium, or low, and why.
2. One section per store: Apple, then Google Play. For every claim, give the quoted policy
   language, the guideline number, the source URL, the date you retrieved it, and a label
   for whether it is a hard rule, an enforced-but-discretionary guideline, or common
   practice rather than a written rule.
3. A decision table mapping each specific risk in my design to the governing rule and the
   concrete fix.
4. A "Recent changes" list, dated, covering the last 24 months of activity in the rules
   that apply here, including anything still proposed or region-specific.
5. A short note on how developers commonly describe rejections under the governing rule,
   clearly labelled as anecdotal forum or blog evidence, never as policy.
6. "What I could not verify": anything ambiguous, contested, region-dependent, or that you
   could not confirm against an official source. Say so instead of guessing.

## Rules

- Never state a policy requirement without a citation to an official source.
- Never present a blog post, law-firm summary, forum answer, or news article as
  authoritative policy text. Use those only for the labelled anecdotal section.
- Separate what the written rule says from what reviewers actually do.
- If Apple's guidance on this has changed recently or is currently being enforced
  differently than the text implies, say that explicitly and show the evidence.
- State the date of your research at the top of the answer.
```
