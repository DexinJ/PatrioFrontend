# Pantrio 客户端代码文件全景：一份中文导读

本文把 `D:\firdge_manager\fridge-manager` 里的代码文件整理成一篇连续的文章，
供后续维护、代码走读和新人接手时使用。它不追求把每一行代码都解释清楚，
而是回答三个问题：这个文件负责什么、它依赖什么、它被谁使用。

阅读时可以把文章当作一条从“应用入口”到“基础设施”的路径：先看路由和界面，
再进入服务层、状态层和工具层，最后是原生模块、脚本与测试。

## 阅读范围

本文覆盖以下内容：

- `app/`、`api/`、`auth/`、`components/`、`context/`、`utils/`
- `modules/` 中的两个原生模块
- `scripts/`、`i18n/`
- `tests/` 中的 Node 单元测试
- 根目录下的构建与配置文件

不包含 `node_modules/`、`dist/`、`.expo/`、图片字体资源、语言 JSON 数据、
锁文件和本地环境文件。文中的路径都相对仓库根目录。

---

## 一、路由层：应用的骨架

### [app/_layout.js](<D:/firdge_manager/fridge-manager/app/_layout.js>)

这是整个应用的根布局。它先初始化 Sentry，恢复用户上次选择的语言，然后用
`AuthProvider` 包住整棵组件树，再根据 Firebase 登录状态决定进入认证路由还是
主 Tab 路由。它同时提供根错误页、认证恢复页和账号删除进行中的全屏遮罩。

它依赖 `@sentry/react-native`、`expo-router`、`react-i18next` 和
`auth/useAuth.js`。对外导出的是一个被 Sentry 包装的默认 `Layout`。文件中的
Sentry DSN 是写死的，`beforeSend` 会清理 `Authorization`、`Cookie` 和用户
PII。

### [app/(auth)/_layout.js](<D:/firdge_manager/fridge-manager/app/(auth)/_layout.js>)

认证路由组的布局文件。它在登录前就挂载一次 `GlobalProvider`，这样 onboarding、
sign-in、sign-up 三个页面在还没有 Firebase 用户时也能读取主题、字体和设置。
它只依赖 `expo-router` 和 `context/GlobalContext.js`。

### [app/(auth)/onboarding.js](<D:/firdge_manager/fridge-manager/app/(auth)/onboarding.js>)

五页式的新手引导页。它用横向 `FlatList` 和 `Animated` 实现页面切换、卡片缩放、
透明度变化和 emoji 浮动效果，最后把用户引向注册或登录页。

它主要依赖 `expo-router`、`react-native` 的动画能力和 `GlobalContext` 的主题。
对外导出默认的 `OnboardingScreen`。

### [app/(auth)/sign-in.js](<D:/firdge_manager/fridge-manager/app/(auth)/sign-in.js>)

登录页。它提供邮箱密码、Google 和 iOS Apple 登录三条路径，分别调用
`signInWithEmailAndPassword`、`signInWithGoogleNative` 和 `signInWithApple`。
Apple 登录成功后会尝试把一次性授权码回传给后端，用于将来删除账号时的撤销
能力。

它依赖 `firebase/auth`、`auth/appleAuth.js`、`auth/googleAuth.js` 和
`auth/firebaseClient.native.js`。对外导出默认的 `SignInScreen`。

### [app/(auth)/sign-up.js](<D:/firdge_manager/fridge-manager/app/(auth)/sign-up.js>)

注册页，也是账号供给流程最复杂的前端页面。它先通过 `useAuth` 的
`beginProvisioning` 建立一次性状态，再创建 Firebase 用户、调用
`POST /api/users` 保存后端资料，最后通过 `completeProvisioning` 完成流程。
任何一步失败都会尝试清理 Firebase 用户或保留持久化标记，避免留下半成品账号。

它依赖 `api/authProvisioningStorage.js`、`api/fetchWithTimeout.js`、
`auth/useAuth.js`、`auth/appleAuth.js` 和 `auth/googleAuth.js`。对外导出默认的
`SignUpScreen`。

### [app/(tabs)/_layout.js](<D:/firdge_manager/fridge-manager/app/(tabs)/_layout.js>)

主 Tab 布局，也是所有登录后状态的装配点。它按照
`AppleSubscriptionProvider → AccountSessionProvider → SessionBackedGlobalProvider
→ GlobalProvider → GptProvider → ThemedTabs` 的顺序嵌套 Provider，
在真正渲染 Tab 之前阻塞等待账户访问验证和四类本地存储水合完成。

它还负责聊天页头部的新建会话、归档、删除菜单，以及会话抽屉动画和本地数据
恢复页。依赖 `api/gpt.js`、`context/AccountSessionContext.js`、
`context/GlobalContext.js` 和 `context/SubscriptionContext.js`。

### [app/(tabs)/index.js](<D:/firdge_manager/fridge-manager/app/(tabs)/index.js>)

首页仪表盘。它从 `GlobalContext` 读取冰箱与购物清单，统计总件数、已过期和
即将过期数量，并渲染三张可点击的卡片和两个快捷操作按钮，把用户引导到冰箱、
购物清单和聊天页。

### [app/(tabs)/chat.js](<D:/firdge_manager/fridge-manager/app/(tabs)/chat.js>)

聊天页。它通过 `useGpt().streamMessage` 发送文本或图片，渲染
`MessageList` 和 `MessageInput`，并负责处理确认卡片：食谱偏好修改、批量冰箱
更新、缺料加入购物清单和“全部加入冰箱”。

这里还有一整套防止重复应用的逻辑，用 `Set` 和 proposal 工具函数确保同一张
确认卡片不会在重渲染中重复执行。对外导出默认的 `ChatScreen`。

### [app/(tabs)/fridge.js](<D:/firdge_manager/fridge-manager/app/(tabs)/fridge.js>)

冰箱/储藏室页面。它先把原始条目装饰成带过期状态和标签文字的展示对象，再提供
搜索、Fridge/Freezer/Pantry 分栏、排序、多选编辑、添加上下文菜单、批量删除、
加入购物清单，以及用选中食材生成食谱推荐的能力。

它使用了大量可复用组件，如 `InventoryListItem`、`ItemFormModal`、
`SelectionActionBar`、`SortSheetModal`，并依赖 `api/gpt.js` 发送食谱请求。

### [app/(tabs)/list.js](<D:/firdge_manager/fridge-manager/app/(tabs)/list.js>)

购物清单页面。它支持添加物品、根据食物类型自动分类、按分类分栏展示、搜索和
排序、勾选已完成项目、编辑/删除物品，以及“完成购物”把勾选项目一次性转入冰箱。

它依赖 `GlobalContext` 的购物清单和 `addManyToFridge` 等操作，也复用
`FilterTabsRow`、`SearchAndSortBar` 和 `SortSheetModal`。

### [app/(tabs)/settings.js](<D:/firdge_manager/fridge-manager/app/(tabs)/settings.js>)

设置页，是项目里最大的文件。它把设置分成五个子菜单：账户、套餐与用量、偏好、
隐私与数据、AI 提供商。这里同时承担用户名修改、语言切换、字体大小、深浅主题、
过期阈值滑块、提醒开关、食谱偏好、清除全部数据、退出登录和永久删除账号。

它还会从 `AccountSessionContext` 读取套餐/额度/模型信息，从
`SubscriptionContext` 读取 Apple 订阅状态，从 `aiProviderSettings` 读写
SecureStore 中的 AI 提供商槽位，并调用 Apple Intelligence 原生模块检查可用性。

---

## 二、API 服务层：与后端、AI 和本地持久化打交道

### [api/accountDeletionApi.js](<D:/firdge_manager/fridge-manager/api/accountDeletionApi.js>)

账号删除接口的轻量客户端。它封装 `DELETE /api/users/:uid` 和
`GET /api/users/:uid/deletion-status`，统一要求 Firebase bearer token，
并把响应解析成 `httpStatus + payload`。`auth/useAuth.js` 是它的调用方。

### [api/accountDeletionPolicy.cjs](<D:/firdge_manager/fridge-manager/api/accountDeletionPolicy.cjs>)

纯规则模块，负责判断后端删除响应到底意味着什么：已完成、处理中、未请求、
需要重新认证、被拒绝、认证状态未知，还是 Firebase 用户已经不存在。它决定
哪些响应可以触发本地数据清理，是账号删除状态机的重要依据。

### [api/accountLifecycleStorage.js](<D:/firdge_manager/fridge-manager/api/accountLifecycleStorage.js>)

用 AsyncStorage 保存账号生命周期中的持久化标记，包括删除流程状态、Apple
授权是否已绑定，以及登录后需要展示的跨启动通知。它让中断的认证流程可以在下次
启动时继续判断。

### [api/aiProviderPolicy.js](<D:/firdge_manager/fridge-manager/api/aiProviderPolicy.js>)

AI 提供商选择的归一化入口。它只接受 `pantrio`、`apple`、`custom` 三个值，
并把旧的 `useCustomAi` 布尔开关映射成现代 provider ID。

### [api/aiProviderSettings.js](<D:/firdge_manager/fridge-manager/api/aiProviderSettings.js>)

AI 提供商槽位设置的核心。它把 OpenAI、OpenRouter、Groq、Together 和自定义
端点作为不同槽位，使用 SecureStore 按用户保存 `apiKey`、`model` 和 `baseUrl`。
同时承担旧 URL 键控数据向槽位结构的迁移，并用串行锁避免并发写坏数据。

### [api/authProvisioningStorage.js](<D:/firdge_manager/fridge-manager/api/authProvisioningStorage.js>)

注册供给流程的持久化标记存储。它记录正在使用的登录方式、临时绑定到哪个
Firebase UID，以及流程是否已经结束。`sign-up.js` 和 `useAuth.js` 用它来恢复
中断的注册。

### [api/backendConfig.js](<D:/firdge_manager/fridge-manager/api/backendConfig.js>)

后端地址的验证与导出模块。它从环境变量读取 REST API 地址和 WebSocket 地址，
拒绝格式错误、带凭据、带查询串、带片段或生产环境中的 loopback 地址。
`API_BASE_URL` 和 `BACKEND_WS_URL` 是全项目共享的常量。

### [api/backendErrors.js](<D:/firdge_manager/fridge-manager/api/backendErrors.js>)

后端错误解析工具。它把文本响应解析成 JSON 或普通消息，并创建统一的
`BackendResponseError`，附带 `status`、`code`、`quota` 和 `retryAfterMs`，
方便上层按错误类型做用户提示。

### [api/buildSystemMessage.js](<D:/firdge_manager/fridge-manager/api/buildSystemMessage.js>)

生成发给所有 AI 提供商的系统提示词。它严格限制 AI 只能处理冰箱、购物清单、
食谱和设置，要求修改状态必须调用工具，要求过期时间只能以“从今天起多少整天”
表示，还规定了食谱请求必须走 `getFridgeContents → recommendRecipes` 的流程。

### [api/chatAttachments.js](<D:/firdge_manager/fridge-manager/api/chatAttachments.js>)

聊天图片文件的持久化管理。它把临时图片复制到
`documentDirectory/pantrio-chat-attachments/<uid>/`，识别哪些 URI 属于受管
文件，删除某个用户的全部附件，并根据当前聊天消息裁剪不再使用的文件。

### [api/chatLifecycle.js](<D:/firdge_manager/fridge-manager/api/chatLifecycle.js>)

聊天取消机制的中枢。`api/gpt.js` 注册取消处理函数，其他模块在清空聊天、
退出登录或删除账号前调用 `cancelActiveChatWork`，确保正在进行的流式请求和
Socket 连接能及时停止。

### [api/fetchWithTimeout.js](<D:/firdge_manager/fridge-manager/api/fetchWithTimeout.js>)

带超时和外部取消信号的 `fetch` 包装。它创建内部 `AbortController`，同时监听
调用方自己的 `signal`，超时后抛出 `REQUEST_TIMEOUT` 错误。几乎所有的后端请求
都经过它。

### [api/gpt.js](<D:/firdge_manager/fridge-manager/api/gpt.js>)

AI 运行时核心，也是整个聊天系统的中枢。它把应用消息转换成 Chat Completions
格式，处理 Pantrio 后端的 WebSocket 协议，执行客户端工具，流式刷新助手文本，
生成食谱卡片消息，并分别实现 custom OpenAI 兼容接口和 Apple Intelligence
工具循环。

它导出 `DIRECT_AI_TOOLS`、`GptProvider` 和 `useGpt`。目前记忆摘要调用被注释
掉，每次请求只携带最近五条消息。

### [api/gptTools.js](<D:/firdge_manager/fridge-manager/api/gptTools.js>)

AI 工具的实际执行器。它从 `GlobalContext` 读取冰箱、购物清单和标签，提供
`addFridgeItem`、`addShoppingItem`、`removeFridgeItem`、`removeShoppingItem`、
`findInFridge`、`findInShoppingList`、`getFridgeContents`、
`getShoppingListContents`、`updateFridgeItem`、`proposeBulkFridgeUpdate`、
`proposeAddMissingIngredientsToShoppingList`、`streamlineLists`、
`proposeRecipePreferenceUpdate` 和 `proposeAddAllToFridge` 等工具。

### [api/legacyPurgePolicy.cjs](<D:/firdge_manager/fridge-manager/api/legacyPurgePolicy.cjs>)

旧版全局数据清理策略。它决定旧的 AsyncStorage/SecureStore 数据能否被当前用户
删除：没有主人或主人匹配时可以清理，属于其他用户时必须保留。

### [api/memoryManager.js](<D:/firdge_manager/fridge-manager/api/memoryManager.js>)

聊天记忆与持久化服务。它负责加载、保存、清理传统聊天键和按会话分隔的聊天键，
清洗历史消息，删除附件，并实现后端 `/summarize` 摘要流程。它还有并发用户
代际计数，防止已删除账号或旧请求把过期数据写回。

### [api/recipeAssistant.js](<D:/firdge_manager/fridge-manager/api/recipeAssistant.js>)

食谱助手策略层。它定义 `recommendRecipes` 和
`proposeRecipePreferenceUpdate` 工具结构，识别中英文食谱意图，构建受限的食谱
上下文，并强制自定义提供商先读冰箱、再请求食谱推荐。

### [api/reminderScheduler.js](<D:/firdge_manager/fridge-manager/api/reminderScheduler.js>)

本地通知调度器。它通过 `expo-notifications` 设置 09:00 的每日提醒和过期前
日期提醒，并用 latest-task queue 保证设置变化时只执行最新一次同步，避免重复
堆积通知。

### [api/storageKeys.js](<D:/firdge_manager/fridge-manager/api/storageKeys.js>)

本地存储键的定义和迁移中心。它把 Firebase UID 十六进制编码进
`@pantrio:user:<hex>:...` 命名空间，避免多账号互相读数据；还维护旧数据迁移、
隔离区和删除意图日志。

### [api/systemPrompt.js](<D:/firdge_manager/fridge-manager/api/systemPrompt.js>)

一个很小的向后兼容入口。它只重新导出 `buildSystemMessage`，保证旧的 import
路径仍然指向同一份提示词实现。

### [api/userDataPurge.js](<D:/firdge_manager/fridge-manager/api/userDataPurge.js>)

用户数据清除执行器。它并行清除冰箱、购物清单、设置、自定义 AI 凭据、旧数据、
提醒、聊天和附件，并对每个范围单独记录成功或失败。部分失败会保留可重试的
purge intent，避免“看似清空其实还有残留”。

---

## 三、认证层：安全地确认“你是谁”

### [auth/accountReauthentication.js](<D:/firdge_manager/fridge-manager/auth/accountReauthentication.js>)

账号删除前重新认证的决策与执行器。它会检查用户绑定了 Apple、Google 还是邮箱
密码，优先选择能同时给后端提供 Apple 授权码的方式，然后完成 Firebase 重新
认证。

### [auth/appleAuth.js](<D:/firdge_manager/fridge-manager/auth/appleAuth.js>)

Apple 登录桥。它生成 nonce 并做 SHA-256，调用 `expo-apple-authentication`，
把身份令牌转成 Firebase OAuth 凭据，完成登录或重新认证。还会把 Apple 的短时
授权码传给后端，用于后续删除账号时撤销授权。

### [auth/firebaseClient.native.js](<D:/firdge_manager/fridge-manager/auth/firebaseClient.native.js>)

Firebase 初始化入口。它使用环境变量中的 Web 配置创建 Firebase App，并给
Firebase Auth 设置基于 `secureFirebaseStorage` 的原生持久化。全项目只从这里
导出共享的 `auth` 实例。

### [auth/googleAuth.js](<D:/firdge_manager/fridge-manager/auth/googleAuth.js>)

Google 原生登录封装。它配置 iOS 和 Web client ID，调用 Google Sign-In 获取
ID token，再用 Firebase `GoogleAuthProvider` 建立会话；同时提供退出和撤销
Google 授权的独立函数。

### [auth/googleSignInResponse.js](<D:/firdge_manager/fridge-manager/auth/googleSignInResponse.js>)

Google Sign-In v16 响应解析器。它只在成功完成交互登录后才读取缓存 token，
在取消、未知响应或缺少 token 时直接报错，避免误用上一个账号的凭证。

### [auth/secureFirebaseStorage.js](<D:/firdge_manager/fridge-manager/auth/secureFirebaseStorage.js>)

Firebase Auth 的安全持久化适配器。它把会话材料写入 SecureStore，超过
1500 字符时切块保存，旧版 AsyncStorage 明文数据只迁移一次；如果 SecureStore
不可用，则退回到纯内存，绝不把刷新后的凭据写回明文存储。

### [auth/useAuth.js](<D:/firdge_manager/fridge-manager/auth/useAuth.js>)

整个应用的认证大脑。它监听 Firebase 认证状态，处理中断的注册和删除流程，
验证用户是否真正可用后再发布 `user`，管理退出登录、Provider 清理、账号删除、
认证恢复、删除状态查询和恢复页数据清理。

它导出 `AuthProvider` 和 `useAuth`，被根布局、设置页、Tab 布局和账户会话层
广泛使用。

---

## 四、组件层：可复用的界面积木

### [components/ActionGridPopover.js](<D:/firdge_manager/fridge-manager/components/ActionGridPopover.js>)

一个基于 `react-native-popover-view` 的网格操作弹出层。它把动作数组渲染成
多个 `ActionTile`，适合长按后弹出的上下文菜单。冰箱页和会话抽屉都会用到它。

### [components/ActionTile.js](<D:/firdge_manager/fridge-manager/components/ActionTile.js>)

图标加文字的通用按钮块。它支持危险色、禁用态和可访问性状态，是操作网格和
底部多选栏的基础单元。

### [components/ConversationListModal.js](<D:/firdge_manager/fridge-manager/components/ConversationListModal.js>)

会话抽屉。它展示当前和已归档的聊天列表，支持新建、选择、归档、恢复、删除，
以及每行的“...”操作菜单。抽屉的位移动画由 `progress` 驱动。

### [components/FilterTabsRow.js](<D:/firdge_manager/fridge-manager/components/FilterTabsRow.js>)

横向药丸式筛选标签行。它接收 `tabs` 和当前 key，显示选中态和数量，被冰箱页
和购物清单页共用。

### [components/FloatingAddButton.js](<D:/firdge_manager/fridge-manager/components/FloatingAddButton.js>)

右下角悬浮添加按钮，主要用在冰箱页打开新增物品表单。

### [components/Header.js](<D:/firdge_manager/fridge-manager/components/Header.js>)

项目共享的头部组件集合。它提供 `PlainHeader`、`IconHeader`、
`HeaderWithButton` 和 `HeaderWithHiddenButton`，统一处理安全区、居中标题、
左右按钮和返回键，避免每个页面重复实现头部。

### [components/ImageViewer.native.js](<D:/firdge_manager/fridge-manager/components/ImageViewer.native.js>)

一个简单的再导出文件，把 `react-native-image-viewing` 的默认导出作为
`ImageViewing` 使用，方便消息气泡预览图片。

### [components/InventoryListItem.js](<D:/firdge_manager/fridge-manager/components/InventoryListItem.js>)

库存列表项卡片。它展示名称、数量、已翻译的状态/存储/食物类型标签，以及过期
或“已加入多少天”的副标题；在编辑模式下渲染复选框，并支持长按测量位置供弹出
菜单使用。

### [components/ItemFormModal.js](<D:/firdge_manager/fridge-manager/components/ItemFormModal.js>)

新增/编辑物品表单。它收集名称、数量、存储、紧急度、食物类型、状态和过期方式，
支持“天数”“日期”“机器估算”三种过期输入，内含下拉选择器和日期选择 Popover。
冰箱页用它创建和修改物品。

### [components/LinkPreviewCard.js](<D:/firdge_manager/fridge-manager/components/LinkPreviewCard.js>)

链接预览卡片。它先经过 `utils/linkPreviewPolicy.js` 做安全判断，再由用户明确
点击才请求元数据，然后通过 `Linking` 打开原链接。助手消息中的 URL 会渲染成
这个卡片。

### [components/MarkdownText.js](<D:/firdge_manager/fridge-manager/components/MarkdownText.js>)

助手 Markdown 渲染器。它使用
`@bsky.app/react-native-uitextview` 的 `UITextView`，把 Markdown 解析后的块和
内联片段渲染成可选择文本，支持标题、粗体、斜体、删除线、链接、代码块、引用
和分隔线。

### [components/MessageBubble.js](<D:/firdge_manager/fridge-manager/components/MessageBubble.js>)

聊天气泡。它处理纯图片、纯文本、助手 Markdown、用户链接预览卡片、长按选择
文本和图片放大查看。用户消息用普通 `Text`，助手消息用 `MarkdownText`。

### [components/MessageInput.js](<D:/firdge_manager/fridge-manager/components/MessageInput.js>)

聊天输入框。当前版本是纯文本输入，右边按钮固定为发送。它调用
`calculateComposerLayout` 计算输入框高度，并通过 `PlusMenu` 发送图片。语音输入
代码被有意注释保留，但当前不启用。

### [components/MessageList.js](<D:/firdge_manager/fridge-manager/components/MessageList.js>)

聊天消息列表和确认卡片渲染器。它把消息转换成普通气泡、食谱卡片、UI 操作卡
或正在输入指示器；对于“全部加入冰箱”等卡片，还会打开可编辑的确认面板，并把
最终结果交回 `onUiAction`。

### [components/PlusMenu.js](<D:/firdge_manager/fridge-manager/components/PlusMenu.js>)

聊天附件菜单。它请求相机或相册权限，选择图片后校验大小、边长和像素，再把
图片缩放到 1600px、压缩为 JPEG，并返回用于请求的 base64 URI 和用于显示的
受管文件 URI。隐身模式下只保留临时 URI。

### [components/RecipeMissingItemsButton.js](<D:/firdge_manager/fridge-manager/components/RecipeMissingItemsButton.js>)

食谱卡片上的“把缺料加入购物清单”按钮。它根据当前购物清单计算还缺多少项，
使用去重逻辑确保只加一次，并显示已加、跳过或失败反馈。

### [components/RecipeResultCards.js](<D:/firdge_manager/fridge-manager/components/RecipeResultCards.js>)

食谱结果卡片列表。它把 `recipe_cards` 消息渲染成可点击卡片，显示时间、热量、
份量、已有食材和缺失食材；点开后弹出详情页，包含食材、步骤和原食谱链接。

### [components/SearchAndSortBar.js](<D:/firdge_manager/fridge-manager/components/SearchAndSortBar.js>)

搜索框和排序按钮组合。它被冰箱页与购物清单页共同使用。

### [components/SectionHeaderPill.js](<D:/firdge_manager/fridge-manager/components/SectionHeaderPill.js>)

带数量胶囊的列表分区标题，用于冰箱页的“已过期”“即将过期”“其他物品”等分区。

### [components/SelectionActionBar.js](<D:/firdge_manager/fridge-manager/components/SelectionActionBar.js>)

多选模式下的底部操作栏。它显示已选数量、全选或清除按钮，并用 `ActionTile`
渲染删除、编辑、加入购物清单、找食谱等批量动作。

### [components/SortSheetModal.js](<D:/firdge_manager/fridge-manager/components/SortSheetModal.js>)

排序底部弹层。它提供排序字段和升序/降序切换，冰箱页和购物清单页都会使用。

---

## 五、状态层：全局数据、账户会话与订阅

### [context/AccountSessionContext.js](<D:/firdge_manager/fridge-manager/context/AccountSessionContext.js>)

账户会话 Provider。它负责请求 `GET /api/session`，归一化套餐、额度和模型，
把 Apple 交易证据发送给后端验证，协调购买、恢复、刷新订阅，并在应用回到前台
时刷新会话。它还通过 `applyRealtimeState` 接收 WebSocket 实时额度更新。

### [context/GlobalContext.js](<D:/firdge_manager/fridge-manager/context/GlobalContext.js>)

最大的全局状态 Provider。它同时管理冰箱、购物清单、设置、主题、标签、过期
推断、存储水合与持久化、聊天会话索引、清除数据和提醒调度。几乎所有界面和
AI 工具都通过它读写状态。

### [context/refreshPolicy.js](<D:/firdge_manager/fridge-manager/context/refreshPolicy.js>)

刷新策略的纯函数集合。它负责比较产品目录、判断刷新结果是否新鲜、以及是否
允许暴露账户数据给已登录 UI。

### [context/SubscriptionContext.js](<D:/firdge_manager/fridge-manager/context/SubscriptionContext.js>)

Apple 订阅 Provider。它配置产品目录，加载 StoreKit 本地化价格和续订周期，
查询订阅状态，执行购买、恢复、完成未完成交易，并监听原生状态和交易事件。

---

## 六、工具层：纯函数与领域规则

### [utils/bulkProposal.js](<D:/firdge_manager/fridge-manager/utils/bulkProposal.js>)

批量冰箱更新确认卡片的生命周期工具。它生成 action ID，计算稳定的 action key，
并实现 claim、release、mark-consumed，确保同一张批量修改卡片只能被应用一次。

### [utils/chatMessageOrder.js](<D:/firdge_manager/fridge-manager/utils/chatMessageOrder.js>)

聊天消息排序工具。它把新生成的助手文本插到待确认操作卡或食谱卡之前，保证
“先看到回答，再看到卡片”。

### [utils/chatStoragePolicy.js](<D:/firdge_manager/fridge-manager/utils/chatStoragePolicy.js>)

聊天存储策略。它归一化 v1/v2 会话索引，管理归档、恢复和删除，收集附件 URI，
把图片替换为占位符，并限制运行时和持久化消息的数量与字节数。

### [utils/composerLayout.js](<D:/firdge_manager/fridge-manager/utils/composerLayout.js>)

输入框布局计算器。根据内容高度、字体大小和视口高度计算最小/最大高度、行高、
内边距和是否需要滚动。

### [utils/dateInput.js](<D:/firdge_manager/fridge-manager/utils/dateInput.js>)

本地时区日期工具。支持当天起止、日期字符串解析、`YYYY-MM-DD` 格式化，以及
“从今天加 N 天”的计算。物品表单的过期日期输入依赖它。

### [utils/expiration.js](<D:/firdge_manager/fridge-manager/utils/expiration.js>)

过期状态计算器。它把 `expiresAt` 转成是否过期、是否即将过期、剩余天数、
过期时间戳和对应的 urgency key。`GlobalContext` 用它派生列表状态。

### [utils/expiryPredictor.js](<D:/firdge_manager/fridge-manager/utils/expiryPredictor.js>)

保质期预测器。当用户没有提供过期时间时，它根据存储位置、食物类型和状态
估算天数，并对 AI 给的天数和绝对日期做边界检查，避免荒谬的 1960 年日期。

### [utils/foodTypeInference.js](<D:/firdge_manager/fridge-manager/utils/foodTypeInference.js>)

食物类型推断。它通过关键词表从物品名称猜出 Produce、Dairy、Meat、Seafood
等标签，并只在允许的预设标签内返回结果。

### [utils/fridgeProposal.js](<D:/firdge_manager/fridge-manager/utils/fridgeProposal.js>)

“全部加入冰箱”和“缺料加入购物清单”确认卡片的工具集。它归一化类别和数量，
生成 action ID，并管理一次性 claim/release/consume 逻辑。

### [utils/itemTagLabels.js](<D:/firdge_manager/fridge-manager/utils/itemTagLabels.js>)

标签映射工具。它从预设标签构建 `tagById` 和 `tagIdByKey`，并提供“标签转 ID”
“按类型取标签”“替换同类标签”“按类型去重”等函数。

### [utils/latestTaskQueue.js](<D:/firdge_manager/fridge-manager/utils/latestTaskQueue.js>)

“只执行最新任务”的异步队列。提醒同步等会频繁重建的场景用它在旧任务完成前
丢弃过期任务。

### [utils/linkPreviewPolicy.js](<D:/firdge_manager/fridge-manager/utils/linkPreviewPolicy.js>)

链接预览安全策略。它拒绝非 HTTPS、带凭据、loopback、本地域名和私网 IP，
并且默认禁止自动加载元数据，只有用户明确点击才允许。

### [utils/markdownFlow.js](<D:/firdge_manager/fridge-manager/utils/markdownFlow.js>)

Markdown 解析器。它基于 `markdown-it` 把助手文本转换成可序列化的块/片段树，
禁用 raw HTML 和自动链接，并额外提供转纯文本能力，方便复制和分享。

### [utils/markdownSegments.js](<D:/firdge_manager/fridge-manager/utils/markdownSegments.js>)

消息 URL 分段器。它在不破坏代码块、行内代码和 Markdown 链接的前提下，把普通
URL 拆出来交给预览卡片，其余文本继续走 Markdown 渲染。

### [utils/migrations.js](<D:/firdge_manager/fridge-manager/utils/migrations.js>)

本地数据迁移工具。它把旧版冰箱/购物条目补齐 `tagIds`、`createdAt`、
`updatedAt` 和 `expiresAt`，并判断旧的 AI 凭据是否可以在设置成功加载后迁移。

### [utils/recipeCards.js](<D:/firdge_manager/fridge-manager/utils/recipeCards.js>)

食谱卡片归一化器。它裁剪标题、URL、食材、步骤和缺失食材到安全范围，丢弃
无效卡片，并把盐、水、油等常见基础食材排到缺失预览的后面。

### [utils/recipePreferences.js](<D:/firdge_manager/fridge-manager/utils/recipePreferences.js>)

食谱偏好模型。它维护 explicit 与 learned 两类偏好，支持归一化、补丁、merge/
remove/replace 提案、格式化和重置。当前 learned 分数存在但未实际启用。

### [utils/recipeShoppingList.js](<D:/firdge_manager/fridge-manager/utils/recipeShoppingList.js>)

食谱缺料与购物清单之间的去重工具。它做 Unicode NFC、大小写和空白折叠，判断
哪些项目已在清单中、哪些可以新增，并计算“还差几项”的按钮状态。

### [utils/reminderPolicy.js](<D:/firdge_manager/fridge-manager/utils/reminderPolicy.js>)

提醒策略的纯函数。它判断提醒能否同步，生成与设置和物品相关的变更签名，
最多生成 40 条 09:00 过期提醒，并统计未来某段时间内到期的物品数量。

### [utils/tags.js](<D:/firdge_manager/fridge-manager/utils/tags.js>)

类别输入归一化器。它把 typed object、旧数组、逗号字符串、标签、key 或 ID
统一成去重后的预设 tag ID，不会发明不存在的标签。

### [utils/tagTranslation.js](<D:/firdge_manager/fridge-manager/utils/tagTranslation.js>)

标签翻译工具。存储和请求继续使用英文标签，渲染时再根据标签类型翻译成当前
语言，因此切换语言不会重写用户数据。

### [utils/voiceInput.js](<D:/firdge_manager/fridge-manager/utils/voiceInput.js>)

当前保留的输入框文本辅助函数。语音识别相关代码被注释，只留下
`normalizeComposerText` 和 `shouldShowSendButton` 两个活跃函数。

---

## 七、原生模块层：只有 iOS 才有的能力

Pantrio 有两个本地 Expo 模块。它们都声明为 Apple-only，因此 Apple
Intelligence 和 StoreKit 订阅只能在实际 iOS 开发构建、TestFlight 或 App Store
版本中使用，不能在 Expo Go 中使用。

### [modules/apple-intelligence/expo-module.config.json](<D:/firdge_manager/fridge-manager/modules/apple-intelligence/expo-module.config.json>)

Apple Intelligence 模块的 Expo 自动链接配置，声明只在 Apple 平台生效。

### [modules/apple-intelligence/ios/AppleIntelligence.podspec](<D:/firdge_manager/fridge-manager/modules/apple-intelligence/ios/AppleIntelligence.podspec>)

Apple Intelligence 原生模块的 CocoaPods 规格，声明依赖 `ExpoModulesCore`、
Swift 5.9 和 iOS 16.4。

### [modules/apple-intelligence/ios/AppleIntelligenceModule.swift](<D:/firdge_manager/fridge-manager/modules/apple-intelligence/ios/AppleIntelligenceModule.swift>)

Apple Intelligence 原生实现。它检查 Foundation Models 是否可用、打开系统设置、
生成普通文本，并用 `@Generable` 结构让模型返回 `tool` 或 `final` 两类结构化
结果。这个能力需要 iOS 26 和 FoundationModels 工具链。

### [modules/apple-intelligence/src/index.js](<D:/firdge_manager/fridge-manager/modules/apple-intelligence/src/index.js>)

Apple Intelligence 的 JS 桥。它对非 iOS 平台返回 `unsupported_platform`，在
Expo Go 中返回 `development_build_required`，并为 `api/gpt.js` 和设置页提供
`generateAppleIntelligenceToolTurn`、`getAppleIntelligenceAvailability` 等接口。

### [modules/apple-subscriptions/expo-module.config.json](<D:/firdge_manager/fridge-manager/modules/apple-subscriptions/expo-module.config.json>)

Apple 订阅模块的 Expo 自动链接配置。

### [modules/apple-subscriptions/ios/AppleSubscriptions.podspec](<D:/firdge_manager/fridge-manager/modules/apple-subscriptions/ios/AppleSubscriptions.podspec>)

Apple 订阅原生模块的 CocoaPods 规格，声明依赖 `ExpoModulesCore` 和 `StoreKit`。

### [modules/apple-subscriptions/ios/AppleSubscriptionsModule.swift](<D:/firdge_manager/fridge-manager/modules/apple-subscriptions/ios/AppleSubscriptionsModule.swift>)

StoreKit 2 订阅桥。它配置产品 ID，加载本地化产品，读取当前订阅状态，用
`appAccountToken` 完成购买，恢复购买，枚举未完成交易，完成交易，并监听
StoreKit 状态和交易更新事件。这个文件是订阅功能最接近系统的部分。

### [modules/apple-subscriptions/src/index.js](<D:/firdge_manager/fridge-manager/modules/apple-subscriptions/src/index.js>)

StoreKit 模块的 JS 桥与归一化层。它把原生返回的快照、产品、交易证据和交易
结果清理成稳定结构，向 `SubscriptionContext` 提供购买、恢复、状态、监听和
完成交易等 API。

---

## 八、脚本层：测试与质量检查

### [scripts/run-unit-tests.cjs](<D:/firdge_manager/fridge-manager/scripts/run-unit-tests.cjs>)

单元测试入口。它扫描 `tests/*.test.js`，用 Node 内置测试运行器和
`i18n-test-setup.mjs` 预加载执行全部测试，对应 `npm test`。

### [scripts/i18n-test-setup.mjs](<D:/firdge_manager/fridge-manager/scripts/i18n-test-setup.mjs>)

测试预加载模块。它初始化与 App 相同实例的 `i18next`，并加载英文语言包，使
纯函数测试中出现的用户可见字符串也能正确解析。

### [scripts/check-i18n-keys.cjs](<D:/firdge_manager/fridge-manager/scripts/check-i18n-keys.cjs>)

国际化键检查器。它扫描源码中的 `t()` / `i18next.t()`，确认所有 key 都存在于
`locales/en.json`，并检查其他语言文件与英文 key 集合完全一致。

### [scripts/extract-text.cjs](<D:/firdge_manager/fridge-manager/scripts/extract-text.cjs>)

候选文本提取器。它用 Babel 解析 App 源码，把 JSX 文本、UI props、Alert 调用
和模板字符串抽出来，生成一份供人工筛选用作翻译目录的 JSON 报告。

---

## 九、国际化入口

### [i18n/index.js](<D:/firdge_manager/fridge-manager/i18n/index.js>)

初始化 `i18next` 和 `react-i18next`，加载英文与简体中文资源。语言解析顺序是
用户保存的选择、设备语言、英文兜底。它同时负责持久化用户手动选择的语言。

---

## 十、构建与配置文件

### [app.config.js](<D:/firdge_manager/fridge-manager/app.config.js>)

动态 Expo 配置门禁。它加载项目环境变量，验证 EAS 项目 ID、Firebase 与 Google
OAuth 项目号是否一致，要求生产环境使用 HTTPS/WSS 和合法隐私政策 URL，并推导
Google iOS URL scheme。生产 iOS 构建还会关闭任意加载 ATS 例外。

### [app.json](<D:/firdge_manager/fridge-manager/app.json>)

静态 Expo 配置。这里固定了 `com.chilltech.pantrio` bundle ID、`pantrio` scheme、
Sentry 插件、EAS project ID、updates URL 和 fingerprint runtime version。

### [metro.config.js](<D:/firdge_manager/fridge-manager/metro.config.js>)

Metro 打包配置，直接使用 Sentry 提供的 Expo Metro 配置。

### [eas.json](<D:/firdge_manager/fridge-manager/eas.json>)

EAS Build/Submit 配置，包含 development、preview、production 三个 profile，
分别绑定对应环境、channel 和 Node 版本。

### [eslint.config.js](<D:/firdge_manager/fridge-manager/eslint.config.js>)

ESLint flat 配置。它继承 Expo 基础规则，忽略 `dist` 和 `.expo`，并放宽了
`i18next` 默认导出成员使用的规则。

### [tsconfig.json](<D:/firdge_manager/fridge-manager/tsconfig.json>)

TypeScript 配置。它继承 Expo 基础配置并开启 strict，但当前项目没有实际 TS 源码，
include 里还残留旧的 `app/tabs/index.js` 路径。

### [expo-env.d.ts](<D:/firdge_manager/fridge-manager/expo-env.d.ts>)

Expo TypeScript 环境引用文件，由工具链生成并保持在 `.gitignore` 中。

### [package.json](<D:/firdge_manager/fridge-manager/package.json>)

项目清单文件，声明依赖、脚本和 Node 版本范围，是 npm/Expo 工具链的入口。

---

## 十一、测试层：用纯函数守住规则

测试文件目前存在于本地磁盘，但被 `.gitignore` 排除，不进入 Git。它们统一由
`node scripts/run-unit-tests.cjs` 执行。下面按测试主题逐一说明。

### [tests/accountDeletionPolicy.test.js](<D:/firdge_manager/fridge-manager/tests/accountDeletionPolicy.test.js>)

覆盖账号删除响应分类，包括完成/处理中、重试与确定性结果、Firebase 已删除
错误、本地清理门槛和旧删除意图选择。

### [tests/aiProviderPolicy.test.js](<D:/firdge_manager/fridge-manager/tests/aiProviderPolicy.test.js>)

验证 AI provider 选择逻辑，尤其是 Apple Intelligence 和旧版 custom 设置的兼容。

### [tests/aiProviderSlotComparison.test.js](<D:/firdge_manager/fridge-manager/tests/aiProviderSlotComparison.test.js>)

对比旧 URL 键控和现代 slot 键控两套 AI 提供商设计。它目前导入了一个不存在的
`../refactor/aiProviderSlotModel.js`，是测试套件中已知的红色测试。

### [tests/appleIntelligence.test.js](<D:/firdge_manager/fridge-manager/tests/appleIntelligence.test.js>)

覆盖 Apple Intelligence JS 桥的非 iOS 惰性、iOS 转发和开发构建回退行为。

### [tests/appleSubscriptionSnapshotPolicy.test.js](<D:/firdge_manager/fridge-manager/tests/appleSubscriptionSnapshotPolicy.test.js>)

验证订阅快照策略：常规查询只枚举当前权益，显式恢复才请求完整历史。

### [tests/buildSystemMessageLanguage.test.js](<D:/firdge_manager/fridge-manager/tests/buildSystemMessageLanguage.test.js>)

覆盖系统提示词的语言选择、英文默认值、中文切换、不支持语言回退，以及工具返回
值不应被翻译。

### [tests/bulkProposal.test.js](<D:/firdge_manager/fridge-manager/tests/bulkProposal.test.js>)

验证批量修改提案的 key 稳定性、一次性 claim/release 和 consumed 状态。

### [tests/chatMessageOrder.test.js](<D:/firdge_manager/fridge-manager/tests/chatMessageOrder.test.js>)

覆盖助手文本插入到待确认卡片之前，以及找不到卡片时追加到末尾的行为。

### [tests/chatStoragePolicy.test.js](<D:/firdge_manager/fridge-manager/tests/chatStoragePolicy.test.js>)

覆盖聊天持久化清洗、图片占位符、消息/字节上限、会话索引归一化和附件去重。

### [tests/composerLayout.test.js](<D:/firdge_manager/fridge-manager/tests/composerLayout.test.js>)

验证输入框高度随内容增长、六行封顶、视口限制和空内容回退。

### [tests/expiration.test.js](<D:/firdge_manager/fridge-manager/tests/expiration.test.js>)

覆盖本地“当天结束”语义、日期解析、保质期天数归一化和荒谬日期拒绝。

### [tests/fridgeProposal.test.js](<D:/firdge_manager/fridge-manager/tests/fridgeProposal.test.js>)

验证冰箱提案的类别/数量归一化、旧类别数组、一次应用、claim/release 和缺料
加入购物清单。

### [tests/googleSignInResponse.test.js](<D:/firdge_manager/fridge-manager/tests/googleSignInResponse.test.js>)

覆盖 Google Sign-In v16 token 提取、取消时绝不读缓存、成功后缓存兜底、未知
响应和旧版直接 token 响应。

### [tests/gptToolOwnership.test.js](<D:/firdge_manager/fridge-manager/tests/gptToolOwnership.test.js>)

覆盖客户端/服务端工具归属、一次 claim、提案工具、类别/过期转换、未知标签拒绝
和批量提案字段。

### [tests/latestTaskQueue.test.js](<D:/firdge_manager/fridge-manager/tests/latestTaskQueue.test.js>)

验证 latest-wins 队列在活动任务后失效，以及只执行最新排队任务。

### [tests/legacyPurgePolicy.test.js](<D:/firdge_manager/fridge-manager/tests/legacyPurgePolicy.test.js>)

覆盖旧数据清理时删除无主/匹配数据、保留其他用户数据。

### [tests/markdownFlow.test.js](<D:/firdge_manager/fridge-manager/tests/markdownFlow.test.js>)

覆盖 Markdown 块解析、纯文本转换、内联样式、标题、列表、代码块、引用、链接、
表格、换行和图片 alt 回退。

### [tests/markdownSegments.test.js](<D:/firdge_manager/fridge-manager/tests/markdownSegments.test.js>)

验证 URL 清理、文本/URL 分段、尾部标点保留、代码块、行内代码和 Markdown 链接
保护。

### [tests/privacyPolicy.test.js](<D:/firdge_manager/fridge-manager/tests/privacyPolicy.test.js>)

覆盖隐身聊天不持久化、退出隐身后清理、链接预览不自动加载和 URL 安全策略。

### [tests/recipeAssistant.test.js](<D:/firdge_manager/fridge-manager/tests/recipeAssistant.test.js>)

覆盖中英文食谱意图识别、变体追问、上下文限制、自定义提供商工具策略和 Apple
Intelligence 工具生成。

### [tests/recipeCards.test.js](<D:/firdge_manager/fridge-manager/tests/recipeCards.test.js>)

验证食谱卡片只保留可信且有界字段、丢弃无效卡片，并正确排列缺失食材预览。

### [tests/recipePreferences.test.js](<D:/firdge_manager/fridge-manager/tests/recipePreferences.test.js>)

覆盖偏好默认值、归一化、补丁合并、提案操作、格式化和重置。

### [tests/recipeShoppingList.test.js](<D:/firdge_manager/fridge-manager/tests/recipeShoppingList.test.js>)

覆盖大小写、空白和 Unicode 名称匹配，去重，结构化缺料、按钮状态和异常输入。

### [tests/refreshPolicy.test.js](<D:/firdge_manager/fridge-manager/tests/refreshPolicy.test.js>)

验证账户数据曝光门槛、有序目录 key、刷新新鲜度和产品覆盖判断。

### [tests/reminderPolicy.test.js](<D:/firdge_manager/fridge-manager/tests/reminderPolicy.test.js>)

覆盖存储未水合时的安全行为、同步签名、09:00 过期提醒调度和未来物品统计。

### [tests/storageMigrationPolicy.test.js](<D:/firdge_manager/fridge-manager/tests/storageMigrationPolicy.test.js>)

验证旧 AI 凭据只能在设置成功读取后才迁移。

### [tests/tagNormalization.test.js](<D:/firdge_manager/fridge-manager/tests/tagNormalization.test.js>)

覆盖 typed object、空状态跳过、去重以及旧数组/ID 列表/逗号字符串形式。

### [tests/voiceInput.test.js](<D:/firdge_manager/fridge-manager/tests/voiceInput.test.js>)

验证当前活跃的输入框文本归一化和发送按钮显示逻辑。

---

## 十二、快速索引

| 目录 | 作用 |
| --- | --- |
| `app/` | Expo Router 页面和路由布局 |
| `api/` | 后端、AI、存储、提醒和账号服务 |
| `auth/` | Firebase、Google、Apple 与安全持久化 |
| `components/` | 可复用 UI 和聊天渲染 |
| `context/` | 全局状态、账户会话和订阅 Provider |
| `utils/` | 纯函数、领域规则和格式化工具 |
| `modules/` | Apple 订阅和 Apple Intelligence 原生桥 |
| `scripts/` | 单元测试入口和 i18n/文本质量工具 |
| `i18n/` | i18next 初始化 |
| `tests/` | 纯函数与策略的 Node 单元测试 |

如果希望从系统架构角度理解这些文件之间的关系，可以继续阅读
[CODEBASE_REPORT.md](<D:/firdge_manager/fridge-manager/docs/CODEBASE_REPORT.md>)
和
[architecture-flowchart.md](<D:/firdge_manager/fridge-manager/docs/architecture-flowchart.md>)。

---

## 结语

把这份清单当作地图而不是字典：路径相近的文件往往承担相似的角色，`api/` 负责
外部世界，`context/` 负责内存中的事实来源，`utils/` 负责可测试的规则，
`components/` 负责把状态翻译成用户能看到和点击的界面。掌握这些层次之后，
再深入任何一个大文件，都会更容易判断它属于哪一层、影响谁、又该被谁保护。
