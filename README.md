# ChatGPT 提示词助手 (Prompt Helper for ChatGPT)

一个 Chrome 扩展（Manifest V3），让你在 ChatGPT 网页版管理并快速插入常用提示词，同时把光标准确定位到占位符位置。

## 特性

- Quiet Orbit（静默轨道）界面以克制的浮动入口和紧凑面板管理提示词
- 浮动按钮一键唤出提示词面板，默认位于网页右下角
- 在当前光标位置插入提示词，不覆盖已有内容，也不自动发送
- 支持占位符自动定位光标（默认 `【光标】`，兼容 `[光标]`，也可自定义）
- 默认自动选中正文中第一处 `【任意内容】`，输入即可整体替换，可在插入设置中关闭
- 提示词支持新增、编辑、删除和本地持久化
- 浮动按钮支持拖拽，位置自动保存
- 浅色、深色与系统主题自适应，编辑和删除图标会同步切换颜色
- 在细指针设备上，提示词卡片悬停时显示编辑和删除图标；触屏设备始终显示这些操作
- 支持 `prefers-reduced-motion` 和键盘操作（Esc 关闭、Tab 焦点循环）
- 零运行依赖，不联网，不读取 API Key，不上传提示词或聊天内容

## 安装

本扩展暂未上架 Chrome Web Store，需要手动加载：

1. 克隆或下载本仓库：

   ```text
   git clone https://github.com/issacsmit/Prompt_Helper_Extension_for_ChatGPT.git
   ```

2. 打开 Chrome，访问 `chrome://extensions/`
3. 开启右上角的 **开发者模式**
4. 点击 **加载已解压的扩展程序**
5. 选择本仓库当前根目录（包含 `manifest.json`）
6. 打开或刷新 [ChatGPT](https://chatgpt.com/)，页面右下角应出现提示词助手浮动按钮

重新加载扩展后，已经打开的 ChatGPT 标签页也需要刷新，否则页面中仍然运行旧版 content script。

## 使用

1. 点击页面右下角的浮动按钮，打开提示词面板
2. 点击新增入口，填写提示词名称、内容和可选的自定义占位符
3. 把 ChatGPT 输入框的光标放到目标位置
4. 点击面板中的提示词卡片，将内容插入当前光标位置
5. 使用卡片上的铅笔或垃圾桶图标编辑、删除提示词
6. 按住浮动按钮拖动可调整位置；刷新页面后会恢复保存的位置

### 占位符

- 默认占位符：`【光标】`
- 兼容旧占位符：`[光标]`
- 可为每条提示词设置任意自定义字符串，例如 `<继续写>`
- `【光标】`、`[光标]` 和自定义光标占位符命中后会被移除，并把光标移动到该位置
- 没有命中上述光标占位符时，默认选中正文中第一处全角中括号占位符，例如 `【主题】`；用户直接输入即可替换整个 `【主题】`
- 同一条提示词包含多处 `【…】` 时只选中第一处，其余内容保持不变
- 点击面板标题栏的“插入设置”按钮，可关闭或重新开启 `【…】` 自动选中
- 冲突优先级固定为：当前提示词的自定义光标 → `【光标】` / `[光标]` → 第一处 `【…】` → 历史兼容占位符；没有实际命中的规则不会阻挡后续规则
- 最近使用的自定义占位符会自动去重并保留最多 5 条，可点击复用或单独删除

## 技术栈

- Chrome Extension Manifest V3
- 原生 JavaScript（content script，无构建步骤）
- 原生 CSS（无框架）
- Node.js 内置测试器

## 目录结构

```text
.
├── manifest.json        # 扩展清单、权限与脚本加载顺序
├── constants.js         # 常量与存储键
├── storage.js           # chrome.storage.local 访问与同步
├── prompt-engine.js     # 占位符匹配与光标位置计算
├── chatgpt-editor.js    # ChatGPT 输入框定位与插入适配
├── ui.js                # 面板、对话框、CRUD 与拖拽
├── content.js           # 初始化、单例与 SPA 生命周期
├── content.css          # 明暗主题与组件样式
├── icons/               # 扩展图标（16 / 48 / 128）
├── tests/               # 自动化测试与本地浏览器 fixture
├── DEVELOPMENT.md       # 架构和维护说明
└── TEST_CHECKLIST.md    # 真实页面人工回归清单
```

## 数据结构

数据存储于 `chrome.storage.local`：

| Key | 说明 |
| --- | --- |
| `ph_prompts` | 提示词列表 |
| `ph_placeholder_history` | 最近使用的自定义占位符，最多 5 条 |
| `ph_button_pos` | 浮动按钮位置 |
| `ph_auto_select_bracket_placeholder` | 是否自动选中第一处 `【…】`，缺失时默认开启 |

单条提示词示例：

```json
{
  "id": "timestamp+random",
  "name": "用户自定义名称",
  "prompt": "提示词内容，可含【光标】占位符",
  "placeholder": "【光标】"
}
```

## 隐私与权限

- 扩展只声明 `storage` 权限，仅在 chatgpt.com（`https://chatgpt.com/*`）页面运行
- 提示词、占位符历史和浮动按钮位置只保存在 Chrome 本地扩展存储中
- 扩展不发起网络请求，不调用模型服务，也不读取或保存 API Key
- 扩展不会上传提示词或聊天内容；插入后是否发送始终由用户决定
- 本项目不隶属于 OpenAI；“ChatGPT”只用于说明适配的网页产品

## 开发

项目无构建步骤、无第三方运行依赖。修改代码后：

1. 在 `chrome://extensions/` 中点击本扩展的 **重新加载**
2. 刷新已经打开的 ChatGPT 页面
3. 执行完整自动化验证：

   ```text
   npm test
   npm run check
   npm run verify
   ```

`npm run verify` 会先检查生产与测试 JavaScript 语法，再运行 Node.js 全量测试。项目不需要执行 `npm install`。

更多实现细节见 [DEVELOPMENT.md](DEVELOPMENT.md)，真实 ChatGPT 页面回归步骤见 [TEST_CHECKLIST.md](TEST_CHECKLIST.md)。本地合成页面可通过 `tests/fixtures/chatgpt-composer.html` 验证 CRUD、插入、主题、拖拽和 SPA 重建流程。
