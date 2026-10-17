# Pantrio Three-Tier Pricing Plan

Status: proposal for review
Scope: iOS App Store subscriptions (Apple auto-renewable). Android/Stripe is out of scope for v1.
Last updated: 2026-09-28
Price revision: 2026-09-28, after live US App Store research. See section 2.5.

---

## 1. Recommendation in one page

Ship a three-tier structure - **Free / Plus / Pro** - with Plus as the intended default
payer. Do not copy ChatGPT's ladder. ChatGPT's $8/$20/$200 shape is driven by agentic
compute costs and a small population of extreme users; Pantrio's unit of value is a
household chore, its per-turn AI cost is small, and the app already lets users point it at
their own OpenAI key for $0.

| | Free | Plus | Pro |
|---|---|---|---|
| Monthly (US) | $0 | **$6.99** | **$9.99** |
| Annual (US) | $0 | **$49.99** | **$79.99** |
| Annual discount | - | ~40% | ~33% |
| Default model | `gpt-5.6-luna` | `gpt-5.6-luna` | `gpt-5.6-terra` |
| Reasoning effort | minimal | low | medium |
| Daily AI budget | 20,000 tokens | 100,000 tokens | 300,000 tokens (bounded, not null) |
| Photo chat | 3 / month | 30 / month | 100 / month |
| Web + recipe search | 2 / day | 20 / day | generous (fair use) |
| Family Sharing (Apple) | - | - | enabled |

Voice input is deliberately absent from that table: it is disabled in the app today and
cannot be sold as a tier benefit until it is restored. See section 3.5.

Three rules this plan is built on:

1. **Every tier has a finite daily token cap.** `dailyTokenLimit: null` ("unlimited") is
   how a tiered product quietly loses money. The current Pro plan is `null`; that changes.
2. **The top tier cannot sell "more AI" alone.** A user with their own API key already has
   unlimited AI for the price of tokens. Pro has to sell answer quality, convenience,
   priority, and household features.
3. **Tier caps are derived from measured cost, not from taste.** Phase 0 exists to produce
   that number. The caps in the table above are placeholders until Phase 0 lands.

**Launch shape.** Build all three tiers in the catalog, but launch *publicly* with Free and
Plus only. Every serious competitor in the research sells exactly one paid tier, and Pro's
only structural differentiators - shared household data and cross-device sync - do not
exist in the product yet; the backend has no inventory sync endpoint at all. Enable Pro
when either measured heavy usage appears or household sharing ships. See section 3.

---

## 2. Price points

### 2.1 US launch prices

All four numbers below are standard US App Store price points for auto-renewable
subscriptions. Confirm the final selection in App Store Connect, because the available
points differ slightly by territory and change over time.

| Product | Term | US price | Net after 15% (Small Business Program) | Effective net per month |
|---|---|---|---|---|
| `...plus.monthly` | 1 month | $6.99 | $5.94 | $5.94 |
| `...plus.yearly` | 1 year | $49.99 | $42.49 | $3.54 |
| `...subscription.monthly` (existing ID) | 1 month | $9.99 | $8.49 | $8.49 |
| `...subscription.yearly` (existing ID) | 1 year | $79.99 | $67.99 | $5.67 |

Read the last column carefully: an annual subscriber is worth **40% less per month** than a
monthly one at the same tier. That gap is what sets the caps in section 4.1, because the cap
has to work for the annual subscriber, who is also the subscriber you most want.

Why these numbers:

- **$6.99/mo sits where the AI-first cohort actually prices.** Samsung Food+ is $6.99,
  Dinner Ideas is $7.99, DishGen is $7.99. The mid-tier center of gravity across the
  category is $4-$7, and the sub-$5 band is dominated by older recipe and list utilities
  rather than AI-heavy products.
- **$49.99/yr is the single most important anchor in the dataset.** The annual cluster is
  $30-$60, and the tight cluster is $39.99-$49.99: Fridgely, Nom, Dinner Ideas, Amelia and
  Home Chef all sit at $39.99, while Plan to Eat is $49 and SideChef is $49.99.
- **$9.99/mo and $79.99/yr is the observed ceiling, not $19.99.** DishGen at $79.99/yr is
  the highest food-AI price found, and it is a far more AI-centric product than Pantrio.
  Above $9.99 the comparison stops being "another food app" and becomes "half of ChatGPT
  Plus," which this product does not win.
- **The ~40% annual discount on Plus is deliberately aggressive.** Observed discounts run
  from 16% (SideChef, DishGen) to 67% (Bring!), with 30-40% normal. $49.99 is a
  psychologically stronger number than $59.99, and the deeper discount is the price of
  using it.

This replaces an earlier draft that used $4.99 / $39.99. The evidence moved the mid tier up;
section 2.5 explains what changed and what was rejected.

### 2.2 Grandfathering

Existing Pro subscribers keep what they have. Two mechanisms, pick one in Phase 1:

- **Reuse the existing product IDs for the new top tier** (`com.chilltech.pantrio.subscription.monthly`
  / `.yearly`), change the price, and choose **preserve current price** for existing
  subscribers. New buyers pay $9.99, current subscribers keep their old rate. Preferred:
  no new IDs, no risk of a subscriber holding two products in the group.
- **Create new IDs and map them to the top tier**, keeping the old IDs in the catalog
  mapped to the same plan. Only do this if you need the old price to remain purchasable.
  Retired IDs must stay in `APPLE_SUBSCRIPTION_PLANS_JSON` while their transaction chains
  can still send App Store Server Notifications.

Either way: **current Pro subscribers must not lose features.** Anyone on the old
unlimited plan maps to the new Pro tier.

### 2.3 Offers and trials

- **7-day free trial on Plus annual only.** Trials convert far better on annual, and
  restricting the trial to annual removes the "subscribe monthly, cancel, repeat" loop.
- **No trial on Pro at launch.** A Pro trial trains users to expect the top model and
  then downgrades them, which is a churn machine. Add it later only if Pro conversion is
  weak.
- **Win-back offer for lapsed Plus subscribers** (Apple's win-back offers), 1 month at
  $1.99. Configure in Phase 3 once there is a churned cohort to win back.
- Consider a **limited-time launch price** on Plus annual ($29.99) for the first cohort.
  This is a real lever, but it also permanently anchors "annual Plus" low for that
  cohort. Decide deliberately.

### 2.4 Price tests to run

Do not test more than one price change at a time, and never test on the top tier first.

| Test | Variable | Success metric |
|---|---|---|
| T1 | Plus monthly at $5.99 vs $6.99 | 30-day net revenue per 1,000 MAU, not raw conversion |
| T2 | Plus annual $49.99 vs $59.99 (the Samsung Food+ anchor) | Annual mix share; net revenue per new subscriber |
| T3 | Free daily cap 20k vs 30k tokens | Day-30 retention vs free-to-paid conversion |

### 2.5 Market evidence behind these numbers

Source: live US App Store listings and developer pricing pages, checked 2026-09-28, across
roughly two dozen apps in five categories (fridge/pantry trackers, recipe managers, meal
planners and list apps, AI cooking assistants, and general AI anchors). Full comparison
table lives in the research output, not in this repo.

**What the data supports:**

- Mid-tier center of gravity: **$4-$7/month**, AI-first apps at the top of that band
- Annual cluster: **$39.99-$49.99**, with $39.99 the most common single point
- Annual discounts: 16%-67% observed, 30-40% normal
- Most food apps run **one paid tier**, not three. Three tiers is the norm in general AI
  products (ChatGPT, Gemini, Perplexity), not in this category
- Nobody in food sells AI **credits**. They sell monthly allowances (Recipe Keeper AI:
  3 recipes + 10 messages + 1 photo scan per day free; Amelia: 3 plans + 5 regenerations
  per week; Fridgely and Dinner Ideas: unlimited AI in Pro)

**The finding the research underplays, and the one that matters most to Pantrio.** The apps
whose job is *closest* to Pantrio's core are the cheapest things in the dataset:

| Direct competitor | Price for the core inventory job |
|---|---|
| USDA FoodKeeper | free |
| NoWaste | $6.99 **per year** (500 items free) |
| Bring! | $8.99 **per year** |
| AnyList | $9.99/yr individual, $14.99/yr household |
| Pantry Snapper | $2.99 one-time |
| Recipe Keeper | $19.99 one-time |
| Paprika 3 | $4.99 one-time |

So the inventory-and-expiration job has **near-zero willingness to pay**, while the
meal-planning-and-AI job supports $40-$60/year. Pantrio sits across both, and the tier
design is what resolves that tension: the free tier has to cover the pure pantry-tracking
job credibly enough that Pantrio never loses a comparison to a $6.99/yr app, and the paid
tiers sell the AI job at the AI market's price.

That is also why the recommended free tier below keeps inventory effectively unlimited and
gates AI instead. A competing draft recommended capping free inventory at 50-75 items;
NoWaste gives 500 items free, so that cap would look stingy on the one feature a
prospective buyer can cheaply compare.

**Evidence quality caveats.** Treat these numbers as directional, not settled:

- Several of the AI-first apps are very new (2025-2026 App Store IDs) by small teams.
  Their prices are experiments, not proven willingness to pay, and several will reprice or
  disappear. Established anchors - Samsung Food+, Plan to Eat, SideChef, Cozi, NoWaste,
  AnyList - should carry more weight than Fridgely, Nom, Dinner Ideas, Amelia, Craveit,
  Home Chef, or Meal Chef AI.
- **Mealime is shutting down 2026-10-21**, so its $2.99/month is a legacy price, not a
  benchmark.
- The comparison table has a duplicate row ("AI Meal Planner: Easy Recipes" appears twice
  with the same App Store ID), so the distinct-app count is slightly lower than stated.
- Prices marked "not publicly verifiable" were in-app-paywall-only. Those are exactly the
  numbers most likely to differ from the listing.
- Spot-check the three prices this plan leans on hardest before committing - Samsung Food+
  at $6.99/$59.99, Plan to Eat at $49, and DishGen at $79.99 - since those anchor the mid
  tier, the annual point, and the ceiling.

---

## 3. What each tier actually sells

### Free ($0) - the habit

Everything that costs no AI tokens stays unlimited and unembarrassed: fridge, freezer and
pantry inventory, expiration tracking and urgency categories, shopping list, reminders,
themes, offline storage. This is the funnel and the retention engine. Do not squeeze it.
NoWaste gives 500 items free and AnyList effectively does too, so any item cap below that
hands a comparison win to a $6.99/year competitor.

AI is a taste: 20,000 tokens/day on `gpt-5.6-luna`, no photo chat, 2 web/recipe
searches per day.

Note that this is a **daily** allowance, not a monthly one. The one competitor that meters
its free AI in public - Recipe Keeper AI - gives 3 AI recipes, 10 chef messages, and 1 photo
scan *per day*. A 5-per-month free allowance, which one draft proposed, is stingier than
the market and will not form a habit.

Note the reality of 20k tokens/day. The system prompt plus tool schemas consume several
thousand tokens before the user types anything, and multi-round tool calls bill every
round. In practice 20k/day is **roughly 2-4 AI turns per day**. That is fine for a free
tier, but it means the free tier cannot be marketed as "AI included" without qualification.

### Plus ($6.99/mo, $49.99/yr) - the default payer

Plus is where most revenue should come from. It sells **capability and convenience**:

- 100,000 tokens/day (roughly 15-25 turns/day), `gpt-5.6-luna` default with
  `gpt-5.6-terra` available, prompt ceiling 40k
- Photo chat: 30 scans/month - with voice disabled (section 3.5) this is your strongest
  capability lever, because photographing a fridge shelf is the app's best "oh, that's
  magic" moment and it costs a fixed, predictable 4,096 reserved tokens per image
- Web and recipe search included (20/day)
- Longer conversation memory

### Pro ($9.99/mo, $79.99/yr) - the bounded power tier

Pro must not be "Plus with a bigger number." It sells things Plus structurally cannot:

- **`gpt-5.6-terra` as the default model, plus higher reasoning effort** (`medium` vs
  Plus's `low`). This is a quality difference on every answer, not a quota difference,
  and it is already implemented - see `REASONING_POLICY_JSON` in section 5.2.
- **300,000 tokens/day**, effectively unreachable for normal use, so no honest user ever
  sees a limit
- Photo chat 100/month, generous search caps
- **Priority queue** (`MAX_CONCURRENT_CHAT_REQUESTS_PER_USER` is currently a flat 2;
  raise it for Pro)
- **Apple Family Sharing enabled**, so a household can share the entitlement
- Early access to new tools

The honest long-term differentiator for the top tier is **shared household data** - one
fridge, several people, one shopping list. That is real engineering work (household
membership, shared inventory and list sync, conflict resolution) and it belongs in
Phase 4, not in the launch. Until then, do not price Pro as if household sharing exists.

### 3.5 Voice input is disabled - decide whether to restore it

Voice transcription is not a feature you can sell right now. `utils/voiceInput.js` opens
with a "VOICE RECOGNITION DISABLED" banner, `components/MessageInput.js` has the recorder
hooks, voice-mode state, transcription upload, and microphone UI commented out, and the
composer is text-only with a permanent Send button. It was disabled, not deleted.

Three things make restoration unusually cheap if you want a second Plus lever:

- `POST /api/transcriptions` is still registered and functional on the backend, with CORS
  handling, a concurrency guard, and the `gpt-4o-mini-transcribe` call intact.
- `expo-audio` is still a dependency, and the microphone permission string is still
  declared in `app.json`.
- The client code is commented in place rather than removed, and
  `estimateAudioTokensFromBytes` already reserves transcription capacity against the
  daily budget.

So the cost of restoring voice is closer to "uncomment and re-test" than "rebuild". Two
caveats before you count on it: the backend returns "Transcription is not supported" for
users on their own API key, so voice would be a Pantrio-Cloud-AI-only feature; and
re-enabling it still requires the per-plan transcription counter described in section 5.4.

---

## 4. Unit economics

### 4.1 The guardrail

Let `C` = blended provider cost in dollars per 1M tokens (input, output, and cached input
mixed at your actual traffic ratios). Worst-case monthly AI cost for one subscriber is:

```
worst_case_cost = (daily_cap * 30.44 / 1,000,000) * C
```

Hold worst-case AI cost at or below **35% of net revenue** (net = price after Apple's 15%
Small Business Program commission).

Size the budget against the **annual** subscriber, not the monthly one. An annual Plus
subscriber at $49.99 nets only $3.54/month, so a cap that is comfortable at $6.99/month is
under water at $49.99/year. Setting the cap by the annual case means monthly subscribers
are simply more profitable, which is the direction you want the error to point.

| Blended cost `C` | Plus max daily cap (annual subscriber: net $3.54, budget $1.24) | Pro max daily cap (annual subscriber: net $5.67, budget $1.98) |
|---|---|---|
| $0.50 / 1M | 81,000 | 130,000 |
| $1.00 / 1M | 41,000 | 65,000 |
| $2.00 / 1M | 20,000 | 33,000 |
| $4.00 / 1M | 10,000 | 16,000 |
| $8.00 / 1M | 5,000 | 8,000 |

Monthly subscribers support roughly 1.7x these caps, so the numbers above are the
conservative floor, not the expected case.

Read that table carefully, because it says something uncomfortable: **the caps proposed in
section 1 (100k/300k) are only supportable for annual subscribers if your blended cost is
around $0.50 per 1M tokens.** If Pro runs `gpt-5.6-terra` with medium reasoning, `C` is
almost certainly higher than $0.50, and a 300k/day cap would be under water for heavy users.
At `C = $1.00`, the honest annual-funded cap for Plus is closer to 41,000 tokens/day.

That is why Phase 0 is not optional. Do not commit to specific caps before you have `C`.

### 4.2 Why the caps can still feel generous

The calculation above bounds the **tail**. Most users never approach a cap. If p99 daily
usage is 40,000 tokens and the cap is 300,000, the cap protects you against the 1% and
never inconveniences the 99%. Setting caps from the tail inward is the right method, and
it is the only way to remove "unlimited" without a visible downgrade.

### 4.3 The free tier's subsidy

Free users cost money with no revenue attached, so the free tier needs an explicit
subsidy budget. Suggested ceiling: **$0.30 of AI cost per free user per month**, which at
`C = $0.50/1M` is about 600k tokens/month (~19.7k/day) - which is why 20k/day is the right
free cap only if the free model is genuinely cheap. If `C` is high for `luna` traffic,
lower the cap rather than the model, because switching models changes answer quality and
quality is what converts free users.

Also: `TRIAL_TOKENS_PER_DAY` is currently set to `1_000_000_000` with a "TEMP: restore a
product value before shipping" comment. Until that is restored to a real number, you
cannot measure free-to-paid conversion at all, because there is no free limit to convert
against. Doing this is a prerequisite, not a phase.

### 4.4 What the third tier is worth

Net revenue per 1,000 monthly active users at 15% commission, assuming a 60/40
annual/monthly mix within each tier (annual-weighted, because that is the mix you should
be pushing). At that mix each Plus subscriber is worth **$4.50/month** net and each Pro
subscriber **$6.80/month** net.

| Mix | Plus | Pro | Net revenue / 1,000 MAU |
|---|---|---|---|
| 2% paid, all Plus | 2.0% | 0% | $90 |
| 4% paid, all Plus | 4.0% | 0% | $180 |
| 5% paid, 4% Plus + 1% Pro | 4.0% | 1.0% | $248 |
| 8% paid, 6% Plus + 2% Pro | 6.0% | 2.0% | $406 |
| 10% paid, 7% Plus + 3% Pro | 7.0% | 3.0% | $519 |

Two lessons. First, at a realistic 5% paid rate the Pro tier contributes about **$68 of
$248, roughly a quarter** of net revenue, while the free-to-Plus conversion boundary
contributes the rest. Spend your design and analytics effort on the free boundary; the top
tier is worth building but it is not where the money is.

Second, the price revision is worth about **33% more net revenue per Plus subscriber** than
the original $4.99/$39.99 draft ($4.50 vs $3.40 per month at the same mix). That is a much
larger effect than adding a third tier, and it costs nothing to implement.

---

## 5. How the tiers are enforced in the existing system

Almost everything needed already exists. The plan catalog already carries
`dailyTokenLimit`, `allowedModels`, `defaultModel`, `maxPromptTokens`, and
`maxCompletionTokens` per plan, and `REASONING_POLICY_JSON` already resolves per plan.

### 5.1 What works today with configuration only

- Model access and default model per tier
- Reasoning effort per tier (see 5.2)
- Daily token budget per tier
- Prompt and completion ceilings per tier
- Adding the new products to the client's "Available plans" list, which is rendered from
  the backend catalog plus StoreKit, so no new screen is required

### 5.2 Reasoning policy example

`REASONING_POLICY_JSON` is read once at boot and merged as default, then model, then plan.
The free/paid effort split is deliberately not hardcoded, so the quality ladder is
configuration:

```json
{
  "default": { "effort": "minimal", "context": "current_turn", "rounds": "first" },
  "plus": { "effort": "low" },
  "pro": { "effort": "medium", "context": "all_turns" }
}
```

`context: "all_turns"` renders earlier reasoning into later turns and grows input tokens,
which is a deliberate quality-for-cost trade for the top tier.

### 5.3 Plan catalog JSON

List plans lowest to highest: when a user holds two active plans, the last matching plan
in the catalog wins.

```json
[
  {
    "id": "plus",
    "name": "Pantrio Plus",
    "productIds": [
      "com.chilltech.pantrio.plus.monthly",
      "com.chilltech.pantrio.plus.yearly"
    ],
    "dailyTokenLimit": 100000,
    "defaultModel": "gpt-5.6-luna",
    "allowedModels": ["gpt-5.6-luna", "gpt-5.6-terra"],
    "maxCompletionTokens": 4000,
    "maxPromptTokens": 40000
  },
  {
    "id": "pro",
    "name": "Pantrio Pro",
    "productIds": [
      "com.chilltech.pantrio.subscription.monthly",
      "com.chilltech.pantrio.subscription.yearly"
    ],
    "dailyTokenLimit": 300000,
    "defaultModel": "gpt-5.6-terra",
    "allowedModels": ["gpt-5.6-terra", "gpt-5.6-luna", "gpt-4o", "gpt-4o-mini"],
    "maxCompletionTokens": 4000,
    "maxPromptTokens": 50000
  }
]
```

Replace the two `dailyTokenLimit` values with the Phase 0 numbers before shipping.

### 5.4 What has to be built

Four gaps in the current code, in priority order:

1. **Photo and search are not plan-gated at all.** Tool access is currently
   decided by `isAuthed` against `TRIAL_ALLOWED_TOOLS`, and `FREE_MAX_RESULT_COUNT` is a
   flat constant. Per-plan feature gating needs a new mechanism - either a `tools` list on
   each plan, or per-plan counters for photo scans, searches, and (if voice is restored)
   transcriptions. Serper metering already records usage; `SERPER_QUOTA_ENFORCEMENT` is
   off with a note to turn it on after reviewing recorded usage. This is that moment.
2. **The free plan is hardcoded.** `FREE_PLAN` in `planCatalog.js` pulls from `policy.js`
   constants. Either move free into the same catalog schema or centralize the numbers, so
   pricing changes stop being code changes.
3. **The catalog has no marketing metadata.** It carries `displayName`, `planId`, and
   `productId` only. A three-tier comparison screen needs a feature list, a tagline, and
   explicit ordering. Add an optional `features` / `blurb` field, or keep the copy
   client-side keyed by `planId`. Do not make the client infer tier value from token
   counts.
4. **The quota display speaks in tokens.** "2,400 of 20,000 tokens left" is meaningless
   to this audience. Show **AI turns or messages remaining**, and keep tokens as a debug
   detail inside the existing "Technical details" disclosure.

One safety note: `subscriptionToEntitlement` falls back to `SUBSCRIPTION_PLANS[0]` when a
product ID is not in the catalog. With the catalog ordered lowest-to-highest, that means
an unmapped or retired product ID silently grants the **cheapest paid tier**, not the top
one. That is the safe direction, but it needs a test so a retired Pro ID never demotes a
paying customer without anyone noticing.

---

## 6. App Store Connect work

Do this before touching the backend, because some choices are create-time only.

1. **Create one subscription group** for the ladder, with Pro at level 1 (highest) and
   Plus at level 2. Levels define upgrade vs downgrade, which defines proration
   behaviour. Monthly and yearly products for the same tier sit at the same level.
2. **Verify the Family Sharing setting before creating products.** Apple has treated
   Family Sharing for auto-renewable subscriptions as a create-time decision. If the top
   tier is meant to be shareable by a household, it must be enabled when the product is
   created; changing it later can mean new product IDs and a migration. Confirm the
   current rule in App Store Connect rather than trusting this document.
3. **Add the two new Plus products**, with localized display names, descriptions, and a
   review screenshot showing where the paywall lives.
4. **Set the price points** in section 2.1 and confirm the per-territory generated prices.
   Check a weak-currency market or two; Apple's automatic conversion can produce odd
   local prices.
5. **Configure the Plus annual 7-day free trial** as an introductory offer.
6. **Check the subscription status URLs**, so the existing server verification flow keeps
   receiving notifications for the new products.

---

## 7. Phases

### Phase 0 - Measure (before any pricing decision)

You already log per-request usage and Serper usage, and per-user daily tokens land in the
usage table. Pull 90 days and compute:

- p50 / p90 / p99 / p99.9 daily tokens per user, split by free and paid
- Tokens per AI turn, and turns per day, for each cohort
- Provider cost per 1M blended tokens, from real traffic rather than list prices
- Actual photo scans and searches per user per month, plus historical transcription
  volume if you want to judge whether restoring voice is worth it
- The share of free users currently hitting the 20k/day ceiling (distorted until the
  temporary `1e9` budget is restored, so restore it first)

Deliverable: the `C` value and the p99.9 usage numbers that set the caps in
`dailyTokenLimit`. No cap in this plan is real until this exists.

### Phase 1 - Ship Free + Plus (config + store)

- Restore `TRIAL_TOKENS_PER_DAY` to a real value
- Create App Store Connect products and the subscription group
- Publish the catalog JSON and reasoning policy
- Decide and implement grandfathering
- Define the Pro tier in the catalog and App Store Connect, but do not feature it in the
  paywall until Phase 3 or Phase 4 gives it a reason to exist
- Backend tests: entitlement mapping per product, cap enforcement, and the retired-ID
  fallback path

Acceptance: a new buyer in the App Store sandbox can subscribe to Plus, restore it on a
new device, and see the tier's model, reasoning effort, and daily cap match the catalog.
Pro is reachable in the sandbox for admin/test accounts only.

### Phase 2 - Make the tiers legible (client)

- Plan comparison view with feature lists, not token counts
- Replace token quota copy with AI turns remaining
- Upgrade/downgrade affordance in Settings, including "what changes at the next renewal"
- Paywall entry points at the moments of value: after the third photo scan, when the
  free daily budget runs out, and at the recipe search limit
- Entitlement-aware empty and error states

Acceptance: a user can explain the difference between the three tiers in one sentence
after five seconds on the comparison screen.

### Phase 3 - Optimize

- Run tests T1-T3 from section 2.4, one at a time
- Add win-back offers for churned Plus subscribers
- Add the Pro priority queue
- Review the free subsidy against the $0.30 target and adjust the free cap

### Phase 4 - Household (the real Pro value)

- Shared fridge and shopping list across household members
- Household seat limits per tier (e.g. Plus 1, Pro 5)
- Move Pro's reason to exist from "bigger caps" to "your household shares one pantry"
- Revisit the $9.99 ceiling only after this ships

---

## 8. Risks and honest counter-arguments

**The middle tier may cannibalize the top tier.** If Plus already includes photo chat and
search, many would-be Pro buyers stop at $6.99. Mitigation: the model and reasoning
quality gap must be real and visible in output quality, and Pro must carry the household
features. If Pro converts below roughly 1% of payers in practice, collapse to two tiers
rather than defending a tier nobody buys.

**The "unlimited" removal is the riskiest single change here.** Current Pro subscribers
were sold unlimited daily tokens. Measure before capping, and set the Pro cap at roughly
twice the highest legitimate daily usage you observe, so the change is invisible to
everyone except abusers.

**Tiers may not move revenue much.** The third tier is worth roughly a quarter of paid
revenue at realistic mixes, and the price revision is worth more than the extra tier. If
free-to-paid conversion is 1-2%, the correct next move is fixing onboarding and the
paywall moment, not adding tiers. This is why section 1 recommends launching Free + Plus
and holding Pro until it has a differentiator.

**The market may not support $49.99 from a new app.** The $39.99-$49.99 annual cluster is
real, but most of those apps have years of reviews, press, and brand. A brand-new
pantry/recipe app at $49.99/year is asking for the same money as SideChef and Plan to Eat.
If early conversion is weak, the first move is a launch discount on Plus annual, not a
permanent price cut - because raising a price later costs more than discounting it now.

**Your own BYO-AI feature competes with your top tier.** A user with an OpenAI key gets
unlimited AI for the price of tokens, which makes "more AI" a weak Pro pitch. Options:
leave BYO free (it is a cost hedge and serves a niche), move BYO behind Plus as a
power-user feature, or make Pro's value non-AI (household sharing, sync, priority). This
is the single biggest strategic decision in this document and it needs your call.

---

## 9. Decisions needed from you

1. Do you accept **$6.99 / $9.99 monthly with $49.99 / $79.99 annual**? The evidence
   supports $49.99/year as the mid-tier annual anchor, but it is a real jump from the
   $39.99 first draft and it asks a brand-new app to charge established-competitor money.
2. Do you accept **launching publicly with Free + Plus only**, holding Pro until household
   sharing or measured heavy usage justifies it? Every serious competitor sells one paid
   tier, and Pro currently has no differentiator that Plus cannot copy.
3. Can I run Phase 0 against the usage table and Serper records to produce `C` and the
   real p99.9 numbers? Without it every cap here is a guess.
4. Does BYO AI (own key / Apple Intelligence) stay free, or move behind Plus?
5. Should Family Sharing be enabled on Pro at creation, given it may be a create-time
   decision?
6. Do you want Pro's headline benefit to be answer quality (model + reasoning) at launch,
   with household sharing to follow, or do you want to wait to launch Pro until household
   sharing exists?
7. Do you want to restore voice input? It is currently disabled, it is nearly free to
   restore because the backend endpoint and the dependency are still in place, and without
   it Plus has only one capability differentiator (photo chat) beyond model quality and
   quota.
