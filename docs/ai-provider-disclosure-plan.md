# Vendor-neutral AI disclosure — swap sheet

Status: prepared, not applied. The published pages still name OpenAI.
Prepared: 2026-10-05

## Why this file exists

The Privacy Policy currently names OpenAI in three places and the Sub-processors page
names it in one. That is accurate today, but it means switching the hosted AI provider
forces an edit to the legal pages.

This file holds the vendor-neutral replacement text so the switch becomes a mechanical
find-and-replace instead of a rewrite. Apply it when you change providers, or earlier if
you decide to stop naming providers at all.

## Why category-level disclosure is sufficient

Naming the vendor is optional. Every regime that applies asks for categories:

* GDPR Art. 13(1)(e) — "the recipients **or categories of recipients** of the personal data".
* GDPR Art. 15(1)(c) — the access right uses the same "or categories" phrasing.
* CCPA/CPRA — "categories of third parties" to whom personal information is disclosed.
* Apple App Privacy — data types and purposes only; vendors are never declared.

Apple's Guideline 5.1.2(i) does require that you "clearly disclose where personal data
will be shared with third parties, including with third-party AI, and obtain explicit
permission before doing so." That obligation is about disclosing the *sharing*, not the
vendor's identity, so a precise category satisfies it. Describe the destination
concretely ("a third-party AI model provider in the United States") rather than vaguely
("third parties").

## Edit 1 — Privacy Policy, section 3 table

File: `privacy-policy.html`, the "Pantrio Cloud AI" row (~line 378).

Current:

```html
                  <td>Pantrio's hosted backend, which calls OpenAI</td>
```

Replacement:

```html
                  <td>Pantrio's hosted backend, which calls a third-party AI model provider</td>
```

Leave the "My own AI API" row alone. "OpenAI-compatible" there describes a wire format
the user's own provider must speak, not a processor Pantrio selects.

## Edit 2 — Privacy Policy, section 4 provider table

File: `privacy-policy.html`, the OpenAI row (~lines 413-415).

Current:

```html
                <tr>
                  <td><a href="https://openai.com/policies/privacy-policy/" rel="noopener noreferrer">OpenAI</a></td>
                  <td>AI processing for Pantrio Cloud AI</td>
                  <td>Prompts, messages, photos attached to a chat, related context, and generated responses.</td>
                </tr>
```

Replacement:

```html
                <tr>
                  <td>Third-party AI model provider</td>
                  <td>AI processing for Pantrio Cloud AI</td>
                  <td>Prompts, messages, photos attached to a chat, related context, and generated responses.</td>
                </tr>
```

Dropping the link is the point: a link to one vendor's policy is the thing that goes
stale on a switch.

## Edit 3 — Privacy Policy, section 4 training sentence

File: `privacy-policy.html` (~line 395). This is the load-bearing sentence, because it is
the answer to "is my fridge data training someone's model."

Current:

```html
          <p>Pantrio does not use your AI prompts, responses, or attached photos to train its own AI models. OpenAI states that content sent through its API is not used to train OpenAI models by default unless the API customer affirmatively opts in. Other providers apply their own terms. Do not include passwords, payment details, government identifiers, medical information, or other highly sensitive information in an AI request or an attached photo.</p>
```

Replacement:

```html
          <p>Pantrio does not use your AI prompts, responses, or attached photos to train its own AI models. Pantrio selects AI providers whose API terms state that customer content is not used to train their models by default. A provider may retain requests for a limited period, typically for abuse monitoring, safety review, or legal compliance, and may retain them longer where the law requires it. Do not include passwords, payment details, government identifiers, medical information, or other highly sensitive information in an AI request or an attached photo.</p>
```

Note the wording is deliberately "whose API terms state" and "for a limited period". Both
phrases are true of the paid APIs this app would realistically use, and neither pins you
to a vendor.

## Edit 4 — Sub-processors page

File: `subprocessors.html`, the OpenAI row (~lines 43-46).

Current:

```html
                <tr>
                  <td><a href="https://openai.com/policies/privacy-policy/" rel="noopener noreferrer">OpenAI</a></td>
                  <td>AI processing for Pantrio Cloud AI, including tool rounds and request summarization</td>
                  <td>Prompts, chat messages, attached photos, fridge and list context, saved recipe preferences, and generated responses</td>
                  <td>United States, with OpenAI's global infrastructure</td>
                </tr>
```

Replacement:

```html
                <tr>
                  <td>Third-party AI model provider (identity available on request)</td>
                  <td>AI processing for Pantrio Cloud AI, including tool rounds and request summarization</td>
                  <td>Prompts, chat messages, attached photos, fridge and list context, saved recipe preferences, and generated responses</td>
                  <td>United States</td>
                </tr>
```

Keep the row rather than deleting it. The page's own header says it lists the third-party
services that process information for Pantrio, so an omitted entry would make the page
misleading rather than merely non-specific. "Identity available on request" is what keeps
it honest.

## Edit 5 — add the equal-protection confirmation

This is a gap today, independent of the vendor question. Apple Guideline 5.1.1(i) requires
the policy to confirm that third parties receiving user data provide the same protection
Apple requires. Append to section 5, "How We Share Information", after the list that ends
"with your direction or consent."

```html
          <p>Where Pantrio shares information with third-party service providers, Pantrio requires those providers to protect it under terms that provide the same or equal protection as described in this policy.</p>
```

## Edit 6 — Privacy Policy, section 6 vendor roll-call

File: `privacy-policy.html` (~line 472). The advertising section names the AI provider in
passing, so it goes stale on a switch too.

Current:

```html
          <p>Pantrio does not combine information collected from the Service with information from other companies' apps, websites, or offline properties for targeted advertising or advertising measurement. Pantrio does not share information with data brokers and does not use Sentry, Firebase, OpenAI, Apple, or Serper for cross-app advertising tracking.</p>
```

Replacement:

```html
          <p>Pantrio does not combine information collected from the Service with information from other companies' apps, websites, or offline properties for targeted advertising or advertising measurement. Pantrio does not share information with data brokers and does not use any of its service providers for cross-app advertising tracking.</p>
```

## What does not change

* The Apple Intelligence rows, and every other provider row — Apple, Google/Firebase,
  Serper, Sentry, Expo, hosting.
* The in-app provider picker. The preset endpoints (OpenAI, OpenRouter, Groq, Together)
  are user-supplied BYO-AI destinations, not Pantrio's processor.
* The App Privacy answers in App Store Connect. They declare data types and purposes and
  never name vendors, so a switch does not touch them.
* The Terms of Use. Section 10 already says "our AI providers" and needs no edit.

## Vendor-selection checklist

Applying this file turns the policy sentence into a promise, so a switch now has a test.
Derived from the provider comparison dated 2026-10-05; verify against the provider's
current primary documentation before relying on it.

| Check | Why it matters |
| --- | --- |
| Paid API terms, not a free tier | Google's unpaid Gemini tier has materially weaker terms and data can be impossible to delete individually |
| No training on API content by default | True by default for OpenAI, Anthropic commercial, Google paid/Vertex, Azure OpenAI, Bedrock, xAI, Groq, Fireworks, Together, Meta Llama API |
| Retention compatible with "a limited period" | Most sit at up to 30 days for abuse monitoring; Anthropic "Covered Models" and Bedrock's `aws_review` impose mandatory retention even under ZDR |
| Provider acts as a processor, not an independent controller | A category disclosure is weakest where the recipient is itself a controller |
| No aggregator unless the upstream is pinned | A gateway's promise cannot override the model host's policy |

Known traps worth remembering:

* ZDR is not "nothing is ever stored" — every provider has endpoint and feature exceptions.
* A legal hold can override a contractual deletion promise; OpenAI's 2025 New York Times
  preservation order is the worked example. Keep the "where the law requires it" carve-out.
* Self-hosting an open-weight model removes the vendor from the inference path entirely,
  which would let this section shrink to "processed on our own servers."

## On request handling

Keep a private, current record of which provider is live and when it changed. Categories
satisfy Art. 13 and Art. 15 on paper, but if someone asks directly which company processed
their data, "we don't publish it, here it is on request" is the defensible posture. Refusing
to answer entirely is a worse position than the disclosure this file is designed to avoid.

Two other placeholders on the same pages still need resolving before launch and are
unrelated to this file: `[SUPPORT EMAIL]` and the hosting rows.
