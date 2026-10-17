# Pantrio Chinese Localization — Revision Plan

Status: **applied** (2026-10-07). The locale pass and the code pass are both in the
working tree — see [Applied notes](#applied-notes).

## Context

This plan comes from a review of `docs/PANTRIO_LOCALIZATION_EN_ZH.docx`, cross-checked
against the live files `locales/en.json` and `locales/zh.json`.

It also folds in a second review of the same string set
(`PANTRIO_LOCALIZATION_EN_ZH修改建议.docx`, author `db`): 45 Chinese edits, 7 English
edits, and 4 comments, all left unresolved. That review is taken by intention rather
than word for word — see section H.

What the review found:

- 1,005 keys in each file, identical key sets, no empty values.
- Zero placeholder mismatches (`{{name}}`-style tokens match exactly).
- No half-width punctuation in Chinese values, and no Traditional-form characters
  detected in the checks that were run.
- Register is consistent: informal 你 throughout, zero uses of 您.
- `_one` / `_other` plural keys correctly collapse to one Chinese form.

So the Chinese is in good shape. The work below is glossary consistency, a handful of
semantic mismatches, and typography — roughly 65 of 1,005 strings, about 6%.

## Decisions locked

| Concept | Decision |
| --- | --- |
| Entity noun | 食材 — the app is scoped to food, so 物品 and 东西 are retired from UI labels |
| `plan` | 套餐 |
| account | 账号 for app accounts; 账户 only for Apple 账户 |
| `provider` (AI) | AI 服务 |
| `provider` (sign-in) | 服务商 (different domain, left as is) |
| Storage labels | 冷藏 / 冷冻 / 储藏 |
| Hard exclusion | 不想看到 (label: 不想看到的食材) |
| "N more" | case-specific phrasing, four distinct render sites |
| Password length | Minimum stays 6; unit becomes 个字符 (not 位) |
| Kitchen wording | English keeps "kitchen"; Chinese uses noun-phrase tutorial titles (厨房一览 / 厨房管理) |
| Max recipe time | Soft limit everywhere: ranks lower, never excluded |
| Username update error | 用户名更新失败（{{status}}） |
| Search placeholder | 搜索食材名称… (no change to search behavior) |
| Quote marks | ASCII `"` |
| Navigation separator | `→` |

## A. Glossary sweeps (zh.json)

### Plan → 套餐 (8 strings)

| Key | Now | New |
| --- | --- | --- |
| `settings.availablePlans` | 可选方案 | 可选套餐 |
| `settings.availablePlansA11y` | 可用的订阅方案 | 可用的订阅套餐 |
| `settings.viewOrChangePlans` | 查看或更换方案 | 查看或更换套餐 |
| `settings.productUnavailable` | 该方案当前不可用。 | 该套餐当前不可用。 |
| `settings.noApplePlans` | 当前没有可用的订阅方案。 | 当前没有可用的订阅套餐。 |
| `subscriptions.couldNotLoadPlans` | 无法加载订阅方案。 | 无法加载订阅套餐。 |
| `subscriptions.planUnavailable` | 此订阅方案不适用于该账号。 | 此订阅套餐不适用于该账号。 |
| `tutorial.tabs.settings.categories.body` | 账号、订阅方案、偏好设置、隐私数据、AI 供应商。点任意一项进入详细设置。 | 账号、套餐与用量、偏好设置、隐私与数据、AI 服务。点任意一项进入详细设置。 |

The last row also fixes a real defect: the walkthrough named sections that do not match
the labels the user actually sees.

### Account → 账号 (7 strings)

| Key | Now | New |
| --- | --- | --- |
| `auth.forgotPasswordBody` | 请输入账户邮箱，我们会向你发送重置密码的链接。 | 请输入账号邮箱，我们会向你发送重置密码的链接。 |
| `auth.forgotPasswordSentMessage` | 如果 {{email}} 对应一个账户，… | 如果 {{email}} 对应一个账号，… |
| `auth.errorEmailInUse` | 该邮箱已被其他账户使用。 | 该邮箱已被其他账号使用。 |
| `auth.errorUserDisabled` | 该账户已被停用，请联系支持。 | 该账号已被停用，请联系支持。 |
| `auth.errorUserMismatch` | 该凭据属于其他账户。 | 该凭据属于其他账号。 |
| `auth.verifyEmailMessage` | …即使忘记密码也能找回账户。 | …即使忘记密码也能找回账号。 |
| `settings.emailNotVerifiedBody` | 验证该邮箱后，即使忘记密码也能找回账户。 | 验证该邮箱后，即使忘记密码也能找回账号。 |

Do **not** touch the five Apple 账户 strings: `account.manualAppleRevocationMessage`,
`settings.renewalFootnote`, `settings.purchasesLinkedNote`,
`settings.deleteAccountAlertMessage`, `settings.openSubscriptionsHint`.

### Provider → AI 服务 (8 strings)

| Key | Now | New |
| --- | --- | --- |
| `settings.apiProvider` | API 服务商 | AI 服务 |
| `settings.apiProviderPlaceholder` | 选择 API 服务商 | 选择 AI 服务 |
| `settings.providerInfoBody` | 各服务商的模型名和密钥…测试仅向服务商发送一次短请求… | 各 AI 服务的模型名和密钥…测试仅向 AI 服务发送一次短请求… |
| `settings.providerRejected` | 服务商拒绝了请求（{{status}}）。 | AI 服务拒绝了请求（{{status}}）。 |
| `settings.providerUnexpectedResponse` | 服务商返回了异常响应。 | AI 服务返回了异常响应。 |
| `settings.aiProviderUnreachable` | 无法连接该 AI 服务商。 | 无法连接该 AI 服务。 |
| `settings.myOwnAiApiDetail` | 使用 OpenAI 兼容服务商及你自己的密钥。 | 使用 OpenAI 兼容的 AI 服务及你自己的密钥。 |
| `settings.noChatCompletionsEndpoint` | …多数服务商需要 /v1 后缀。 | …多数 AI 服务需要 /v1 后缀。 |

Do **not** touch `settings.otherProvider`, `settings.privateRelay`, `settings.guest`,
`settings.organizationSso`. Those are sign-in identity providers, not AI providers
(`settings.js:424–442`).

The already-correct AI 服务 strings stay: `chat.errors.providerRequestFailed`,
`chat.errors.providerEmptyResponse`, `chat.errors.toolLimitExceeded`,
`settings.categories.aiProvider`, `settings.saveAiProvider`.

### Storage labels (2 keys + 1 string)

| Key | Now | New |
| --- | --- | --- |
| `fridge.fridge` | 冰箱 | 冷藏 |
| `tags.storage.fridge` | 冰箱 | 冷藏 |
| `tutorial.tabs.fridge.filterTabs.body` | 在全部、冰箱、冷冻、储物柜之间切换。… | 在全部、冷藏、冷冻、储藏之间切换。… |

`fridge.fridge` and `tags.storage.fridge` **must change together**. The tab filter at
`fridge.js:180` compares the translated tab label against the translated item storage
tag, so if only one side changes the Fridge tab silently stops filtering.

`fridge.freezer` / `tags.storage.freezer` (冷冻) and `fridge.pantry` /
`tags.storage.pantry` (储藏) are unchanged. `fridge.title` (🧊 我的冰箱) stays 冰箱 —
that is the appliance, not the compartment.

### Entity noun → 食材 (33 strings, from the second review)

Pantrio is scoped to food, so 食材 is the entity noun everywhere. This replaces the
earlier lean toward keeping 物品 for generic labels and supersedes the `shoppingList.*`
wording in section B.

物品 → 食材: `common.addItem`, `home.addItem`, `fridge.items`, `fridge.deleteItems`,
`shoppingList.thisItem`, `shoppingList.deleteItems`, `shoppingList.itemNamePlaceholder`,
`shoppingList.editItem`, `shoppingList.itemName`, `shoppingList.deleteItem`,
`messageList.streamlineSummary`, `messageList.confirmItems`, `inventoryItem.item`,
`inventoryItem.togglesSelection`, `inventoryItem.opensActions`,
`itemForm.itemNamePlaceholder`, `itemForm.titleAdd`, `itemForm.titleEdit`,
`itemForm.addItemTitle`, `itemForm.editItemTitle`, `selectionBar.selectItems`,
`selectionBar.selectAllItems`, `root.clearDeviceDataMessage`,
`settings.resetRecipePreferencesBody`, `settings.advancedThresholdsBody`,
`settings.resetDeviceDataAlertMessage`, `settings.deleteAccountAlertMessage`.

东西 → 食材: `fridge.findRecipesWithItems` (用冰箱里的食材做菜).

Count strings gain the noun: `home.itemsInFridge_one` / `_other` →
冰箱里有 {{count}} 件食材, and `home.onShoppingList` → 购物清单上有 {{count}} 件食材.

Two keys also carry search wording: `fridge.searchPlaceholder` and
`shoppingList.searchPlaceholder` are listed in section B with their final values.

### Hard exclusion → 不想看到 (4 strings)

Phrased as "don't show me recipes with these", not the stiff 排除 / 包含 family.

| Key | Now | New |
| --- | --- | --- |
| `settings.alwaysExcludeIngredients` | 必须排除的食材 | 不想看到的食材 |
| `settings.alwaysExcludeIngredientsHelp` | 推荐菜谱时不可出现的食材。 | 不要推荐带有以下食材的菜谱。 |
| `messageList.neverInclude` | 绝不包含 | 不想看到 |
| `recipePreferences.labels.excludedIngredients` | 必须排除 | 不想看到 |

`settings.alwaysExcludeIngredientsPlaceholder` (香菜、酒) is unchanged.
`settings.allergensHelp` still says 始终按排除项处理 — leave it or reword to 始终视为不想看到的食材
if you want the 排除 word gone entirely.

## B. Corrections and small pairs (zh.json)

| Key | Now | New | Reason |
| --- | --- | --- | --- |
| `auth.passwordMinLength` | 密码至少需要 6 位。 | 密码至少需要 6 个字符。 | Requirement statements use 个字符 |
| `auth.errorWeakPassword` | 密码强度不足，请至少使用 6 个字符。 | 请至少使用 6 个字符。 | 密码强度不足 is already the alert title (`auth.weakPassword`) |
| `settings.updateNameFailed` | 更新名字失败（{{status}}） | 用户名更新失败（{{status}}） | Every other string in that modal says 用户名 |
| `settings.subscriptionStatuses.activeGracePeriod` | 宽限期 | 订阅中（扣费宽限期） | EN says "Active — billing grace period"; the paying user must not look unsubscribed |
| `fridge.noMatches` | 没找到，换个关键词或分类试试。 | 没找到，换个关键词或标签页试试。 | EN says "tab"; there is no category picker on Fridge |
| `root.clearDeviceDataTitle` | 清除本机上的账号数据？ | 清除该账号的本机数据？ | "this account" was dropped |
| `root.clearDeviceDataA11y` | 永久删除待处理账号在本设备上的数据 | 永久删除待删除账号在本设备上的数据 | 待处理 is ambiguous in a deletion flow |
| `root.clearDeviceDataMessage` | 将永久删除待处理账号在本机上的… | 将永久删除待删除账号在本机上的… | same |
| `messageList.maximumTime` | 最多时间 | 时间偏好 | Soft limit; matches 做饭时间偏好 |
| `settings.urgencyPreset` | 默认：先吃 2 天 … | 预设：先吃 2 天 … | EN says "Preset", not default |
| `settings.customUrgencyThresholds` | 自定义紧急程度 | 自定义紧急程度阈值 | Sibling string is 高级过期阈值 |
| `settings.mealStyle` | 口味 | 餐食风格 | 清淡 / 均衡 / 丰盛 are meal styles, not flavours |
| `tutorial.tabs.home.greeting.title` | 一屏掌握厨房 | 厨房一览 | Noun-phrase style, matching db's intent without the fridge swap |
| `tutorial.tabs.chat.messages.title` | 问问你的厨房 | 厨房管理 | 问问你的冰箱 reads awkwardly; the noun phrase carries the app's intent |
| `settings.maxRecipeTime` | 最长做饭时间 | 做饭时间偏好 | Soft limit, so "maximum" overpromises |
| `settings.maxRecipeTimeHelp` | 可选硬性限制（总时长，分钟），留空则不限制。 | 可选的软性偏好（分钟）。超时的菜谱仍会推荐，只是排序更靠后；留空表示不限制。 | Soft limit everywhere |
| `recipePreferences.maxTimeNoLimit` | 最长做饭时间：不限制 | 做饭时间偏好：不限制 | Soft limit |
| `recipePreferences.maxTimeLine` | 最长做饭时间：{{count}} 分钟 | 做饭时间偏好：{{count}} 分钟 | Soft limit |
| `fridge.searchPlaceholder` | 搜索物品… | 搜索食材名称… | Fridge search matches the name field only (`fridge.js:178`) |
| `shoppingList.searchPlaceholder` | 搜索物品… | 搜索食材名称… | List search matches the name field only (`list.js:445`); food-only app |
| `itemForm.expirationDatePlaceholder` | 保质期（YYYY-MM-DD 或 MM/DD/YYYY） | 保质期（YYYY-MM-DD） | MM/DD/YYYY is not a zh-CN convention |
| `itemForm.dateMessage` | 选个日期，或直接输入（YYYY-MM-DD 或 MM/DD/YYYY）。 | 选个日期，或直接输入（YYYY-MM-DD）。 | same |
| `itemForm.dateValidMessage` | 日期格式不正确（YYYY-MM-DD 或 MM/DD/YYYY）。 | 日期格式不正确（YYYY-MM-DD）。 | same |

Note on `settings.mealStyle`: `settings.mealStyleA11y` ({{option}}口味偏好) can stay as
is, because 清淡口味偏好 reads naturally.

## C. "N more" — made case-specific

The generic 还有 {{count}} 件 does not fit every render site. Four sites, four phrasings:

| Site | Rendering | New ZH | New EN | Key |
| --- | --- | --- | --- | --- |
| Chat bubble 用这些做菜：… | inline suffix after a name list | ，还有 {{count}} 件食材 | (keep " +{{count}} more") | `fridge.more` |
| Found-items card | standalone line under item bullets | 还有 {{count}} 件物品… | …{{count}} more items | **new** `messageList.moreItems` |
| Bulk-changes card | standalone line under change bullets | 还有 {{count}} 项修改… | …{{count}} more changes | **new** `messageList.moreChanges` |
| Recipe card 已有食材 | inline suffix after a 已有食材 list | ，还有 {{count}} 样食材 | …{{count}} more | `messageList.recipes.haveMore` |

`messageList.more` is deleted. It is currently used for two unrelated cases
(`MessageList.js:90` found items, `MessageList.js:232` bulk changes).

Net key count moves from 1,005 to 1,006 in both files.

## D. Style sweep (zh.json)

Quote marks — all 「」 and “” become ASCII `"`. Sixteen keys:

`tutorial.tabs.home.replay.body`, `tutorial.tabs.fridge.searchBar.body`,
`tutorial.tabs.fridge.editButton.body`, `tutorial.tabs.list.items.body`,
`tutorial.tabs.list.editButton.body`, `tutorial.tabs.settings.replay.body`,
`shoppingList.deleteItemQuestion`, `chat.errors.apiKeyRequired`,
`chat.errors.modelRequired`, `conversations.deleteChatBody`,
`settings.advancedThresholdsBody`, `settings.resetTypeToConfirm`,
`settings.turnOnAppleIntelligenceAlertMessage`, `settings.appleIntelligenceNotEnabled`,
`errors.appleLinkTimedOut`, `errors.appleLinkFailed`.

Navigation separators become `→`:

| Key | New |
| --- | --- |
| `tutorial.tabs.home.replay.body` | 每个标签页只引导一次。想再看，去"设置 → 偏好设置 → 重看页面引导"。 |
| `chat.errors.apiKeyRequired` | 请在"设置 → 高级"中填写 API 密钥。 |
| `chat.errors.modelRequired` | 请在"设置 → 高级"中填写模型名称。 |
| `settings.advancedThresholdsBody` | 自定义物品何时标记为"先吃"或"尽快吃"等。 |

`account.manualAppleRevocationMessage` already uses `→`; no change.

Hygiene: `common.save` is defined twice in both JSON files. The first value is silently
dropped by the parser. Remove the duplicate.

## E. English source fixes (en.json)

| Key | Now | New |
| --- | --- | --- |
| `onboarding.welcome.title` | Welcome to Fridge Manager | Welcome to Pantrio |
| `settings.tokensLeft` | {{used}} of {{limit}} tokens left | {{used}} of {{limit}} tokens used |
| `messageList.moreItems` | — | {{count}} more items |
| `messageList.moreChanges` | — | {{count}} more changes |
| `settings.updateNameFailed` (optional) | Failed to update name ({{status}}) | Failed to update username ({{status}}) |
| `settings.maxRecipeTime` | Maximum recipe time | Preferred recipe time |
| `settings.maxRecipeTimeHelp` | Optional hard total-time limit in minutes. Leave blank for no maximum. | Optional soft preference in minutes. Longer recipes can still appear, just ranked lower. Leave blank for no preference. |
| `settings.maxRecipeTimePlaceholder` | No maximum | No preference |
| `recipePreferences.maxTimeNoLimit` | Maximum recipe time: No limit | Preferred recipe time: No limit |
| `recipePreferences.maxTimeLine` | Maximum recipe time: {{count}} minutes | Preferred recipe time: {{count}} minutes |
| `settings.alwaysExcludeIngredients` (optional) | Always exclude ingredients | Never include |
| `recipePreferences.labels.excludedIngredients` (optional) | Always exclude | Never include |
| `settings.alwaysExcludeIngredientsHelp` (optional) | Ingredients recipe recommendations must not contain. | Don't recommend recipes with these ingredients. |

`onboarding.welcome.title` is a stale pre-rename brand string. `settings.tokensLeft`
contradicts its own Chinese: EN says "left", ZH says 已用 (used), and the template
variable is named `used`.

`tutorial.tabs.home.greeting.title` and `tutorial.tabs.chat.messages.title` keep
"kitchen" in English, so db's two English edits there are dropped.

## F. Code touchpoints

| File | Line | Change |
| --- | --- | --- |
| `components/MessageList.js` | 90 | `messageList.more` → `messageList.moreItems` |
| `components/MessageList.js` | 232 | `messageList.more` → `messageList.moreChanges` |
| `components/RecipeResultCards.js` | 70 | Drop the hardcoded leading space; let each locale carry its own separator |
| `app/(tabs)/fridge.js` | 331 | Join the truncated ingredient list with 、 for zh instead of `", "` |
| `src/chat/recipeDishSearch.js` (backend repo) | 1007 | `violatesLimits` drops its `maxPrepMinutes` clause so the time ceiling stops filtering; keep calories and `maxIngredients` hard |
| `src/chat/recipeDishSearch.js` (backend repo) | 2467 | Add an `overTime` term to the score so over-time recipes rank lower, mirroring the existing `overLimit` penalty |

Without the `fridge.js` join fix, the new phrasing renders as
`鸡蛋, 牛奶, 番茄，还有 3 件食材` — an ASCII comma next to a full-width one.

The backend edit is what actually delivers "soft everywhere". Today dish search drops
over-time recipes via `applyLimits` while `recipeRecommendations.js` only penalises them
(`timeLimitPenalty`, capped at 0.2), so the same setting behaves differently depending on
which flow answers. Remove the filter, keep a ranking penalty, and the two paths agree.
The code comment above `violatesLimits` ("A stated ceiling is a filter, not a tunable
penalty") needs updating with it.

Optional: `MessageList.js` also joins skipped names with `", "` (已跳过：{{names}});
the same 、 treatment would apply.

## G. Verification after applying

1. Key parity and placeholder parity between `en.json` and `zh.json`.
2. No leftovers for: 方案, 服务商 (AI contexts), 账户 (app contexts), 位。,
   「」, “”, ` - `, ` > `, `+{{count}} 更多`, 必须排除 / 绝不包含, and — in UI labels —
   物品 / 东西.
3. `fridge.fridge === tags.storage.fridge` still holds as an exact string match.
4. Spot-render the four "N more" sites and the two search placeholders.
5. Open Settings → Plan, Recipe preferences, and the Fridge tab in zh to confirm the
   swept labels line up with their help text.
6. Set a short max recipe time and confirm over-time recipes still come back (ranked
   lower) from both the dish-search and recommendation flows.

## H. Review intake — db's markup

Source: `PANTRIO_LOCALIZATION_EN_ZH修改建议.docx` (author `db`, 2026-10-07).

### Adopted by intention, with corrected wording

| Key | His edit | What we ship | Why |
| --- | --- | --- | --- |
| `tutorial.tabs.fridge.addButton.body` | EN gains "You can add items by AI and by yourself."; ZH replaced with Shopping List copy | Keep the EN addition; ZH = 点加号记录新食材：名称、数量、存放位置、类型和保质期，输入时应用会自动推荐标签。也可以直接让 AI 帮你添加。 | His Chinese was `tabs.list.inputRow.body`, pasted into the wrong row |
| `tutorial.tabs.chat.attach.body` | "...add what it finds to your fridge list" | Reworked again later: the mystery container became your fridge, and 货架 → 置物架. Ships as 助手能看懂小票、置物架或你的冰箱，并把认出来的食材加入库存。 | 不知名 doesn't collocate with 保鲜盒, and 货架 means a store shelf, not a kitchen shelf |
| `onboarding.organized.body` | 盯紧保质期 → 注意保质期 | Adopt | Softer, equally clear |
| `onboarding.smartTags.body` | 不怕东西悄悄放坏 → 东西不至悄悄放坏 | 东西不至于悄悄放坏 | 不至 is a broken idiom |
| `chat.chatDescription` | 清单怎么安排 → 把什么加入购物清单 | Adopt | More actionable |
| `messageList.recipes.stepsNone` | 结构化做法步骤 → 做法步骤 | Adopt | Simpler; "structured" was internal jargon |
| `account.pendingAppleRevocationMessage` | 不会影响 App Store 订阅 → 删除账户不会取消 App Store 订阅 | 删除账号不会取消 App Store 订阅。 | Matches EN; uses 账号 per our glossary |
| `settings.deleteAccountAlertMessage` | adds 以免被继续扣费 | Adopt in both languages | States the consequence of not cancelling |

### Rejected, with his intent noted

| Item | Why |
| --- | --- |
| Chat tutorial bodies swapped | His two lines were exchanged into the matching cards, evaluated, and then reverted; our copy ships. See "Evaluation: his two chat lines, exchanged into the matching cards" in [chinese-localization-comparison.md](chinese-localization-comparison.md). The exchange fixes the placement, but his wording drops the inventory/shopping-list capability and the confirm-before-applying behaviour. |
| `Ask about your fidge` / 冰箱管理 | The typo and the fridge swap are dropped, but the noun-phrase style is adopted with 厨房 kept: 厨房管理 here and 厨房一览 for `tutorial.tabs.home.greeting.title`. |
| 您 in two new strings | Would be the only formal-register copy in the app; the file currently has 0 您 and 29 你. |
| Full-width comma in English: `meal ideas and recipes， ask` | English punctuation. |
| `Pantrio 的助手` → `Pantrio 助手` | Adopted: without 的 it reads as a name in Chinese, which you preferred. Applied to `onboarding.aiDisclosure` and `chat.aiNotice`. |

### Comment triage

| Comment | Resolution |
| --- | --- |
| Your kitch 还是 your firdge？ | Resolved: English keeps "kitchen"; Chinese takes the noun-phrase style (厨房一览 / 厨房管理). |
| 现在基本都要求8位 | Resolved: the minimum stays 6; only 位 → 个字符 changes. |
| 这句话我总觉得是说反了 (incognito) | Not reversed. `shouldPersistChat` gates persistence, and `shouldClearChatOnIncognitoExit` calls `resetConversations()`, so the sentence matches the code. Optional clarity rewrite: 无痕模式下新聊天记录不会保存到本机；关闭无痕模式后，这段对话会被清除。 |
| 建议作为软性限制。quick recipe是不是过滤掉很多菜谱。 | Adopted: max recipe time becomes a soft limit in both backend paths, and the copy is reworded. |

Chat tutorial bodies: his two lines were exchanged into the matching cards, evaluated on
request, then reverted. The exchange is the right structure; his wording is weaker than
ours, so ours ship. See
[chinese-localization-comparison.md](chinese-localization-comparison.md) for the walkthrough.

## Change budget

| Area | zh changes | en changes | code files |
| --- | --- | --- | --- |
| Glossary sweeps | 26 | 0 | 0 |
| Entity noun → 食材 | 33 | 0 | 0 |
| Hard exclusion → 不想看到 | 4 | 3 optional | 0 |
| Kitchen titles | 2 | 0 | 0 |
| Max-time copy (soft limit) | 4 | 5 | 0 |
| Corrections and small pairs | 15 | 1 | 0 |
| "N more" | 5 (+2 new keys, −1 key) | 3 (+2 new keys, −1 key) | 3 |
| Style sweep | 16 | 0 | 0 |
| Hygiene (duplicate `common.save`) | 1 removed | 1 removed | 0 |
| Review intake, content | 7 | 2 | 0 |
| **Total** | **≈113** | **≈16** (four optional) | **4** (one in the backend repo) |

Nothing is pending. Optional rows in section E are English-side consistency cleanups
rather than requirements.

## Applied notes

Landed 2026-10-07.

Locale files (`locales/zh.json`, `locales/en.json`):

- 1006 keys in each, identical key sets, placeholder parity clean, no empty values.
- `messageList.more` was replaced by `messageList.moreItems` / `messageList.moreChanges`
  and the duplicate `common.save` entry was removed, so the key count moved 1005 → 1006.
- Two strings were corrected mid-pass against the food-only decision:
  `messageList.moreItems` ships 还有 {{count}} 件食材… (not 件物品…) and
  `recipePreferences.visibleMore` now reads {{visible}}（另有 {{count}} 项）, which the
  plan had missed.
- The only remaining 服务商 is `settings.otherProvider`, which is a sign-in label.

Code:

- New `utils/localeList.js` (`joinList`) supplies the locale separator — 、for zh, `, `
  for en. Used by `app/(tabs)/fridge.js`, `components/MessageList.js`, and
  `utils/recipePreferences.js` so Chinese lists no longer render with ASCII commas.
- `components/RecipeResultCards.js` no longer prepends a hardcoded space; the leading
  space now lives in the English string.
- Backend `src/chat/recipeDishSearch.js`: `violatesLimits` no longer filters on
  `maxPrepMinutes`, and `scoreRecipe` gained an `overTime` term (−0.15) so over-time
  recipes still surface, ranked lower. This makes dish search agree with
  `recipeRecommendations.js`, which was already soft.
- `tests/recipePreferences.test.js` expectation updated to the new copy
  ("Preferred recipe time: No limit").

Test state after the change: the app suite is 220/221. The one failure,
`tests/aiProviderSlotComparison.test.js`, imports `refactor/aiProviderSlotModel.js`,
which does not exist in this checkout — pre-existing and unrelated. The backend suite is
385/387; `recipeIntegration.test.js` "forwards the parity payload" fails because `.env`
sets `RECIPE_IDEATION=true` while the test expects `ideationEnabled === false`, and
`sessionService.test.js` fails on a quota-limit mismatch. Both are environment/config
driven and predate this change.
