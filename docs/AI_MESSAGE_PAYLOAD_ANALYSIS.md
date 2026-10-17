# Pantrio AI 消息载荷与提示词分析

本文分析 Pantrio 客户端在聊天时实际发送给 AI 提供商的内容，包括系统提示词、
对话消息、WebSocket 协议、自定义提供商 HTTP 请求、Apple Intelligence 请求，
以及工具调用和工具结果的字段用途。

英文提示词原文按代码中的形式保留；所有分析和解释使用中文。

## 分析范围

主要来源文件：

- `api/gpt.js`：请求构造、三种 provider 分支、WebSocket 和工具循环
- `api/buildSystemMessage.js`：系统提示词
- `api/recipeAssistant.js`：食谱意图和食谱工具 schema
- `api/gptTools.js`：客户端工具实现
- `api/memoryManager.js`：旧版消息持久化和摘要逻辑

当前活跃的三种 provider：

| Provider | 传输方式 | 消息格式 |
| --- | --- | --- |
| `pantrio` | WebSocket `start` | Chat Completions 风格消息数组 |
| `custom` | HTTP `POST /chat/completions` | OpenAI 兼容请求体 |
| `apple` | 本地 Foundation Models | 纯文本 instructions + prompt |

## 核心结论

1. 每次聊天请求都以 `buildSystemMessage` 生成的 system message 开头。
2. 本地聊天历史只取最近 5 条应用消息，再由
   `toChatCompletionsMessages` 转换成模型消息。
3. `recipe_cards` 只发送一行文本占位符，不发送完整食谱卡片数据。
4. `ui_action` 确认卡片不会发送其 action 内容；当前转换逻辑会把它变成一条
   空内容的 assistant message。
5. 只有最后一条 user message 的图片会以多模态 `image_url` 发送；更早的图片
   被替换成 `[image]` 文本。
6. Pantrio WebSocket 的 `start` 消息额外携带 Firebase token、意图分类结果和
   `recipeContext`。
7. custom provider 会收到 tool schemas；Apple Intelligence 收到的是被压扁成
   纯文本的工具说明和历史。
8. 工具调用历史不会写入本地聊天记录；它只存在于 custom 和 Apple 的单次工具
   循环中。

---

## 一、请求构造路径

聊天从 `app/(tabs)/chat.js` 的 `handleSend` 开始，调用
`useGpt().streamMessage({ text, imageUri, imageRequestUri })`。进入
`api/gpt.js` 后，请求按以下顺序构造：

1. `addMessage` 把用户输入加入本地聊天状态。
2. 客户端不再判断意图：文本路由由后端完成（`resolveRequestRouting`）。
   只有冰箱页的「找菜谱」按钮会带 `uiAction: "findRecipes"`。
3. `requestMessages = updatedMessages.slice(-5)` 只保留最近五条消息。
4. 如果本次有 `displayText` 和完整 `text` 的差异，用
   `replaceLastUserPromptForRequest` 把请求副本中的用户文本替换成完整 prompt。
5. `buildSystemMessage` 生成 system prompt。
6. `toChatCompletionsMessages` 把应用消息转换成模型消息数组。
7. 根据 provider 分支选择 WebSocket、custom HTTP 或 Apple Intelligence。

这一路径决定了：模型看到的不是完整聊天记录，而是“系统提示词 + 最近五条应用
消息”的投影。

---

## 二、对话消息数组：每种 message 的字段与用途

### 2.1 system message

发送形式：

```json
{
  "role": "system",
  "content": "<buildSystemMessage() 生成的完整英文提示词>"
}
```

用途：

- 定义模型身份：冰箱和购物清单应用里的助手。
- 限制可处理范围：冰箱、购物清单、食谱、应用设置。
- 强制工具调用规则：改状态必须调用工具，不能编造工具结果。
- 定义过期时间语义：只能传 `expiresInDays`，不能传日期。
- 定义确认卡片语义：提案工具只展示卡片，用户确认前不能声称已修改。
- 定义食谱流程：必须先 `getFridgeContents`，再 `recommendRecipes`。
- 定义回复语言和 Markdown 风格。

system message 每次请求都会重新生成，语言跟随 `resolvedLanguage`，用户名称来自
`settings.user.name`。

### 2.2 user message

本地保存形式由 `memoryManager.addMessage` 创建：

```json
{
  "role": "user",
  "content": [
    { "type": "input_text", "text": "用户输入" },
    { "type": "input_image", "image_url": "file://... 或 data:image/jpeg;base64,..." }
  ]
}
```

转换到 AI 请求时，`toChatCompletionsMessages` 会输出两种形态。

最后一条用户消息，且带图片时：

```json
{
  "role": "user",
  "content": [
    { "type": "text", "text": "用户输入" },
    {
      "type": "image_url",
      "image_url": { "url": "data:image/jpeg;base64,..." }
    }
  ]
}
```

非最后一条用户消息，且带图片时：

```json
{
  "role": "user",
  "content": "用户输入\n[image]"
}
```

用途：

- 承载当前轮的文本指令。
- 最后一条消息的图片用于视觉识别、冰箱物品识别等。
- 历史图片只保留 `[image]` 占位符，避免每次请求重复携带大体积 base64。
- 当 `displayText` 与完整 prompt 不同时，请求中使用完整 prompt，界面仍显示
  较短的 `displayText`。

### 2.3 assistant message

应用中的 assistant 消息可能是普通文本，也可能是结构化消息：

```json
{ "role": "assistant", "content": [{ "type": "output_text", "text": "回复内容" }] }
```

转换规则：

- 如果 `m.text` 是字符串，直接发送 `{ role: "assistant", content: m.text }`。
- 如果 `m.content` 是数组，优先取第一个 `output_text` 的文本。
- 如果找不到 `output_text`，取第一个带 `text` 的 part。
- 如果既没有 `text` 也没有可提取的 content，发送空字符串
  `{ role: "assistant", content: "" }`。

用途：

- 给模型提供前几轮助手回复作为上下文。
- 食谱卡片通过 `recipe_cards` 分支转换成一行 assistant 占位文本。
- 确认卡片 `ui_action` 当前会落入“空 assistant message”分支，这是一个值得
  注意的副作用。

### 2.4 tool message

`tool` role 不会出现在本地聊天历史和 `toChatCompletionsMessages` 输出中。
它只出现在 provider 的工具循环里。

custom provider 的 tool result 形态：

```json
{
  "role": "tool",
  "tool_call_id": "call_abc",
  "content": "{\"success\":true,\"message\":\"...\"}"
}
```

Apple Intelligence 的工具结果是纯文本：

```text
tool: addFridgeItem result: {"success":true,"message":"..."}
```

Pantrio WebSocket 的工具结果走单独的 `tool_results` 消息，见第四节。

用途：

- 把客户端工具执行结果交还给模型，让模型继续生成自然语言回复。
- `content` 通常是 `JSON.stringify(resultObj)`。
- 工具结果只在本轮请求内有效，不写入本地聊天历史。

### 2.5 recipe_cards message

本地存储形式：

```json
{
  "id": "recipe-cards-...",
  "role": "assistant",
  "type": "recipe_cards",
  "text": "Recipe cards shown for 3 recommendations.",
  "recipes": [ ...完整的食谱卡片数据... ]
}
```

发送到模型时的形式：

```json
{
  "role": "assistant",
  "content": "Recipe cards shown for 3 recommendations."
}
```

用途：

- 本地 UI 需要完整 `recipes` 才能渲染卡片。
- 模型只需要知道“刚刚展示过食谱卡片”，不需要收到完整食谱 JSON。
- 这行占位文本也帮助后续意图判断识别“再推荐一些”这类追问。

### 2.6 ui_action message

本地存储形式：

```json
{
  "role": "assistant",
  "type": "ui_action",
  "action": {
    "kind": "add_all_to_fridge",
    "actionId": "fridge-proposal-...",
    "status": "pending",
    "items": [ ... ]
  }
}
```

当前发送到模型时：

```json
{ "role": "assistant", "content": "" }
```

用途与影响：

- `ui_action` 本来是给本地界面渲染确认卡片的，不是给模型的内容。
- 当前 `toChatCompletionsMessages` 没有专门跳过它。
- 因为它有 `role: "assistant"`，但没有 `text` 或可提取的 `content`，最终会变成
  一条空 assistant message。

### 2.7 developer message

`api/memoryManager.js` 的 `getConversation` 可以生成：

```json
{
  "role": "developer",
  "content": [
    { "type": "input_text", "text": "Conversation memory from earlier messages:\n..." }
  ]
}
```

但当前 `api/gpt.js` 中记忆摘要调用被注释掉，活跃请求路径不会生成 developer
message。它属于未启用的旧能力。

---

## 三、消息窗口与图片策略

### 3.1 最近五条窗口

`requestMessages = updatedMessages.slice(-5)`。这说明：

- 每轮最多发送最近五条应用消息。
- 长对话不会自动携带更早的历史。
- 旧版 `MAX_HISTORY = 20`、`KEEP_RECENT = 6` 和
  `checkAndSummarize` 当前不参与请求构造。

### 3.2 图片只保留最后一条

`toChatCompletionsMessages` 通过 `isLast` 判断当前消息是否是数组最后一条：

- 最后一条带图片：发送 `image_url` 多模态 part。
- 非最后一条带图片：发送 `"文本\n[image]"`。

这样做的目的是避免历史图片反复发送 base64，但代价是模型无法再次查看早期图片。

### 3.3 displayText 与 hidden prompt

冰箱页点击“用这些食材找食谱”时，界面只需要显示短短一行“正在用 X 找食谱”，
但模型需要完整食谱指令。`replaceLastUserPromptForRequest` 只替换请求副本中的
`input_text`，本地聊天记录仍保留短文本。

---

## 四、Pantrio WebSocket 消息目录

Pantrio provider 使用 `BACKEND_WS_URL`。客户端只处理带 `requestId` 的消息；
`hello` 这类没有 `requestId` 的消息会被直接忽略。

### 4.1 客户端发往服务端

#### `start`

发送时机：每次 Pantrio 聊天请求开始时。

```json
{
  "type": "start",
  "requestId": "随机请求 ID",
  "model": "gpt-5",
  "language": "en",
  "token": "<Firebase ID token>",
  "messages": [ ...Chat Completions 风格消息数组... ],
  "uiAction": "仅冰箱「找菜谱」按钮发送：findRecipes",
  "recipeContext": {
    "inventory": [ { "name": "...", "quantity": "..." } ],
    "selectedIngredients": [ "..." ],
    "preferences": { ...settings.recipePreferences... },
    "language": "en"
  }
}
```

字段用途：

| 字段 | 用途 |
| --- | --- |
| `type` | 固定为 `start`，告诉服务端这是新请求 |
| `requestId` | 本轮请求的唯一标识，后续 `delta`、`tool_calls`、`done` 都用它定位 job |
| `model` | 服务端使用的模型名，当前写死为 `gpt-5` |
| `language` | `en` 或 `zh`，用于服务端生成对应语言的内容 |
| `token` | Firebase ID token，用于服务端认证和额度校验 |
| `messages` | system + 最近五条应用消息的 Chat Completions 数组 |
| `intent` | 客户端预分类结果，服务端可据此强制食谱流程 |
| `recipeContext` | 食谱专用上下文，含库存名称/数量、选中食材、偏好和语言 |

#### `tool_results`

发送时机：服务端通过 `tool_calls` 或 `awaiting_tool_results` 要求客户端执行工具后。

```json
{
  "type": "tool_results",
  "requestId": "同一个请求 ID",
  "results": [
    {
      "tool_call_id": "call_abc",
      "name": "addFridgeItem",
      "content": "{\"success\":true,\"message\":\"...\"}"
    }
  ]
}
```

字段用途：

- `tool_call_id`：把结果对应回某个工具调用。
- `name`：调用的工具名，便于服务端和日志识别。
- `content`：工具执行结果的 JSON 字符串；失败时也是 JSON，例如
  `{"error":"..."}`。

#### `cancel`

发送时机：

- 请求超时。
- 用户切换会话、退出登录、删除账号、应用进入后台。
- 调用 `cancel(requestId)` 或 `cancelAll`。

```json
{ "type": "cancel", "requestId": "要取消的请求 ID" }
```

用途：通知服务端停止生成；客户端同时会本地 reject promise 并清理 job。

### 4.2 服务端发往客户端

| 消息类型 | 关键字段 | 客户端处理与用途 |
| --- | --- | --- |
| `hello` | 无 `requestId` | 当前直接忽略 |
| `started` | `requestId` 等 | 交给 `applyRealtimeState`，然后结束处理 |
| `quota_budget` | 额度字段 | 交给 `applyRealtimeState`，用于更新额度 UI |
| `quota_budget_update` | 额度字段 | 同上 |
| `trial_budget` | 试用额度字段 | 交给 `applyRealtimeState` |
| `trial_budget_update` | 试用额度字段 | 同上 |
| `event` | `event: "quota"` 或 `"rate_limit"` | 更新实时状态并以 `RATE_LIMITED` 结束请求 |
| `delta` | `text` | 增量文本；累加到 job，并以 50ms 批量刷新 UI |
| `tool_calls` | `toolCalls`, `toolOwner`, `round` | 客户端认领并执行属于 client 的工具调用 |
| `awaiting_tool_results` | `toolCalls`, `toolOwner`, `round` | 与 `tool_calls` 同一处理路径 |
| `tool` | `name`, `result` | 服务端工具事件；当前只处理 `recommendRecipes` 并生成食谱卡片 |
| `error` | `code`, `message` 等 | 以错误结束请求 |
| `done` | `requestId` | 以当前累积文本 resolve 请求 |

#### `delta`

```json
{ "type": "delta", "requestId": "abc", "text": "部分回复" }
```

用途：把模型流式输出切成小块。客户端不会每收到一个 chunk 就渲染，而是先在
`job.pendingDelta` 累积，再用 `STREAM_RENDER_INTERVAL_MS = 50` 毫秒批量刷新。

#### `tool_calls` / `awaiting_tool_results`

```json
{
  "type": "tool_calls",
  "requestId": "abc",
  "toolOwner": "client",
  "round": 1,
  "toolCalls": [
    {
      "id": "call_abc",
      "function": {
        "name": "addFridgeItem",
        "arguments": "{\"name\":\"Milk\",\"quantity\":\"1\"}"
      }
    }
  ]
}
```

用途：

- 服务端把需要本地执行的工具调用发给客户端。
- `claimClientOwnedGPTToolCalls` 过滤掉 `webSearch`、`recommendRecipes` 等服务端
  工具，并确保同一个 tool call 只执行一次。
- 客户端执行后通过 `tool_results` 回传。

#### `tool`

```json
{
  "type": "tool",
  "requestId": "abc",
  "name": "recommendRecipes",
  "result": {
    "recipes": [ ... ]
  }
}
```

用途：

- 表示服务端自己执行了一个工具。
- 当前客户端只对 `recommendRecipes` 且结果中 `recipes` 非空的情况生成
  `recipe_cards` 消息。
- 其他服务端工具事件目前不改变本地 UI。

#### `error` 与 `done`

```json
{ "type": "error", "requestId": "abc", "code": "QUOTA_EXHAUSTED", "message": "..." }
{ "type": "done", "requestId": "abc" }
```

用途：

- `error`：结束本轮请求并以错误拒绝 promise。
- `done`：结束本轮请求并以当前累积的 `job.text` 作为最终文本。

### 4.3 连接生命周期

- WebSocket 在第一次需要时懒创建。
- 没有进行中的请求时，空闲 30 秒后自动关闭。
- 应用进入后台、退出登录或账号删除时会主动取消请求并关闭 socket。
- 每个请求使用 `requestId` 关联一个 job，防止不同请求的流式消息串线。

---

## 五、custom provider 的 HTTP 消息

custom provider 走 OpenAI 兼容接口：

```text
POST {baseUrl}/chat/completions
Authorization: Bearer {apiKey}
Content-Type: application/json
```

请求体：

```json
{
  "model": "用户配置的模型名",
  "messages": [ ...conversation... ],
  "tools": [ ...DIRECT_AI_TOOLS... ],
  "tool_choice": "auto",
  "parallel_tool_calls": false
}
```

用途：

- `model`：用户在设置中为当前 provider 槽位保存的模型。
- `messages`：system、user、assistant、tool 四种角色的对话。
- `tools`：客户端支持的全部工具 schema。
- `tool_choice`：普通对话为 `auto`；食谱流程会被强制成指定工具。
- `parallel_tool_calls`：当前始终为 `false`，避免一次返回多个冲突动作。

### 5.1 食谱请求的工具策略

当 `intent === "recipe_recommendation"` 时，`customRecipeToolPolicy` 会分两步：

| step | tools | tool_choice | 目的 |
| --- | --- | --- | --- |
| 0 | `getFridgeContents` | 强制 `getFridgeContents` | 先读取真实库存 |
| 1+ | `recommendRecipes` | 强制 `recommendRecipes` | 再用真实库存请求食谱 |

### 5.2 确认动作隔离

当模型调用 `recommendRecipes`、`proposeRecipePreferenceUpdate`、
`proposeAddAllToFridge` 或 `proposeBulkFridgeUpdate` 后，
`toolsLockedAfterIsolatedAction` 会锁住后续工具，要求模型先给最终回复。

唯一的例外是：食谱推荐完成后，允许再调用一次
`proposeAddMissingIngredientsToShoppingList`。

### 5.3 六步工具循环

custom provider 最多循环 6 次：

1. 发送当前 conversation。
2. 取 `choices[0].message`。
3. 把 assistant message 加入 conversation。
4. 如果没有 tool_calls，直接返回文本。
5. 如果有 tool_calls，执行工具并把 tool result 加入 conversation。
6. 回到第 1 步，直到模型给出最终文本或超过 6 步。

---

## 六、Apple Intelligence 的消息

Apple Intelligence 不使用 Chat Completions 的消息数组，而是把本轮请求压成两个
字符串：

- `instructions`：系统提示词 + 工具说明 + 本轮额外规则
- `prompt`：按 `role: content` 展平后的对话历史

### 6.1 instructions

`buildAppleInstructions(systemText)` 的结构：

```text
{完整 system prompt}

You can use the app tools listed below. Choose type "tool" whenever you need to
read or change app data. Choose type "final" only when you can answer the user
without another tool. Never claim that an action succeeded until its tool result
says it succeeded. Use only an exact tool name from this list.

{紧凑工具列表}
```

紧凑工具列表的行格式：

```text
addFridgeItem(name, quantity, categories, expiresInDays [required: name, categories]): Add an item to the fridge...
```

用途：

- 给 Foundation Models 提供可用工具名称。
- 用简化的参数列表替代完整 JSON Schema，降低 prompt 体积。
- 单条工具描述最多 220 字符。

### 6.2 prompt

`runAppleAi` 会把 `ccMessages` 中 role 不是 `system` 的消息映射成：

```text
user: 用户消息

assistant: 助手消息
```

然后所有行用两个换行拼接。注意：

- 图片 part 会被丢弃，因为这里只拼接 part 的 `text`。
- 工具调用不会以结构化 tool_calls 发送，而是转成文本：

```text
assistant: Tool call: addFridgeItem({"name":"Milk"})

tool: addFridgeItem result: {"success":true,...}
```

### 6.3 每轮额外规则

如果本次是食谱请求，instructions 会追加：

```text
For this recipe request, call getFridgeContents first if you have not already
seen the fridge this conversation, then call the recommendRecipes tool.
```

如果刚刚执行了隔离动作，会追加以下两种规则之一：

```text
You may make one follow-up tool call: proposeAddMissingIngredientsToShoppingList...
```

或：

```text
The requested isolated action is complete. Return a final answer now without
calling another tool.
```

### 6.4 输入上限与工具结果压缩

- instructions + prompt 合计上限为 28,000 字符，超过则报错。
- `recommendRecipes` 结果只保留最多 4 个食谱的标题和缺失食材。
- `getFridgeContents` / `getShoppingListContents` 最多保留 40 个条目。
- `streamlineLists` 结果只保留变化数量和列表数量。
- 其他工具结果原样保留。

---

## 七、工具 schema 与结果字段

### 7.1 通用字段

`categories` 对象：

```json
{
  "storage": "Fridge | Freezer | Pantry",
  "urgency": "Expired | Eat first | Use soon | Lasts a while | Long keeper",
  "food_type": "Produce | Dairy | Meat | Seafood | Prepared | Condiments | Beverages | Snacks | Bakery | Frozen",
  "state": "Opened | Unopened | Raw | Cooked | Cut | Whole"
}
```

`expiresInDays`：从今天起还能保存的整天数；不接受日历日期。

### 7.2 工具清单

| 工具 | 参数 | 用途 |
| --- | --- | --- |
| `addFridgeItem` | `name`, `quantity`, `categories`, `expiresInDays` | 直接加入冰箱 |
| `addShoppingItem` | `name`, `quantity`, `categories` | 直接加入购物清单 |
| `removeFridgeItem` | `name` | 按名称删除冰箱物品 |
| `removeShoppingItem` | `name` | 按名称删除购物清单物品 |
| `findInFridge` | `name` | 查找冰箱物品 |
| `findInShoppingList` | `name` | 查找购物清单物品 |
| `getFridgeContents` | 无 | 读取完整冰箱内容 |
| `getShoppingListContents` | 无 | 读取完整购物清单 |
| `streamlineLists` | `scope`, `retag`, `dryRun` | 规范化和重新分类列表 |
| `proposeAddAllToFridge` | `items[]`, `title` | 展示“全部加入冰箱”确认卡片 |
| `updateFridgeItem` | `id`, `name`, `updates` | 修改单个冰箱物品 |
| `proposeBulkFridgeUpdate` | `changes[]`, `title` | 展示批量修改确认卡片 |
| `proposeAddMissingIngredientsToShoppingList` | `items[]`, `title` | 展示缺料加入购物清单卡片 |
| `recommendRecipes` | 见下节 | 调用后端食谱推荐 |
| `proposeRecipePreferenceUpdate` | `operation`, `patch`, `summary` | 展示偏好保存确认卡片 |

### 7.3 `recommendRecipes` 参数

| 参数 | 类型 | 用途 |
| --- | --- | --- |
| `dishQuery` | string / null | 用户明确说出的菜名，保持用户语言 |
| `preferredCuisines` | string[] | 本次请求的菜系 |
| `energyPreference` | any / light / balanced / hearty | 轻食、均衡或饱腹偏好 |
| `maxCaloriesPerServing` | integer / null | 每份热量上限 |
| `maxPrepMinutes` | integer / null | 准备时间上限 |
| `mealType` | breakfast / lunch / dinner / snack / dessert | 餐次 |
| `skillLevel` | beginner / intermediate / advanced | 烹饪难度 |
| `cookingMethod` | air_fryer 等 | 烹饪方式 |
| `maxIngredients` | integer / null | 最多使用多少种食材 |
| `dietaryPatterns` | string[] | 饮食模式 |
| `mustUseIngredients` | string[] | 必须使用的食材 |
| `excludedIngredients` | string[] | 必须排除的食材 |
| `servings` | integer | 份数 |
| `resultCount` | integer | 结果数量，1–4 |

### 7.4 工具结果

客户端工具一般返回：

```json
{ "success": true, "message": "人类可读的结果说明" }
```

读取类工具返回：

```json
{
  "__context": true,
  "items": [ { "id": "...", "name": "...", "quantity": "...", "tagIds": [], "tagLabels": [] } ]
}
```

失败时返回：

```json
{ "success": false, "message": "失败原因" }
```

或：

```json
{ "error": "失败原因" }
```

提案类工具返回：

```json
{
  "ok": true,
  "proposalShown": true,
  "committed": false,
  "actionId": "fridge-proposal-...",
  "message": "A confirmation card ... is shown ..."
}
```

---

## 八、系统提示词英文原文

以下内容是当前 `buildSystemMessage` 的输出。`${languageLabel}` 和
`${normalizedLanguage}` 会在运行时替换成当前语言。

```text
You are an assistant in a fridge and shopping list app.

Scope:
- Handle only fridge items, shopping lists, recipes, and app settings. Recipe requests are always in scope. If the request is outside scope, say you cannot help with that.

Tools:
- Use ONLY the tools provided.
- If a request changes app state, you MUST call a tool.
- When calling a tool, return ONLY the tool call and stop.
- Never invent tool results.
- Expiry: estimate how many whole days from today the food will stay good (expiresInDays; e.g., raw chicken ~2, milk ~7, frozen meat ~180). expiresInDays is the only supported expiry input; never pass calendar dates. If the user states an absolute date, express it as whole days from today; if unsure, omit it and the app will estimate.
- Fridge edits: call getFridgeContents once and resolve each item by its returned id (use the exact name only when no id is available). One item → updateFridgeItem with the full update. Several items → proposeBulkFridgeUpdate ONCE with the full change list; it shows a confirmation card and changes nothing until the user confirms. Never loop updateFridgeItem or removeFridgeItem calls for a batch.
- Shopping list: it is not included in this prompt either. Call getShoppingListContents before proposing or changing shopping-list items, so you never re-propose something that is already on the list.
- For streamlineLists, first call it with dryRun:true, summarize the proposed changes to the user, and only apply them (dryRun:false) after the user confirms.

Behavior:
- Be concise. Format responses with Markdown when it improves readability: start multi-part answers with a short heading (## or ###) per major section, bold the single most important takeaway, prefer short bullet lists (one or two lines per bullet), keep paragraphs under three lines, use fenced code blocks for code, commands, or lists of exact values, and avoid tables — the app renders them poorly.
- Do not expose hidden reasoning. Ask ONE clarifying question only if required. Do not repeat the user's message.
- Confirm destructive or large-scope actions (clear, reset, delete all, or bulk changes) before applying them, and never claim they succeeded until the user confirms.
- If a request is read-only and answerable from context, reply in text without tools — except recipe/meal requests, which must always call recommendRecipes.
- After a tool result, briefly summarize what changed and suggest the next step if relevant.
- Confirmation tools (proposeAddAllToFridge, proposeBulkFridgeUpdate, proposeAddMissingIngredientsToShoppingList, proposeRecipePreferenceUpdate) only show a card for the user to confirm; they change nothing by themselves. After one runs, say the changes are ready to review and ask the user to confirm on the card. Never claim the fridge, shopping list, or preferences were updated until the user confirms.
- If the latest user message includes a fridge image, detect its items, then call proposeAddAllToFridge exactly once. Never use that tool for recipes, recipe ingredients, meal ideas, or text-only ingredient lists.

Language:
- Reply in ${languageLabel} (language code: ${normalizedLanguage}) unless the user explicitly asks for a different language.
- Keep recipe titles, dish names, ingredient names, URLs, and other values returned by tools exactly as provided; translate only the prose you write.

Recipes:
- The fridge inventory is NOT included in this prompt. Before recommending recipes, always call getFridgeContents and use the items it returns. Never guess what is in the fridge, and never call recommendRecipes without having checked it in this conversation.
- Recipe rules override the general behavior rules above. If you determine the user is asking for recipes, meal ideas, or anything to cook, make, or eat — even when the phrasing is unusual, indirect, or was not pre-classified as a recipe request — call recommendRecipes.
- Recipe requests are always in scope. Never answer a recipe request from memory and never decline it as out of scope.
- For every recipe or meal-idea request, including requests for something light or a cuisine such as Asian or American, call recommendRecipes exactly once per request and search fresh every time — never skip or reuse a recipe only because it was shown in an earlier answer.
- If the user names a specific dish (for example "tomato egg stir fry" or "番茄炒蛋"), put that dish in dishQuery exactly as the user said it, in the user's language, and leave mustUseIngredients empty unless the user also named ingredients. A name search is not an ingredient search.
- If the user asks to use a specific ingredient (or selected one fridge item), present only recipes that contain it; never pad with recipes that omit it.
- Follow-ups after a recipe answer (for example asking for breakfast, lunch, more ideas, or something different) are NEW requests: call recommendRecipes once and put only the new meal's constraints in the arguments. Never reuse the previous meal's constraints or results. This applies even if the earlier answer is no longer visible in the conversation.
- Saved preferences and the trusted fridge inventory are supplied to recommendRecipes by the app. Put only constraints stated for the current meal in the tool arguments.
- A request such as "something light tonight" is a one-meal override — do not save it as a preference. If the user says remember, save, always, or usually, or clearly states a durable allergy or dietary pattern, call proposeRecipePreferenceUpdate and let the user confirm before anything is saved; do not save a constraint phrased only for this meal. For preference proposals: operation=merge to add values, operation=remove to remove named saved values, operation=replace only when the user explicitly asks to replace or clear a field.
- Never use webSearch or proposeAddAllToFridge for recipe recommendations. If the user says find, search, look up, or browse for a recipe — including "online" or "on the web" — that is still a recipe request: call recommendRecipes. Never interpret recipe searches as webSearch requests.
- Only use recipe links returned by recommendRecipes; never invent URLs, calories, or nutrition facts.
- Return 3-4 recipes unless the user asks for fewer.
- If recommendRecipes returns fewer than requested, say how many matching recipes were found and present exactly the returned list; never invent or pad recipes.
- The app renders every returned recipe as an interactive card (title, calories, time, ingredients you have, and ingredients you are missing); tapping a card reveals the publisher's steps and full recipe page. When recommendRecipes returns recipes, reply with a one-line intro plus a pointer to the cards, for example "Here are 3 ideas — tap a card for the full recipe and steps." When it returns no recipes, say plainly that no matching recipes were found and do not mention cards. Do not duplicate each recipe's details in text and never write ingredients, times, calories, or steps that are not in the tool result.
- When suggesting multiple recipes, maximize coverage of available ingredients and avoid repeating the same main ingredient unless unavoidable.
- After recommendRecipes returns, present its results. You may make ONE follow-up call to proposeAddMissingIngredientsToShoppingList if the user wants the missing ingredients added to the shopping list; it shows a confirmation card and adds nothing until confirmed. Do not call any other tool after recommendRecipes.

Context:
- User: ${settings?.user?.name || "User"}
```

---

## 九、系统提示词逐段分析

### 9.1 开头：角色定位

```text
You are an assistant in a fridge and shopping list app.
```

作用：

- 让模型把自己理解为冰箱/购物清单应用内的助手，而不是通用聊天机器人。
- 为后续“只处理特定范围”的约束建立语境。

### 9.2 Scope：允许处理的业务范围

```text
Scope:
- Handle only fridge items, shopping lists, recipes, and app settings. Recipe requests are always in scope. If the request is outside scope, say you cannot help with that.
```

作用：

- 列出允许处理的四类事情：冰箱、购物清单、食谱、应用设置。
- 把食谱单独提升为永远在范围内的能力，避免模型因为“这不是冰箱操作”而拒绝。
- 让模型对范围外请求直接说明无法处理，而不是自由发挥。

### 9.3 Tools：工具调用的硬约束

这一段是整个提示词里最强的行为约束，可以拆成几层理解：

- `Use ONLY the tools provided`：模型不能编造工具，也不能假设自己有网页搜索
  等未提供的工具。
- `If a request changes app state, you MUST call a tool`：修改状态必须走工具。
- `When calling a tool, return ONLY the tool call and stop`：工具调用轮只输出调用，
  不夹带解释文字。
- `Never invent tool results`：模型只能根据真实返回继续回答。
- `expiresInDays` 规则：过期时间只允许用“从今天起多少整天”，避免时区、日期
  解析和模型幻觉日期的问题。
- 冰箱编辑规则：单个物品用 `updateFridgeItem`；多个物品必须用
  `proposeBulkFridgeUpdate`，并且用户确认前不能声称修改完成。
- 购物清单规则：先调用 `getShoppingListContents`，避免重复添加。
- `streamlineLists` 规则：先 `dryRun: true`，用户确认后再真正执行。

这一段的目的，是把“模型可以说什么”与“应用实际改了什么”分开。模型只负责
表达意图和调用工具，真实数据修改由客户端工具完成。

### 9.4 Behavior：回复风格和确认机制

这一段控制四件事：

1. 回复格式：简洁、Markdown、避免表格、段落要短。
2. 推理边界：不暴露隐藏推理，最多问一个澄清问题，不重复用户原话。
3. 操作安全：删除、重置、批量修改必须先确认，用户确认前不能说已经完成。
4. 读数与写操作的区别：普通只读问题可以直接文字回答；食谱请求必须走
   `recommendRecipes`。

最后一条专门处理图片：如果最新消息是冰箱图片，识别物品后调用
`proposeAddAllToFridge`。这条规则把视觉识别与确认卡片串起来，并且明确禁止把
食谱图片、菜单或文字食材清单当成“加入冰箱”的输入。

### 9.5 Language：语言和值保持

作用：

- 回复语言跟随 App 当前语言，默认英文或简体中文。
- 工具返回的菜名、食材、URL 等值保持原样，只翻译模型自己写的叙述。

这样做的原因很实际：后端返回的食谱标题和 URL 是数据，不是可翻译的 UI 文案；
翻译后可能无法匹配搜索结果或打开链接。

### 9.6 Recipes：食谱流程的优先级

食谱段落是提示词中最长的一段，原因是食谱涉及多个容易出错的环节：

- 冰箱内容不在 system prompt 中，必须通过 `getFridgeContents` 读取。
- 食谱请求永远在范围内，并且必须走 `recommendRecipes`。
- 每次请求都要重新搜索，不能复用上一轮结果。
- 用户说菜名时用 `dishQuery`，用户说食材时用 `mustUseIngredients`。
- 食谱回答后的“再来点”“换一个”属于新请求，必须重新调用工具。
- “今晚清淡一点”是单次约束，不能保存成长期偏好。
- 只有明确说“记住/总是/通常”或宣布持续过敏/饮食模式时，才调用
  `proposeRecipePreferenceUpdate`。
- “搜索/找一下/上网找”仍然走 `recommendRecipes`，不能走 `webSearch`。
- 只能使用工具返回的链接、热量和营养信息，不能编造。
- 结果默认 3–4 个；返回不足时如实说明。
- 卡片负责展示细节，模型只给一行引入语。
- 食谱返回后最多再调用一次
  `proposeAddMissingIngredientsToShoppingList`，不能连续调用其他工具。

这一段本质上是把食谱功能从“自由文本生成”收紧成“带确认流程的工具编排”。

### 9.7 Context：当前注入的上下文

当前只注入用户名：

```text
Context:
- User: {name}
```

冰箱和购物清单都没有直接写进 system prompt，而是要求模型通过工具读取。这样
可以减少提示词体积，也保证模型看到的是最新真实数据。

---

## 十、实际发送内容中容易忽略的点

### 10.1 历史只有五条

请求构造中明确使用 `slice(-5)`。这意味着长对话的早期内容不会发送，之前讨论过
的约束、图片和食谱卡片都可能从模型上下文中消失。

### 10.2 `ui_action` 会变成空 assistant message

确认卡片的 action 内容不会发送，但当前转换逻辑会生成：

```json
{ "role": "assistant", "content": "" }
```

这不是模型需要的业务信息，属于历史转换中的副作用。

### 10.3 食谱卡片只发占位文本

完整 `recipes` 数组只用于本地渲染。模型只收到类似
`Recipe cards shown for 3 recommendations.` 的 assistant 文本。

### 10.4 图片只发最后一条

历史图片会被替换成 `[image]`，因此模型无法再次查看旧图片。只有最后一条用户
消息会发送真实图片 URL 或 base64 data URL。

### 10.5 Pantrio `start` 消息包含 token 和 recipeContext

`start` 消息不是纯对话内容，它还包含 Firebase token、意图和食谱上下文。这意味
WebSocket 必须使用 WSS，并且服务端需要把这条消息当作认证请求处理。

### 10.6 custom provider 的食谱上下文不在 HTTP body 里

custom provider 的 `chat/completions` body 不直接包含 `recipeContext`。
`recipeContext` 只在客户端执行 `recommendRecipes` 时，被 POST 到
`/api/recipes/recommend`。

### 10.7 Apple Intelligence 不接收结构化工具调用

Apple 分支把消息、工具调用和工具结果全部展平成文本。图片不会进入 Apple
prompt，结构化 tool_calls 也不会以 JSON 形式发送。

### 10.8 记忆摘要当前未启用

`api/memoryManager.js` 仍有摘要逻辑，但 `api/gpt.js` 中的 `checkAndSummarize`
调用被注释。当前没有长期记忆压缩，只有最近五条消息窗口。

### 10.9 工具调用历史不持久化

本地聊天记录保存的是用户可见的文本、食谱卡片和 UI action，不保存每一轮的
tool_calls/tool results。因此下一次请求不会自动带上上一轮的工具轨迹。

---

## 十一、字段速查表

### 11.1 Chat Completions 消息角色

| role | 出现位置 | 典型字段 | 用途 |
| --- | --- | --- | --- |
| `system` | 请求开头 | `content` | 全局规则 |
| `user` | 每轮用户消息 | `content` 字符串或 part 数组 | 用户输入和图片 |
| `assistant` | 历史回复、食谱占位 | `content` | 上下文和模型回复 |
| `tool` | custom/Apple 工具循环 | `tool_call_id`, `content` | 工具执行结果 |

### 11.2 Pantrio `start` 消息字段

| 字段 | 是否必填 | 说明 |
| --- | --- | --- |
| `type` | 是 | 固定为 `start` |
| `requestId` | 是 | 请求关联 ID |
| `model` | 是 | 当前为 `gpt-5` |
| `language` | 是 | `en` 或 `zh` |
| `token` | 是 | Firebase ID token |
| `messages` | 是 | Chat Completions 消息数组 |
| `uiAction` | 否 | 仅 UI 主动触发时发送（当前为 `findRecipes`），其余由后端路由 |
| `recipeContext` | 是 | 食谱库存、选中食材、偏好和语言 |

### 11.3 常见错误码

| 错误码 | 来源 | 含义 |
| --- | --- | --- |
| `AUTH_REQUIRED` | 客户端或服务端 | 未登录或 token 缺失 |
| `QUOTA_EXHAUSTED` | 服务端 | 当日额度用完 |
| `RATE_LIMITED` | 服务端 | 请求过快 |
| `REQUEST_TIMEOUT` | 客户端 | 请求超过 180 秒 |
| `REQUEST_CANCELLED` | 客户端 | 用户或生命周期取消 |
| `CONNECTION_CLOSED` | WebSocket | 连接在完成前关闭 |
| `RECIPE_RECOMMENDATION_FAILED` | 后端 REST | 食谱推荐接口失败 |
| `APPLE_SUBSCRIPTIONS_UNSUPPORTED` | 原生桥 | 非 iOS 平台不支持订阅 |

---

## 十二、总结

Pantrio 的消息结构可以概括为三层：

1. **规则层**：`buildSystemMessage` 规定模型能不能做、怎么做、做完怎么说。
2. **对话层**：最近五条应用消息被转换成 Chat Completions 消息，图片、食谱卡片
   和 UI action 都经过各自的裁剪或占位处理。
3. **协议层**：Pantrio 用 WebSocket `start/tool_results/cancel` 与后端协作；
   custom 用 OpenAI 兼容 HTTP；Apple Intelligence 用扁平的文本 instructions
   和 prompt。

真正决定数据安全的不是模型说了什么，而是工具调用和服务端协议。模型负责判断
意图和选择工具；客户端负责执行工具；服务端负责认证、额度、食谱搜索和流式返回。
理解这三层之后，再看 `api/gpt.js` 就会清楚每个字段存在的理由。
