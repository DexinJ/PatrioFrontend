# Pantrio ZH localization — original vs reviewer vs shipped

Three-way comparison for every string either the reviewer or this pass touched.

- **Original** — the string before either review (`docs/PANTRIO_LOCALIZATION_EN_ZH.docx`, which matched `locales/*.json`).
- **Reviewer (db)** — his edit in `PANTRIO_LOCALIZATION_EN_ZH修改建议.docx`. `—` means he left the line alone.
- **Shipped** — the value now in `locales/zh.json` / `locales/en.json`.
- Only lines that one of the two sides changed are listed. Where he changed a line and we ship
  something different, the Reason column says why.

## Summary

- Chinese: 113 rows — he changed 1 that we did not, we changed 68 he did not, 44 both.
- English: 18 rows — he changed 3 that we did not, we changed 11 he did not, 4 both.
- Not in these tables: the duplicate `common.save` key (removed, both files) and the
  `messageList.more` split into `moreItems` / `moreChanges` (our change alone).

## Chinese

| Key | Original | Reviewer (db) | Shipped | Reason |
| --- | --- | --- | --- | --- |
| `account.pendingAppleRevocationMessage` | 账号删除已受理，服务器将自动重试解绑 Apple 登录。若未成功，可在上述路径手动停止使用，不会影响 App Store 订阅。 | 账号删除已受理，服务器将自动重试解绑 Apple 登录。若未成功，可在上述路径手动停止使用。删除账户不会取消 App Store 订阅。 | 账号删除已受理，服务器将自动重试解绑 Apple 登录。若未成功，可在上述路径手动停止使用。删除账号不会取消 App Store 订阅。 | Took his fuller sentence but used 账号; 账户 stays only for Apple 账户 |
| `auth.errorEmailInUse` | 该邮箱已被其他账户使用。 | — | 该邮箱已被其他账号使用。 | — |
| `auth.errorUserDisabled` | 该账户已被停用，请联系支持。 | — | 该账号已被停用，请联系支持。 | — |
| `auth.errorUserMismatch` | 该凭据属于其他账户。 | — | 该凭据属于其他账号。 | — |
| `auth.errorWeakPassword` | 密码强度不足，请至少使用 6 个字符。 | — | 请至少使用 6 个字符。 | — |
| `auth.forgotPasswordBody` | 请输入账户邮箱，我们会向你发送重置密码的链接。 | — | 请输入账号邮箱，我们会向你发送重置密码的链接。 | — |
| `auth.forgotPasswordSentMessage` | 如果 {{email}} 对应一个账户，重置密码的链接正在发送中。若几分钟内没有收到，请检查垃圾邮件文件夹。 | — | 如果 {{email}} 对应一个账号，重置密码的链接正在发送中。若几分钟内没有收到，请检查垃圾邮件文件夹。 | — |
| `auth.passwordMinLength` | 密码至少需要 6 位。 | — | 密码至少需要 6 个字符。 | — |
| `auth.verifyEmailMessage` | 我们已向 {{email}} 发送验证链接。完成验证后，即使忘记密码也能找回账户。 | — | 我们已向 {{email}} 发送验证链接。完成验证后，即使忘记密码也能找回账号。 | — |
| `chat.aiNotice` | Pantrio 的助手由 AI 系统生成答案，可能出现错误，也不构成食品安全建议。 | — | Pantrio 助手由 AI 系统生成答案，可能出现错误，也不构成食品安全建议。 | — |
| `chat.chatDescription` | 问问 Pantrio：今天吃什么、冰箱里还有什么、清单怎么安排。 | 问问 Pantrio：今天吃什么、冰箱里还有什么、把什么加入购物清单。 | 问问 Pantrio：今天吃什么、冰箱里还有什么、把什么加入购物清单。 | — |
| `chat.errors.apiKeyRequired` | 请在“设置 > 高级”中填写 API 密钥。 | — | 请在"设置 → 高级"中填写 API 密钥。 | — |
| `chat.errors.modelRequired` | 请在“设置 > 高级”中填写模型名称。 | — | 请在"设置 → 高级"中填写模型名称。 | — |
| `common.addItem` | 添加物品 | 添加食材 | 添加食材 | — |
| `conversations.deleteChatBody` | 将永久删除「{{title}}」及其图片，此操作无法撤销。 | — | 将永久删除"{{title}}"及其图片，此操作无法撤销。 | — |
| `errors.appleLinkFailed` | 无法绑定“通过 Apple 登录”。 | — | 无法绑定"通过 Apple 登录"。 | — |
| `errors.appleLinkTimedOut` | 绑定“通过 Apple 登录”超时。 | — | 绑定"通过 Apple 登录"超时。 | — |
| `fridge.deleteItems` | 删除物品 | 删除食材 | 删除食材 | — |
| `fridge.findRecipesWithItems` | 用冰箱里的东西做菜 | 用冰箱里的食材做菜 | 用冰箱里的食材做菜 | — |
| `fridge.fridge` | 冰箱 | — | 冷藏 | — |
| `fridge.items` | 物品 | 食材 | 食材 | — |
| `fridge.more` | +{{count}} 更多 | — | ，还有 {{count}} 件食材 | — |
| `fridge.noMatches` | 没找到，换个关键词或分类试试。 | — | 没找到，换个关键词或标签页试试。 | — |
| `fridge.searchPlaceholder` | 搜索物品… | 搜索食材… | 搜索食材名称… | His 搜索食材… is shorter; shipped 搜索食材名称… because the field matches the name only |
| `home.addItem` | 添加物品 | 添加食材 | 添加食材 | — |
| `home.itemsInFridge_one` | 冰箱里有 {{count}} 件 | 冰箱里有 {{count}} 件食材 | 冰箱里有 {{count}} 件食材 | — |
| `home.itemsInFridge_other` | 冰箱里有 {{count}} 件 | 冰箱里有 {{count}} 件食材 | 冰箱里有 {{count}} 件食材 | — |
| `home.onShoppingList` | 购物清单上有 {{count}} 件 | 购物清单上有 {{count}} 件食材 | 购物清单上有 {{count}} 件食材 | — |
| `inventoryItem.item` | 物品 | 食材 | 食材 | — |
| `inventoryItem.opensActions` | 打开物品操作。 | 打开食材操作。 | 打开食材操作。 | — |
| `inventoryItem.togglesSelection` | 切换这件物品的选择状态。 | 切换这件食材的选择状态。 | 切换这件食材的选择状态。 | — |
| `itemForm.addItemTitle` | 添加物品 | 添加食材 | 添加食材 | — |
| `itemForm.dateMessage` | 选个日期，或直接输入（YYYY-MM-DD 或 MM/DD/YYYY）。 | — | 选个日期，或直接输入（YYYY-MM-DD）。 | — |
| `itemForm.dateValidMessage` | 日期格式不正确（YYYY-MM-DD 或 MM/DD/YYYY）。 | — | 日期格式不正确（YYYY-MM-DD）。 | — |
| `itemForm.editItemTitle` | 编辑物品 | 编辑食材 | 编辑食材 | — |
| `itemForm.expirationDatePlaceholder` | 保质期（YYYY-MM-DD 或 MM/DD/YYYY） | — | 保质期（YYYY-MM-DD） | — |
| `itemForm.itemNamePlaceholder` | 物品名称 | 食材名称 | 食材名称 | — |
| `itemForm.titleAdd` | 添加新物品 | 添加新食材 | 添加新食材 | — |
| `itemForm.titleEdit` | 编辑物品 | 编辑食材 | 编辑食材 | — |
| `messageList.confirmItems` | 确认物品 | 确认食材 | 确认食材 | — |
| `messageList.maximumTime` | 最多时间 | — | 时间偏好 | — |
| `messageList.neverInclude` | 绝不包含 | — | 不想看到 | — |
| `messageList.recipes.haveMore_one` | +{{count}} 更多… | — | ，还有 {{count}} 样食材 | — |
| `messageList.recipes.haveMore_other` | +{{count}} 更多… | — | ，还有 {{count}} 样食材 | — |
| `messageList.recipes.stepsNone` | 发布者未提供结构化做法步骤。 | 发布者未提供做法步骤。 | 发布者未提供做法步骤。 | — |
| `messageList.streamlineSummary` | 🧹 已整理 {{count}} 件物品（统一名称/数量，并补充食材类型标签）。 | 🧹 已整理 {{count}} 件食材（统一名称/数量，并补充食材类型标签）。 | 🧹 已整理 {{count}} 件食材（统一名称/数量，并补充食材类型标签）。 | — |
| `onboarding.aiDisclosure` | Pantrio 的助手由 AI 系统生成回答，可能出现错误，也不构成食品安全建议——请务必自行确认食材、过敏原以及食物是否安全。 | Pantrio 助手由 AI 系统生成回答，可能出现错误，也不构成食品安全建议——请务必自行确认食材、过敏原以及食物是否安全。 | Pantrio 助手由 AI 系统生成回答，可能出现错误，也不构成食品安全建议——请务必自行确认食材、过敏原以及食物是否安全。 | — |
| `onboarding.organized.body` | 添加食材、盯紧保质期，优先吃掉快过期的。 | 添加食材、注意保质期，优先吃掉快过期的。 | 添加食材、注意保质期，优先吃掉快过期的。 | — |
| `onboarding.smartTags.body` | 自动标记存放位置、紧急程度和食材类型，不怕东西悄悄放坏。 | 自动标记存放位置、紧急程度和食材类型，东西不至悄悄放坏。 | 自动标记存放位置、紧急程度和食材类型，东西不至于悄悄放坏。 | Took his softening, fixed his broken 不至 → 不至于 |
| `recipePreferences.labels.excludedIngredients` | 必须排除 | — | 不想看到 | — |
| `recipePreferences.maxTimeLine` | 最长做饭时间：{{count}} 分钟 | — | 做饭时间偏好：{{count}} 分钟 | — |
| `recipePreferences.maxTimeNoLimit` | 最长做饭时间：不限制 | — | 做饭时间偏好：不限制 | — |
| `recipePreferences.visibleMore` | {{visible}}（+{{count}} 更多） | — | {{visible}}（另有 {{count}} 项） | — |
| `root.clearDeviceDataA11y` | 永久删除待处理账号在本设备上的数据 | — | 永久删除待删除账号在本设备上的数据 | — |
| `root.clearDeviceDataMessage` | 将永久删除待处理账号在本机上的冰箱物品、购物清单、聊天记录、设置、提醒和自定义 AI 密钥，不代表服务器删除已完成。 | 将永久删除待处理账号在本机上的冰箱食材、购物清单、聊天记录、设置、提醒和自定义 AI 密钥，不代表服务器删除已完成。 | 将永久删除待删除账号在本机上的冰箱食材、购物清单、聊天记录、设置、提醒和自定义 AI 密钥，不代表服务器删除已完成。 | Took his 食材, and also fixed 待处理账号 → 待删除账号 |
| `root.clearDeviceDataTitle` | 清除本机上的账号数据？ | — | 清除该账号的本机数据？ | — |
| `selectionBar.selectAllItems` | 全选物品 | 全选食材 | 全选食材 | — |
| `selectionBar.selectItems` | 选择物品 | 选择食材 | 选择食材 | — |
| `settings.advancedThresholdsBody` | 自定义物品何时标记为“先吃”“尽快吃”等。 | 自定义食材何时标记为“先吃”“尽快吃”等。 | 自定义食材何时标记为"先吃"或"尽快吃"等。 | Took his 食材, and also normalized the quote marks |
| `settings.aiProviderUnreachable` | 无法连接该 AI 服务商。 | — | 无法连接该 AI 服务。 | — |
| `settings.alwaysExcludeIngredients` | 必须排除的食材 | — | 不想看到的食材 | — |
| `settings.alwaysExcludeIngredientsHelp` | 推荐菜谱时不可出现的食材。 | — | 不要推荐带有以下食材的菜谱。 | — |
| `settings.apiProvider` | API 服务商 | — | AI 服务 | — |
| `settings.apiProviderPlaceholder` | 选择 API 服务商 | — | 选择 AI 服务 | — |
| `settings.appleIntelligenceNotEnabled` | 此设备支持 Apple 智能，但已在“设置”中关闭。 | — | 此设备支持 Apple 智能，但已在"设置"中关闭。 | — |
| `settings.availablePlans` | 可选方案 | — | 可选套餐 | — |
| `settings.availablePlansA11y` | 可用的订阅方案 | — | 可用的订阅套餐 | — |
| `settings.customUrgencyThresholds` | 自定义紧急程度 | — | 自定义紧急程度阈值 | — |
| `settings.deleteAccountAlertMessage` | 将永久删除你的 Pantrio 账号，并清除本机上的冰箱物品、购物清单、聊天记录和设置，此操作不可恢复。<br><br>删除账号不会取消 App Store 订阅，也不会删除你的 Apple 账户。请前往 Apple 订阅中单独管理或取消。 | 将永久删除你的 Pantrio 账号，并清除本机上的冰箱食材、购物清单、聊天记录和设置，此操作不可恢复。<br><br>删除账号不会取消 App Store 订阅，也不会删除你的 Apple 账户。请前往 Apple 订阅中单独管理或取消，以免被继续扣费。 | 将永久删除你的 Pantrio 账号，并清除本机上的冰箱食材、购物清单、聊天记录和设置，此操作不可恢复。<br><br>删除账号不会取消 App Store 订阅，也不会删除你的 Apple 账户。请前往 Apple 订阅中单独管理或取消，以免被继续扣费。 | — |
| `settings.emailNotVerifiedBody` | 验证该邮箱后，即使忘记密码也能找回账户。 | — | 验证该邮箱后，即使忘记密码也能找回账号。 | — |
| `settings.maxRecipeTime` | 最长做饭时间 | — | 做饭时间偏好 | — |
| `settings.maxRecipeTimeHelp` | 可选硬性限制（总时长，分钟），留空则不限制。 | — | 可选的软性偏好（分钟）。超时的菜谱仍会推荐，只是排序更靠后；留空表示不限制。 | — |
| `settings.mealStyle` | 口味 | — | 餐食风格 | — |
| `settings.myOwnAiApiDetail` | 使用 OpenAI 兼容服务商及你自己的密钥。 | — | 使用 OpenAI 兼容的 AI 服务及你自己的密钥。 | — |
| `settings.noApplePlans` | 当前没有可用的订阅方案。 | — | 当前没有可用的订阅套餐。 | — |
| `settings.noChatCompletionsEndpoint` | 该地址未提供 OpenAI 兼容的 /chat/completions 接口。请检查地址，多数服务商需要 /v1 后缀。 | — | 该地址未提供 OpenAI 兼容的 /chat/completions 接口。请检查地址，多数 AI 服务需要 /v1 后缀。 | — |
| `settings.productUnavailable` | 该方案当前不可用。 | — | 该套餐当前不可用。 | — |
| `settings.providerInfoBody` | 各服务商的模型名和密钥会分别保存在系统安全钥匙串中。保存会写入以上内容；测试仅向服务商发送一次短请求，不会修改已保存的设置。 | — | 各 AI 服务的模型名和密钥会分别保存在系统安全钥匙串中。保存会写入以上内容；测试仅向 AI 服务发送一次短请求，不会修改已保存的设置。 | — |
| `settings.providerRejected` | 服务商拒绝了请求（{{status}}）。 | — | AI 服务拒绝了请求（{{status}}）。 | — |
| `settings.providerUnexpectedResponse` | 服务商返回了异常响应。 | — | AI 服务返回了异常响应。 | — |
| `settings.resetDeviceDataAlertMessage` | 将清除本机保存的冰箱物品、购物清单、聊天记录、设置、提醒和自定义 AI 密钥。不会删除 Pantrio 账号，此操作不可恢复。 | 将清除本机保存的冰箱食材、购物清单、聊天记录、设置、提醒和自定义 AI 密钥。不会删除 Pantrio 账号，此操作不可恢复。 | 将清除本机保存的冰箱食材、购物清单、聊天记录、设置、提醒和自定义 AI 密钥。不会删除 Pantrio 账号，此操作不可恢复。 | — |
| `settings.resetRecipePreferencesBody` | 可清除已保存和已学习的菜谱偏好，不影响冰箱物品及其他设置。 | 可清除已保存和已学习的菜谱偏好，不影响冰箱食材及其他设置。 | 可清除已保存和已学习的菜谱偏好，不影响冰箱食材及其他设置。 | — |
| `settings.resetTypeToConfirm` | 请输入“reset”以继续 | — | 请输入"reset"以继续 | — |
| `settings.subscriptionStatuses.activeGracePeriod` | 宽限期 | — | 订阅中（扣费宽限期） | — |
| `settings.turnOnAppleIntelligenceAlertMessage` | {{reason}}<br><br>打开“设置”，进入“Apple 智能与 Siri”打开它。 | — | {{reason}}<br><br>打开"设置"，进入"Apple 智能与 Siri"打开它。 | — |
| `settings.updateNameFailed` | 更新名字失败（{{status}}） | — | 用户名更新失败（{{status}}） | — |
| `settings.urgencyPreset` | 默认：先吃 2 天 · 尽快吃 7 天 · 能放一阵 30 天 · 能放很久 180 天 | — | 预设：先吃 2 天 · 尽快吃 7 天 · 能放一阵 30 天 · 能放很久 180 天 | — |
| `settings.viewOrChangePlans` | 查看或更换方案 | — | 查看或更换套餐 | — |
| `shoppingList.deleteItem` | 删除物品 | 删除食材 | 删除食材 | — |
| `shoppingList.deleteItemQuestion` | 删除后无法恢复，确定删除「{{name}}」吗？ | — | 删除后无法恢复，确定删除"{{name}}"吗？ | — |
| `shoppingList.deleteItems` | 删除物品 | 删除食材 | 删除食材 | — |
| `shoppingList.editItem` | 编辑物品 | 编辑食材 | 编辑食材 | — |
| `shoppingList.itemName` | 物品名称 | 食材名称 | 食材名称 | — |
| `shoppingList.itemNamePlaceholder` | 物品名称 | 食材名称 | 食材名称 | — |
| `shoppingList.searchPlaceholder` | 搜索物品… | 搜索食材… | 搜索食材名称… | Same: the field matches the name only |
| `shoppingList.thisItem` | 这件物品 | 这件食材 | 这件食材 | — |
| `subscriptions.couldNotLoadPlans` | 无法加载订阅方案。 | — | 无法加载订阅套餐。 | — |
| `subscriptions.planUnavailable` | 此订阅方案不适用于该账号。 | — | 此订阅套餐不适用于该账号。 | — |
| `tags.storage.fridge` | 冰箱 | — | 冷藏 | — |
| `tutorial.tabs.chat.attach.body` | 点加号拍照或选图。助手能看懂小票、货架或不知名的保鲜盒，并把认出来的东西加进去。 | 点加号拍照或选图。助手能看懂小票、冰箱和储物柜的照片，并把认出来的食材加进冰箱库存清单。 | 点加号拍照或选图。助手能看懂小票、置物架或你的冰箱，并把认出来的食材加入库存。 | Reworked after review: the mystery container became your fridge, and 货架 → 置物架 because 货架 means a store shelf |
| `tutorial.tabs.chat.composer.body` | 输入内容后点发送。也可以直接让它增删改食材，改动会先给你确认再应用。 | 您也随时可以让AI提出饮食建议，问问今晚做什么吃、先吃哪个、要买什么。 | 输入内容后点发送。也可以直接让它增删改食材。 | His line was exchanged into the matching card, evaluated, ours restored, then the trailing 确认再应用 clause trimmed |
| `tutorial.tabs.chat.messages.body` | 助手能看到你的库存和购物清单。可以问今晚做什么、先吃哪个、还缺什么。 | 智能助手能帮您管理冰箱库存和购物清单。 | 助手能看到你的库存和购物清单。可以问今晚做什么、先吃哪个、还缺什么。 | His line was exchanged into the matching card, evaluated, then ours restored — see the evaluation |
| `tutorial.tabs.chat.messages.title` | 问问你的厨房 | 冰箱管理 | 厨房管理 | English keeps "kitchen" (厨房管理); his 冰箱管理 also mistranslates "ask about your fridge" |
| `tutorial.tabs.fridge.addButton.body` | 点加号记录新食材：名称、数量、存放位置、类型和保质期，输入时应用会自动推荐标签。 | 您可以通过AI添加购物清单，也可以自己添加。输入名称和数量，再点加号即可，会自动归到对应分类。 | 点加号记录新食材：名称、数量、存放位置、类型和保质期，输入时应用会自动推荐标签。也可以直接让 AI 帮你添加。 | Took his intent (AI can add too); his Chinese was the Shopping List row pasted into the wrong row |
| `tutorial.tabs.fridge.editButton.body` | 点右上角「编辑」，可以一次选中多个食材，然后移到购物清单、找菜谱或删除。 | — | 点右上角"编辑"，可以一次选中多个食材，然后移到购物清单、找菜谱或删除。 | — |
| `tutorial.tabs.fridge.filterTabs.body` | 在全部、冰箱、冷冻、储物柜之间切换。每个标签上的数字就是该处的食材数量。 | — | 在全部、冷藏、冷冻、储藏之间切换。每个标签上的数字就是该处的食材数量。 | — |
| `tutorial.tabs.fridge.searchBar.body` | 按名称搜索，或点「排序」按保质期、名称、存放位置、食材类型排列。 | — | 按名称搜索，或点"排序"按保质期、名称、存放位置、食材类型排列。 | — |
| `tutorial.tabs.home.greeting.title` | 一屏掌握厨房 | 冰箱一览 | 厨房一览 | English keeps "kitchen"; zh takes his noun-phrase style as 厨房一览 rather than his fridge word |
| `tutorial.tabs.home.replay.body` | 每个标签页只引导一次。想再看，去「设置 - 偏好设置 - 重看页面引导」。 | — | 每个标签页只引导一次。想再看，去"设置 → 偏好设置 → 重看页面引导"。 | — |
| `tutorial.tabs.list.editButton.body` | 点右上角「编辑」可以多选后一起删除，左边的按钮能选中当前可见的全部条目。 | — | 点右上角"编辑"可以多选后一起删除，左边的按钮能选中当前可见的全部条目。 | — |
| `tutorial.tabs.list.items.body` | 点条目即可勾选，点右侧三个点可以改名、改数量、换分类或删除。勾选后会解锁「买完了」，一键把东西放进冰箱。 | — | 点条目即可勾选，点右侧三个点可以改名、改数量、换分类或删除。勾选后会解锁"买完了"，一键把东西放进冰箱。 | — |
| `tutorial.tabs.settings.categories.body` | 账号、订阅方案、偏好设置、隐私数据、AI 供应商。点任意一项进入详细设置。 | — | 账号、套餐与用量、偏好设置、隐私与数据、AI 服务。点任意一项进入详细设置。 | — |
| `tutorial.tabs.settings.replay.body` | 打开「偏好设置」，再点「重看页面引导」，就能重新播放任意标签页的引导。 | — | 打开"偏好设置"，再点"重看页面引导"，就能重新播放任意标签页的引导。 | — |

## English

| Key | Original | Reviewer (db) | Shipped | Reason |
| --- | --- | --- | --- | --- |
| `onboarding.welcome.title` | Welcome to Fridge Manager | — | Welcome to Pantrio | — |
| `recipePreferences.labels.excludedIngredients` | Always exclude | — | Never include | — |
| `recipePreferences.maxTimeLine` | Maximum recipe time: {{count}} minutes | — | Preferred recipe time: {{count}} minutes | — |
| `recipePreferences.maxTimeNoLimit` | Maximum recipe time: No limit | — | Preferred recipe time: No limit | — |
| `settings.alwaysExcludeIngredients` | Always exclude ingredients | — | Never include | — |
| `settings.alwaysExcludeIngredientsHelp` | Ingredients recipe recommendations must not contain. | — | Don't recommend recipes with these ingredients. | — |
| `settings.deleteAccountAlertMessage` | This permanently deletes your Pantrio account and clears your fridge items, shopping list, chat history, and settings from this device. This cannot be undone.<br><br>Deleting your Pantrio account does not cancel an App Store subscription and does not delete your Apple Account. Manage or cancel the subscription separately in Apple Subscriptions. | This permanently deletes your Pantrio account and clears your fridge items, shopping list, chat history, and settings from this device. This cannot be undone.<br><br>Deleting your Pantrio account does not cancel an App Store subscription and does not delete your Apple Account. Manage or cancel the subscription separately in Apple Subscriptions so you are not charged again | This permanently deletes your Pantrio account and clears your fridge items, shopping list, chat history, and settings from this device. This cannot be undone.<br><br>Deleting your Pantrio account does not cancel an App Store subscription and does not delete your Apple Account. Manage or cancel the subscription separately in Apple Subscriptions so you are not charged again. | Took his added consequence clause; restored the closing period he dropped |
| `settings.maxRecipeTime` | Maximum recipe time | — | Preferred recipe time | — |
| `settings.maxRecipeTimeHelp` | Optional hard total-time limit in minutes. Leave blank for no maximum. | — | Optional soft preference in minutes. Longer recipes can still appear, just ranked lower. Leave blank for no preference. | — |
| `settings.maxRecipeTimePlaceholder` | No maximum | — | No preference | — |
| `settings.tokensLeft` | {{used}} of {{limit}} tokens left | — | {{used}} of {{limit}} tokens used | — |
| `settings.updateNameFailed` | Failed to update name ({{status}}) | — | Failed to update username ({{status}}) | — |
| `tutorial.tabs.chat.attach.body` | Tap plus to take or choose a picture. The assistant can read a receipt, a shelf, or a mystery container and add what it finds. | Tap plus to take or choose a picture. The assistant can read a picture of receipt, fridge or pantry shelf and add what it finds to your fridge list. | Tap plus to take or choose a picture. The assistant can read a receipt, a shelf, or your fridge and add what it finds to your inventory. | Reworked after review: mystery container dropped, destination now reads as inventory |
| `tutorial.tabs.chat.composer.body` | Write a message and tap send. You can also ask it to add, update, or remove items, and it shows the change before applying it. | You can always chat about meal ideas and recipes， ask what to cook tonight, what to use first, or what you still need to buy. | Write a message and tap send. You can also ask it to add, update, or remove items. | His line was exchanged into the matching card, evaluated, ours restored, then the trailing confirmation clause trimmed |
| `tutorial.tabs.chat.messages.body` | The assistant can see your inventory and shopping list. Ask what to cook tonight, what to use first, or what you still need to buy. | Write a message and tap send. You can ask AI assistant to add, delete or update items in your inventory and shopping list. | The assistant can see your inventory and shopping list. Ask what to cook tonight, what to use first, or what you still need to buy. | His line was exchanged into the matching card, evaluated, then ours restored — see the evaluation |
| `tutorial.tabs.chat.messages.title` | Ask about your kitchen | Ask about your fidge | Ask about your kitchen | "kitchen" kept; his version also contains the "fidge" typo |
| `tutorial.tabs.fridge.addButton.body` | Tap the plus button to log a new item: name, quantity, storage, food type, and expiry date, with tags suggested as you type. | You can add items by AI and by yourself. Tap the plus button to log a new item: name, quantity, storage, food type, and expiry date, with tags suggested as you type. | Tap the plus button to log a new item: name, quantity, storage, food type, and expiry date, with tags suggested as you type. You can also ask AI to add the item for you. | Took his AI sentence, moved it to the end so it matches the Chinese order |
| `tutorial.tabs.home.greeting.title` | Your kitchen at a glance | Your fridge at a glance | Your kitchen at a glance | "kitchen" kept, per your call |

## Evaluation: his two chat lines, exchanged into the matching cards

His two lines were exchanged rather than ours, judged in place, and then reverted —
**the shipped copy is ours again**. His "chat about meal ideas" line went to the
messages card and his "write a message and tap send" line to the composer card, the
reverse of the arrangement in his own document. Step order comes from
`utils/tabTutorials.js`; `chat.messages` wraps the conversation area and
`chat.composer` wraps `MessageInput` (`app/(tabs)/chat.js:462`, `:475`).

Only the details you flagged earlier were touched: 您 → 你, his full-width comma → "—",
and "ask AI assistant" → "ask the AI assistant".

| Card | Highlights | Title | His line, in the matching slot | Ours (before this trial) |
| --- | --- | --- | --- | --- |
| 2 | conversation area | Ask about your kitchen / 厨房管理 | You can always chat about meal ideas and recipes — ask what to cook tonight, what to use first, or what you still need to buy. / 你也可以随时让 AI 提出饮食建议，问问今晚做什么吃、先吃哪个、要买什么。 | The assistant can see your inventory and shopping list. Ask what to cook tonight… / 助手能看到你的库存和购物清单。可以问今晚做什么、先吃哪个、还缺什么。 |
| 4 | input field | Type your question / 输入你的问题 | Write a message and tap send. You can ask the AI assistant to add, delete, or update items in your inventory and shopping list. / 智能助手能帮你管理冰箱库存和购物清单。 | Write a message and tap send. You can also ask it to add, update, or remove items, and it shows the change before applying it. / 输入内容后点发送。也可以直接让它增删改食材，改动会先给你确认再应用。 |

**Verdict: exchanging his lines fixes the placement, but his wording is weaker than
ours — so ours were restored.**

- Exchanging his lines is the right structural move — it removes the mismatch I
  flagged earlier, because every card now describes the control it highlights. The
  problem was the placement of his lines, not his prose.
- Card 2 loses the assistant's capability statement. "The assistant can see your
  inventory and shopping list" is what separates this chat from a generic one; his
  opener leads with "meal ideas and recipes" instead. The Chinese narrows further —
  提出饮食建议 reads as "suggest meal ideas", where ours invites any question.
- Card 4 English loses "it shows the change before applying it". For add, delete and
  update actions that reassurance is worth keeping, and his line otherwise matches ours.
- Card 4 Chinese is the weakest of the four: 智能助手能帮你管理冰箱库存和购物清单。 drops
  the "write a message and tap send" instruction that his own English carries, and
  never mentions the input control this card highlights.
- Register: both of his lines used 您, which would have been the only formal copy in
  the app (the file has 0 您 and 29 你).

Recommendation: keep our lines, but his opener is worth borrowing. One merge option:

- Card 2 English: "The assistant can see your inventory and shopping list. Chat about
  meal ideas any time — ask what to cook tonight, what to use first, or what you still
  need to buy."
- Card 2 Chinese: 助手能看到你的库存和购物清单。也可以随时聊聊做什么菜，问问今晚做什么、先吃哪个、还缺什么。
- Card 4: ours ship, later trimmed to 输入内容后点发送。也可以直接让它增删改食材。 — the
  confirmation clause was cut at your request. Note the behaviour is still surfaced when it
  happens, by 确认冰箱修改 on the review card.

## Reviewer changed, not shipped

Every row above where his value differs from ours:

- `account.pendingAppleRevocationMessage` (zh) — Took his fuller sentence but used 账号; 账户 stays only for Apple 账户
- `fridge.searchPlaceholder` (zh) — His 搜索食材… is shorter; shipped 搜索食材名称… because the field matches the name only
- `onboarding.smartTags.body` (zh) — Took his softening, fixed his broken 不至 → 不至于
- `root.clearDeviceDataMessage` (zh) — Took his 食材, and also fixed 待处理账号 → 待删除账号
- `settings.advancedThresholdsBody` (zh) — Took his 食材, and also normalized the quote marks
- `settings.deleteAccountAlertMessage` (en) — Took his added consequence clause; restored the closing period he dropped
- `shoppingList.searchPlaceholder` (zh) — Same: the field matches the name only
- `tutorial.tabs.chat.attach.body` (zh) — Reworked after review: the mystery container became your fridge, and 货架 → 置物架 because 货架 means a store shelf
- `tutorial.tabs.chat.attach.body` (en) — Reworked after review: mystery container dropped, destination now reads as inventory
- `tutorial.tabs.chat.composer.body` (zh) — His line was exchanged into the matching card, evaluated, ours restored, then the trailing 确认再应用 clause trimmed
- `tutorial.tabs.chat.composer.body` (en) — His line was exchanged into the matching card, evaluated, ours restored, then the trailing confirmation clause trimmed
- `tutorial.tabs.chat.messages.body` (zh) — His line was exchanged into the matching card, evaluated, then ours restored — see the evaluation
- `tutorial.tabs.chat.messages.body` (en) — His line was exchanged into the matching card, evaluated, then ours restored — see the evaluation
- `tutorial.tabs.chat.messages.title` (zh) — English keeps "kitchen" (厨房管理); his 冰箱管理 also mistranslates "ask about your fridge"
- `tutorial.tabs.chat.messages.title` (en) — "kitchen" kept; his version also contains the "fidge" typo
- `tutorial.tabs.fridge.addButton.body` (zh) — Took his intent (AI can add too); his Chinese was the Shopping List row pasted into the wrong row
- `tutorial.tabs.fridge.addButton.body` (en) — Took his AI sentence, moved it to the end so it matches the Chinese order
- `tutorial.tabs.home.greeting.title` (zh) — English keeps "kitchen"; zh takes his noun-phrase style as 厨房一览 rather than his fridge word
- `tutorial.tabs.home.greeting.title` (en) — "kitchen" kept, per your call

