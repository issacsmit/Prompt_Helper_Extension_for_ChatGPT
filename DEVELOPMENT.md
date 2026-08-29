# 开发说明

## 运行形态与边界

项目采用无构建、零依赖架构。Chrome 按 `manifest.json` 声明的顺序把普通脚本直接注入 `https://chatgpt.com/*`；每个模块通过 IIFE 扩展同一个 `globalThis.PromptHelper` 命名空间，同时在 Node 中提供 CommonJS 导出供测试使用。

生产脚本的固定加载顺序是：

1. `constants.js`
2. `storage.js`
3. `prompt-engine.js`
4. `chatgpt-editor.js`
5. `update-check.js`
6. `ui.js`
7. `content.js`

最后由 `content.js` 自动初始化。`content.css` 与脚本一起作为 content script 样式加载。生产代码不得新增模型调用、凭据或后台 worker。除用户在插入设置中点击「检查更新」时访问 GitHub 公开 Release 接口外，不得联网；静态守卫只扫描真正进入页面的上述运行文件，不扫描边界说明文档。

## 模块职责与公开接口

| 文件 | 职责 | `PromptHelper` 公开接口 |
| --- | --- | --- |
| `constants.js` | 默认/旧版占位符、`【…】` 自动选中默认值、历史上限、存储键、3000 ms 超时 | `DEFAULT_PLACEHOLDER`、`LEGACY_PLACEHOLDER`、`DEFAULT_AUTO_SELECT_BRACKET_PLACEHOLDER`、`MAX_PLACEHOLDER_HISTORY`、`STORAGE_KEYS`、`STORAGE_TIMEOUT_MS` |
| `storage.js` | Chrome `storage.local` 规范化、超时、错误、快照与订阅 | `Storage`、`StorageError` |
| `prompt-engine.js` | 解析占位符优先级，计算光标或选区范围；维护历史 | `prepareInsertion()`、`updatePlaceholderHistory()` |
| `chatgpt-editor.js` | ChatGPT composer 定位、字符书签和非覆盖式插入 | `ChatGPTComposerAdapter` |
| `update-check.js` | 比较 `manifest.json` 版本与 GitHub latest Release | `checkForUpdate()`、`isNewerVersion()` |
| `ui.js` | 布局纯函数、控制器、DOM UI、CRUD、列表排序、对话框和拖拽 | `PromptHelperController`、`PromptHelperUI` 及布局辅助函数 |
| `content.js` | 依赖装配、单例、SPA 观察和销毁 | `initializePromptHelper()`、`destroyPromptHelper()` |

不要绕过公开接口读取模块内部字段。浏览器与 Node 必须得到相同函数/构造器引用，以便零构建验证真实实现。

## 事件与数据流

初始化路径：

1. `content.js` 创建 `Storage`、`ChatGPTComposerAdapter`、`PromptHelperUI` 和 `PromptHelperController`。
2. UI 先挂载安全空状态；控制器调用 `Storage.load()`。
3. 加载结果经过规范化后渲染，并订阅 `chrome.storage.onChanged`。
4. `MutationObserver` 观察文档子树变化，用一次调度合并连续 SPA mutation，然后重新定位 composer 并确保 UI 单例仍挂载。

写入路径：

1. UI 把表单意图交给控制器，不直接改持久状态。
2. 控制器基于当前状态创建候选 prompts/history，进入 `busy`。
3. `Storage.savePrompts()` 成功后才提交候选并重绘；失败恢复控制器快照并显示中文错误。拖动排序会先乐观更新列表顺序，写入失败再回滚。
4. 同一扩展的其他标签通过 `storage.onChanged` 触发重新加载。若本标签正在写入，只记录 pending，写入结束后再同步，避免候选状态被中途覆盖。

插入路径：

1. UI 的捕获阶段 `pointerdown` 在控件夺取焦点前调用 `captureBookmark()`。
2. 控制器调用 `prepareInsertion()` 得到 `{ text, caretOffset }`；若命中通用 `【…】`，还会得到 `selectionEndOffset`。
3. 适配器在最新 editor 中恢复字符偏移、插入、验证实际文本，并恢复折叠光标或非折叠选区，随后派发冒泡且 `composed` 的 `input` 事件。
4. 成功后只关闭面板，不触发发送，也不强制把焦点移到浮钮。

## ChatGPT DOM 定位与 SPA 假设

首选选择器是 `#prompt-textarea[contenteditable="true"]`。如果首选不可用，只在 `form` 或 `[data-testid*="composer"]` 范围内依次寻找：

1. `[role="textbox"][contenteditable="true"]`
2. `textarea`

适配器不会回退到全局裸 `contenteditable` 或 textarea，防止影响页面原生控件。候选还必须已连接、可见、非 disabled/readOnly，且不能是 `aria-hidden`、`aria-disabled` 或 `aria-readonly`。

ChatGPT 是 SPA：路由或 composer 状态变化可替换整个 editor 节点。书签只保存 UTF-16 字符偏移和必要的原子节点前/后 affinity，不保存脆弱 DOM 路径。每次捕获与插入都会主动 `rebind()`；`MutationObserver` 是提前恢复与 UI 单例维护机制，不是唯一定位机制。

## contenteditable 与 textarea 插入策略

### textarea

- 书签来自 `selectionStart`，有选区时折叠到选区起点，不删除选中文字。
- 插入内容的 CRLF/CR 先按原生 textarea 规则规范化为 LF。
- 优先调用原型 `value` setter，再验证最终 `value`，恢复折叠光标或目标选区并派发 `input`。

### contenteditable

- 递归建立逻辑文本模型：文本节点计实际 UTF-16 长度，普通 `<br>` 计 `\n`，块边界计独立 `\n`；`ProseMirror-trailingBreak` 以及块元素内唯一的裸 `<br>` 都是空段落占位，不重复计换行。
- `contenteditable="false"` 的附件子树视为零长度原子；不遍历文件名或 SVG 后代，也不把 Range 放入附件内部。
- 优先使用 `document.execCommand("insertText")`，不可用或失败时才用折叠 Range 插入文本节点。
- 插入前后都计算逻辑文本并与唯一期望值比较；宿主没有真正接受内容时返回 `INSERTION_FAILED`，不伪造成功事件。

占位符解析顺序固定为：当前提示词的自定义光标、`【光标】` / `[光标]`、第一处通用 `【…】`、历史兼容占位符。前三类光标占位符仍按旧行为移除并定位；通用 `【…】` 保留在插入文本中并整体选中。全局开关关闭时跳过通用规则，不改变旧版、自定义与历史兼容行为。

## 存储、超时、回滚与跨标签同步

`Storage` 对每次 `get`/`set` 使用 3000 ms 超时，并同时兼容 Chrome callback 与 Promise 形式。callback 必须同步读取正常的 `chrome.runtime.lastError`；扩展重新加载导致的 context invalidated 会归一为 `EXTENSION_CONTEXT_INVALID`。

成功 `load()`、成功写入或相关 `storage.onChanged` 才推进存储层的最后已知状态。保存返回写入前的 `rollbackSnapshot`，失败时同一快照附在错误上。控制器另外保留自己的候选前快照：

- 提示词/历史写失败：恢复完整 prompts 与 placeholderHistory。
- 词条顺序写失败：恢复写入前的 prompts 顺序。
- `【…】` 自动选中设置写失败：恢复写入前的开关值。
- 浮钮位置写失败：本页保留已夹取的安全坐标并提示未持久化。
- 写入期间收到跨标签事件：标记 pending，写入结束后重新 `load()`。

已有键必须保持为 `ph_prompts`、`ph_placeholder_history`、`ph_button_pos`；自动选中设置使用 `ph_auto_select_bracket_placeholder`，旧数据缺失该键时按开启处理。若迁移数据结构，应先写兼容读取和失败测试，不能静默丢弃有效旧数据。

## UI 生命周期与隔离

- 所有扩展 DOM 使用 `phg-` 前缀，并挂在唯一 `#phg-root` 下；用户文本只经 `textContent` 或原生 value 写入。
- 面板标题栏的插入设置对话框承载全局 `【…】` 自动选中开关，并直接说明占位符冲突优先级。
- 样式限定在 `#phg-root`，覆盖明暗主题、减少动画与 44 px 触控目标，不使用全局 `button`/`input` 重置。
- 对话框处理 Esc、Tab 循环与 opener 焦点恢复；面板外点击只关闭面板。
- `destroy()` 必须解除 document/window/storage/MutationObserver 监听并保持幂等。

## Quiet Orbit（静默轨道）视觉契约

浮动入口是本扩展自有的提示框轮廓、文本插入光标与指针图形，不复用 OpenAI、Gemini 或其他模型品牌。标记由 `createElement()` 与 `createElementNS()` 创建，内联 SVG 只接受代码中固定的标签和属性；不得使用 `innerHTML`、远端 SVG，也不得把提示词等用户内容拼进 SVG 或 HTML。入口的 idle、hover/focus、active 与 drag 反馈由限定在 `#phg-root` 下的伪类、pointer 事件和位置更新共同表达。

卡片编辑/删除图标与浮动入口一样由固定内联 SVG 构造，使用 `currentColor` 接收主题颜色；按钮必须保留 `aria-label`、`title`、焦点环和粗指针 44 px 目标。主题敏感的操作表面、分隔线、次级图标、创建入口与阴影只通过 `--phg-*` 语义变量取值，不得在组件规则中重新写入仅适用于暗色主题的黑灰色。

面板保留 header、可滚动 body、footer 三段结构。`data-phg-state` 是开关动画的 DOM 状态源，只允许 `closed` 与 `open`；切换时必须同步 `aria-hidden`、`inert` 和入口的 `aria-expanded`。打开使用 `270ms cubic-bezier(.16, 1, .3, 1)`，关闭使用 `175ms cubic-bezier(.4, 0, 1, 1)`；前三个提示词卡片的进入延迟分别为 `55ms`、`82ms`、`109ms`，后续卡片沿用默认 `109ms`。开关动画只改变可见性、透明度和合成层 transform，不应引入等待后才能点击的 JavaScript 定时器。

指针能力由 CSS 媒体查询决定：

- `@media (hover: hover) and (pointer: fine)` 才启用入口的 3 px 悬停抬升与光晕，并让 `.phg-card-actions` 在静止时透明且不可点击；当前 `.phg-prompt-card:hover` 或 `:focus-within` 才显示编辑/删除。细指针也可从词条正文拖动排序，超过 6 px 阈值后抑制随后的插入点击。词条拖拽的 pointer capture 必须打在按下的手柄或插入按钮上，不能打在列表容器上，否则浏览器会把随后的 click 重定向到列表，轻点无法插入。
- `@media (hover: none), (pointer: coarse)` 让卡片操作始终可见、可点击，并把卡片操作、拖动手柄、关闭和新增等关键控件维持为至少 44 px；不要依赖触屏模拟悬停。触屏只从左侧手柄开始排序，以便词条正文仍可滚动列表。
- 词条左侧六点手柄始终可见；拖动或方向键会通过 `reorderPrompts()` 把 `ph_prompts` 数组顺序写回存储。

主题变量只定义在 `#phg-root`。显式主题选择器是 `html.dark #phg-root`、`html[data-theme="dark"] #phg-root`、`html.light #phg-root` 与 `html[data-theme="light"] #phg-root`；没有显式根主题时，再由 `prefers-color-scheme` 选择系统明暗值。主题变化直接通过根选择器重新计算变量，不需要复制 ChatGPT 的类名到扩展子树。

无持久位置时，`clampFloatingPosition()` 使用 24 px 默认内缩计算右下角坐标；显式保存/拖动坐标和窗口缩放仍按 12 px 安全边界夹取。默认内缩与可拖动边界是两个独立约束，不得通过增大全局 margin 改变已有用户位置。

`@media (prefers-reduced-motion: reduce)` 会取消入口、面板、卡片、操作区、对话框和状态提示的 transition/animation，并清除位移、缩放、卡片错峰和卡片侧轨增长；可见性、焦点轮廓、`data-phg-state` 与控件可用性仍须表达同一状态。

`.phg-status` 独立挂在根节点下。每次显示、拖拽、缩放或窗口变化后，`_updateStatusPosition()` 以浮动入口为锚点优先放在上方，空间不足时放到下方，并把提示完整夹取在视口边距内；状态提示不能因面板开关或 SPA composer 重建漂移到旧位置。

## 维护选择器

1. 在当天真实 chatgpt.com 页面只读检查可见 composer、主 editor、fallback 和空段落结构。
2. 记录稳定语义属性；优先 `id`、`role`、`contenteditable`、`form`，不要依赖哈希 class。
3. 先在 `tests/chatgpt-editor.test.js` 添加能重现新 DOM 的失败测试，包括可见性、附件和块边界。
4. 更新 `tests/fixtures/chatgpt-composer.html` 的合成结构，再最小修改选择器/字符模型。
5. 运行 `npm run verify`，随后执行真实页面 `TEST_CHECKLIST.md`；fixture 不替代真实冒烟。

## 维护扩展版本

1. 先确定变更是否需要迁移存储或修改权限；权限扩大必须单独评审。
2. 发布标签不会自动改变扩展版本；设置页只读取 `chrome.runtime.getManifest().version`。创建 GitHub Release / `vX.Y.Z` 标签前，必须先把 `manifest.json` 与 `package.json` 同步为同一个 `X.Y.Z`。
3. 不改变脚本依赖顺序；如新增运行模块，同时更新 Manifest 测试、静态守卫与语法检查覆盖。
4. 执行 `npm run verify`，确认 Manifest 与 package 版本一致，再解析 Manifest JSON、核对图标哈希和全部必需文件。
5. 在 `chrome://extensions/` 重新加载扩展，刷新现有 ChatGPT 页面，再跑人工清单。

## 本地 fixture 与命令

`tests/fixtures/chatgpt-composer.html` 可用 `file://` 直接打开，也可从当前根目录通过静态服务访问。它先加载 `chrome-storage-mock.js`，再按 Manifest 顺序加载真实生产脚本。mock 使用浏览器 localStorage 持久化并实现 `storage.local.get/set/remove/clear` 与 `storage.onChanged`；localStorage 被禁用时退回当前页面会话内存。

```text
npm test
npm run check
npm run verify
```

`npm run check` 由外层 shell 对根目录生产 JavaScript 与 `tests/` 中的 JavaScript 逐个执行 `node --check`；完整性测试会把该清单与磁盘上的全部 JavaScript 对照。新增脚本时必须同步加入清单，不要通过排除文件来消除语法错误。
