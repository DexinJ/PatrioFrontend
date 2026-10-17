# App Store Pricing Research Prompt

Copy everything inside the code fence below into an AI with live internet access.
It is written to be self-contained, so it does not need any other Pantrio context.

```
You have live internet access. Research current, real App Store pricing for apps
comparable to mine, and do not guess or fill gaps from memory.

## What my app is

"Pantrio" is an iOS app (US App Store, launching soon) that combines:
- Fridge / freezer / pantry inventory tracking with expiration dates
- A shopping list
- An AI assistant for meal ideas, recipe search, and "what can I cook with this?"
- Photo input: the user photographs a fridge shelf or grocery haul, and AI recognizes
  the items
- Expiration reminders via push notifications

It is a household utility, not a professional tool. It is a subscription app. I am
deciding whether to move from one paid tier to a three-tier structure
(Free / mid / top) and I need to know what the market actually charges today.

## What I need

Research the CURRENT pricing (check the App Store listing, the developer's pricing
page, and the in-app paywall if reports of it exist) for at least 20 comparable apps
across these categories:

1. Fridge / pantry / food-waste trackers
   Seeds: NoWaste, Kitche, Fridgely, Cozzo, Yuka, FoodKeeper, Olio
2. Recipe managers and cookbook apps
   Seeds: Paprika, Recipe Keeper, Mela, Crouton, Pestle, Kitchen Stories, SideChef
3. Meal planning and grocery-list apps
   Seeds: Mealime, AnyList, Plan to Eat, Samsung Food (formerly Whisk), Yummly,
   Cozi, OurHome, Bring!, Listonic
4. AI cooking / AI food assistants
   Seeds: Samsung Food AI, SideChef AI, DishGen, and any AI recipe or AI meal-plan
   apps that appeared or were updated in 2025-2026
5. AI app price anchors for context (not competitors, but they set user expectations)
   Seeds: ChatGPT (Free/Plus/Pro), Perplexity, Google Gemini, Microsoft Copilot

Include any other app you find in these categories with meaningful US downloads, even
if it is not in the seed list. Add competitor names you discover — the seed list is a
starting point, not a boundary.

## For every app, report

- App name, developer, App Store URL
- US App Store price points: monthly, annual, weekly, lifetime (whichever exist)
- The annual discount versus paying monthly, as a percentage
- Free tier: what it includes and what its actual limit is (messages, scans, items,
  recipes per day or month)
- How many paid tiers exist, and each tier's name
- What is gated behind each paid tier (features, limits, model access, ads)
- Free trial: length, and whether it applies to monthly, annual, or both
- Whether AI is included in the subscription, and how AI usage is limited
- Whether Family Sharing is offered
- Date you verified the price, and the source URL you verified it from

## Output format

1. A single comparison table, one row per app, sorted by annual price ascending.
2. A short section per app (2-3 sentences) capturing anything the table cannot show,
   such as "annual only", "AI costs extra credits", or "price changed in 2026".
3. A summary answering:
   - What is the typical monthly price for a mid tier in this category?
   - What is the typical annual price, and what discount is normal?
   - What is the realistic ceiling for a consumer food app in the US App Store?
   - How many tiers do most of these apps actually use?
   - What do apps in this category typically put in the middle tier versus the top tier?
   - Do any of them charge for AI usage separately from the subscription?
   - Is there a common price under $5 that still supports a paid tier?
4. A recommendation section: given the above, what price would you set for a mid tier
   and a top tier for a US fridge/pantry AI app, and why.

## Rules

- Prices must be current as of your search date. State that date explicitly.
- If a price is not publicly visible (in-app paywall only, or region-locked), say
  "not publicly verifiable" rather than estimating. Do not invent numbers.
- Distinguish clearly between: price shown on the App Store listing, price shown on the
  developer's website, and price reported by a third party (blog, review, Reddit).
  Third-party reports must be labeled as such and dated.
- If an app has changed its pricing recently, note both the old and new price and when
  the change happened.
- Prefer primary sources: the App Store listing page, App Store Connect data exposed
  publicly, and the developer's own pricing page.
- If you cannot reach a source, say so instead of substituting a similar app.
- End with a "confidence and gaps" section listing what you could not verify.
```

## Notes on using it

- Ask for at least 20 apps. Smaller lists tend to return the same four apps everyone
  cites and miss the AI-first entrants that matter most for this decision.
- The category-5 anchors matter because they set what users think an "AI subscription"
  costs. ChatGPT Plus at $20 is the number in a buyer's head when they see $9.99.
- Treat the AI's recommendation as an input, not an answer. The price that is right for
  Pantrio still depends on the measured blended token cost described in Phase 0 of
  `pricing-tiers-plan.md`.
