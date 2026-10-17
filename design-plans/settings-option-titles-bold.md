# Settings: make every option title black + bold

Written against: `8615c7b`, on the current working tree (which already carries unrelated in-flight edits, including to `app/(tabs)/settings.js`, `locales/en.json`, and `locales/zh.json`). Do not reset to `HEAD`.

## Goal

Every settings option title should read the same as the option titles under **Recipe suggestions**: near-black and bold. Today the Recipe-suggestions option titles are bold while the option titles in the other Settings screens (Language, Replay page tutorials, Appearance rows, Notifications rows, etc.) render at the default (regular) weight, which is what makes the screen look inconsistent.

## Evidence chain

All references are `app/(tabs)/settings.js` unless noted.

- **The reference treatment (Recipe suggestions option titles).**
  - `accountCardTitle` at `:3840-3844` = `fontSize`, `fontWeight: "700"`, `color: theme.textPrimary`.
  - Used by the section copy `:2900` (`settings.recipeProfile`) and `:2999` (`settings.mealStyle`), and by the shared editors' labels at `:239` (`PreferenceListEditor`) and `:292` (`NumberPreferenceEditor`). So every Recipe-suggestions option title goes through one bold style.
- **The generic option title (everything else).**
  - `label` at `:4047-4050` = `fontSize`, `color: theme.textPrimary`, and **no `fontWeight`** -> renders at the default weight.
  - This single style is used by 17 visible option rows (enumerated below). This is the core of the change.
- **Colors are already "black".**
  - `context/GlobalContext.js:125-127` (light) / `:149-151` (dark): `textPrimary` = `#333` / `#f5f5f5`, `textSecondary` = `#666` / `#aaa`.
  - `label`, `inputLabel`, and `languageOptionLabel` already use `theme.textPrimary`. The Recipe-suggestions titles use the exact same token. So the only real gap is weight, not color.
- **Two other option-title styles are only semi-bold (600).**
  - `inputLabel` at `:4112-4118` (`fontWeight: "600"`) - the four field labels in Preferences -> Advance/Advanced -> "My own AI": API provider `:3482`, API URL `:3503`, Model `:3527`, API key `:3541`.
  - `languageOptionLabel` at `:4099-4103` (`fontWeight: "600"`) - the rows inside the Language picker modal `:3296`.
- **No tests constrain these styles.** `tests/` has no assertion on Settings fonts (the only Settings-related test, `tests/tabTutorials.test.js`, checks tutorial ids only).

## Rows that get fixed by bolding `label`

`settings.language` `:2735`, `settings.replayTutorials` `:2762` (the two called out in the original report); `settings.useSystemTheme` `:2785`, `settings.darkMode` `:2811`, `settings.chatgptStyleChat` `:2837`, `settings.fontSizeLabel` `:2860`; `settings.dailyReminders` `:3118`, `settings.expirationAlerts` `:3144`, `settings.notify`/days `:3167`, `settings.customUrgencyThresholds` `:3199`; `settings.incognitoMode` `:3326`; `settings.selectAi` `:3403`; and the urgency-slider labels `:1647`, `:1664`, `:1687`, `:1710`, `:1736`.

(`:1636`, the "urgency thresholds" heading, already applies an inline `fontWeight: "700"` on top of `label`, so bolding `label` only removes a now-redundant override there.)

## What stays as-is (and why)

- Secondary / helper text keeps the grey `theme.textSecondary`: `value` `:4052`, `helpText` `:4205`, `accountCardSubtitle` `:3845`, `subscriptionDetailLabel` `:3925`, `menuSectionLabel` `:3984`, `applePlanDescription` `:3998`, `securityText` `:4210`.
- The selectable chips (`preferenceChoiceText` `:4156`) stay `600` + secondary, with the accent color for the selected chip.
- Collapsible headers (`sectionHeaderLabel` `:3754`, `600`) and main-menu categories (`sectionTitle` `:3722`, `600`) stay as they are: the Recipe-suggestions header itself is `600`, so these already match the reference. These are section headers, not options.

## Plan

1. **Bold the generic option title** - `app/(tabs)/settings.js:4047-4050`.
   Add `fontWeight: "700"` to the `label` style object (keep `fontSize` and `color: theme.textPrimary`). This is the one change that fixes the reported inconsistency and all 17 rows above.

2. **Align the two remaining option-title styles to 700** - `:4116` and `:4101`.
   Change `inputLabel` `fontWeight: "600"` -> `"700"`, and `languageOptionLabel` `fontWeight: "600"` -> `"700"`, so "all options" are literally bold. (If a lighter field label is preferred in Advanced -> My own AI, drop the `inputLabel` bump and note it - it is the only debatable one.)

3. **Raise the container headers to 700 too** - `sectionTitle` `:3722` and `sectionHeaderLabel` `:3754` (both `600`).
   Keeping headers at `600` while option titles became `700` would have made each section header lighter than the options it contains (a parent-lighter-than-child inversion). One weight for every title; hierarchy is carried by size (`fontSize + 1` for headers) and position instead. This is the shipped decision.

4. **Do not touch the color token.** Matching the Recipe-suggestions reference means using `theme.textPrimary` (`#333`), which is what `label` already uses. If a true `#000` is wanted instead, that is a separate decision that changes the shared token in `context/GlobalContext.js:125` and affects the whole app - flag rather than assume.

5. **Remove the now-redundant override** at `:1636-1640`: the inline `fontWeight: "700"` on the urgency-thresholds heading became a no-op once `label` is bold, so it was collapsed to `[stylesWithFont.label, { marginBottom: 10 }]`.

## Implementation status (done)

Shipped in the working tree: `label`, `sectionTitle`, `sectionHeaderLabel`, `inputLabel`, and `languageOptionLabel` are all `fontWeight: "700"` + `theme.textPrimary`; the inline slider values (`eatFirst` / `useSoon` / `lastsWhile` / `longKeeper` / `fontSize` / `notify`) were split into nested `value` texts; `value` now pins `fontWeight: "400"` so React Native's nested-`Text` inheritance cannot re-bold a value inside a bold title. `npm run lint` is clean (0 errors); `npm test` passes 260/261, the single failure being the pre-existing, unrelated `tests/aiProviderSlotComparison.test.js` (imports a non-existent `refactor/aiProviderSlotModel.js`).

## Verification

- `npm test` (runs `node scripts/run-unit-tests.cjs`) - confirm nothing regressed.
- `npm run lint` (`expo lint`).
- Manual pass over Settings -> Preferences (Language, Replay page tutorials), Appearance, Notifications, Privacy, Advanced, and Account, plus the Language picker modal, confirming every option title renders bold `#333` while helper/value text stays grey.
- Sanity-check the two rows from the original report side-by-side with Recipe suggestions to confirm they now match.
