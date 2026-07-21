"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const FIXTURE_ROOT = path.join(__dirname, "fixtures");

const REQUIRED_FILES = Object.freeze([
  "manifest.json",
  "icons/icon16.png",
  "icons/icon48.png",
  "icons/icon128.png",
  "README.md",
  "DEVELOPMENT.md",
  "TEST_CHECKLIST.md",
  "tests/fixtures/chatgpt-composer.html",
  "tests/fixtures/chatgpt-composer.css",
  "tests/fixtures/chrome-storage-mock.js",
  "tests/fixtures/chatgpt-composer-fixture.js",
]);

const ICONS = Object.freeze({
  "icons/icon16.png": {
    width: 16,
    height: 16,
    sha256: "aa1feff200e78fc910e04f047666244242cd9399f0538e1ea3dd725b7a36bacc",
  },
  "icons/icon48.png": {
    width: 48,
    height: 48,
    sha256: "53cb2548dd31db4dd149ce26a7c911225e27671b23ae062e77ae80a41cf07006",
  },
  "icons/icon128.png": {
    width: 128,
    height: 128,
    sha256: "3b3720983658dc002e7be2e78cc973c0e0be2490a65850bf267782424864da0e",
  },
});

function absolute(relativePath) {
  return path.join(ROOT, ...relativePath.split("/"));
}

function readRequired(relativePath) {
  const filePath = absolute(relativePath);
  assert.ok(fs.existsSync(filePath), `${relativePath} must exist`);
  return fs.readFileSync(filePath, "utf8");
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function callbackResult(invoke) {
  return new Promise((resolve) => invoke(resolve));
}

function createLocalStorage(backing = new Map()) {
  return {
    getItem(key) {
      return backing.has(key) ? backing.get(key) : null;
    },
    setItem(key, value) {
      backing.set(key, String(value));
    },
    removeItem(key) {
      backing.delete(key);
    },
  };
}

function collectJavaScript(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectJavaScript(filePath));
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push(filePath);
    }
  }
  return files;
}

function loadStorageMock(source, localStorage) {
  const sandbox = {
    localStorage,
    queueMicrotask,
    setTimeout,
    clearTimeout,
  };
  vm.runInNewContext(source, sandbox, {
    filename: "chrome-storage-mock.js",
  });
  return sandbox.chrome;
}

test("all extension, documentation, and local fixture deliverables are non-empty", () => {
  for (const relativePath of REQUIRED_FILES) {
    const filePath = absolute(relativePath);
    assert.ok(fs.existsSync(filePath), `${relativePath} must exist`);
    assert.ok(fs.statSync(filePath).size > 0, `${relativePath} must not be empty`);
  }
  assert.equal(fs.existsSync(path.join(ROOT, "background.js")), false);
});

test("packaged PNG icons preserve the exact approved bytes and dimensions", () => {
  const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  for (const [relativePath, expected] of Object.entries(ICONS)) {
    const bytes = fs.readFileSync(absolute(relativePath));
    assert.equal(bytes.subarray(0, 8).equals(pngSignature), true, relativePath);
    assert.equal(bytes.toString("ascii", 12, 16), "IHDR", relativePath);
    assert.equal(bytes.readUInt32BE(16), expected.width, relativePath);
    assert.equal(bytes.readUInt32BE(20), expected.height, relativePath);
    assert.equal(
      crypto.createHash("sha256").update(bytes).digest("hex"),
      expected.sha256,
      relativePath,
    );
  }
});

test("browser fixture is self-contained and loads the real runtime in manifest order", () => {
  const html = readRequired("tests/fixtures/chatgpt-composer.html");
  const fixtureScript = readRequired("tests/fixtures/chatgpt-composer-fixture.js");
  const fixtureStyles = readRequired("tests/fixtures/chatgpt-composer.css");
  const scriptSources = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/gu)]
    .map((match) => match[1]);
  const stylesheetSources = [...html.matchAll(/<link\b[^>]*\bhref="([^"]+)"[^>]*>/gu)]
    .map((match) => match[1]);

  assert.deepEqual(scriptSources, [
    "chrome-storage-mock.js",
    "../../constants.js",
    "../../storage.js",
    "../../prompt-engine.js",
    "../../chatgpt-editor.js",
    "../../ui.js",
    "../../content.js",
    "chatgpt-composer-fixture.js",
  ]);
  assert.deepEqual(stylesheetSources, [
    "chatgpt-composer.css",
    "../../content.css",
  ]);
  assert.doesNotMatch(html, /(?:src|href)="(?:https?:)?\/\//iu);
  assert.match(html, /id="fixture-boundary-note"[\s\S]*合成 DOM[\s\S]*不等价/u);
  assert.doesNotMatch(html, /“提示词”浮钮/u);
  assert.match(
    html,
    /先在输入框放置光标，再操作右下角蓝紫色的“提示框 \+ 光标”浮动入口。发送动作会被本页拦截。/u,
  );
  assert.match(html, /id="fixture-rebuild"/u);
  assert.match(html, /id="fixture-reset-storage"/u);
  assert.match(html, /id="fixture-theme"/u);
  assert.match(html, /id="fixture-reduced-motion"/u);
  assert.match(html, /id="outside-editor"[^>]*contenteditable="true"/u);
  assert.match(html, /id="prompt-textarea"[^>]*contenteditable="true"/u);
  assert.match(html, /data-attachment-id=/u);
  assert.match(html, /<svg\b/u);
  assert.match(html, /id="spa-replacement-template"/u);
  assert.match(fixtureScript, /classList\.toggle\("dark"/u);
  assert.match(fixtureScript, /classList\.toggle\("light"/u);
  assert.match(fixtureScript, /setAttribute\("data-theme"/u);
  assert.doesNotMatch(
    fixtureStyles,
    /html\[data-fixture-theme="(?:dark|light)"\]\s+#phg-root/u,
  );
  assert.match(
    fixtureStyles,
    /html\[data-fixture-reduced-motion="true"\]\s+#phg-root\s+\*::before/u,
  );
  assert.match(
    fixtureStyles,
    /html\[data-fixture-reduced-motion="true"\]\s+#phg-root\s+\*::after/u,
  );
});

test("fixture chrome.storage mock supports persistence, callbacks, and local change events", async () => {
  const source = readRequired("tests/fixtures/chrome-storage-mock.js");
  const backing = new Map();
  const localStorage = createLocalStorage(backing);
  const firstChrome = loadStorageMock(source, localStorage);
  const observed = [];
  const listener = (changes, areaName) => {
    observed.push({ changes: plain(changes), areaName });
  };
  firstChrome.storage.onChanged.addListener(listener);

  await callbackResult((done) =>
    firstChrome.storage.local.set(
      {
        ph_prompts: [{ id: "fixture", name: "本地", prompt: "正文" }],
        ph_button_pos: { left: 24, top: 36 },
      },
      done,
    ),
  );
  const selected = await callbackResult((done) =>
    firstChrome.storage.local.get(["ph_prompts", "ph_button_pos"], done),
  );
  assert.deepEqual(plain(selected), {
    ph_prompts: [{ id: "fixture", name: "本地", prompt: "正文" }],
    ph_button_pos: { left: 24, top: 36 },
  });
  assert.equal(observed.length, 1);
  assert.equal(observed[0].areaName, "local");
  assert.equal(
    Object.hasOwn(observed[0].changes.ph_button_pos, "oldValue"),
    false,
  );
  assert.deepEqual(observed[0].changes.ph_button_pos.newValue, {
    left: 24,
    top: 36,
  });

  const reloadedChrome = loadStorageMock(source, localStorage);
  const persisted = await reloadedChrome.storage.local.get("ph_prompts");
  assert.deepEqual(plain(persisted.ph_prompts), [
    { id: "fixture", name: "本地", prompt: "正文" },
  ]);

  firstChrome.storage.onChanged.removeListener(listener);
  await callbackResult((done) => firstChrome.storage.local.clear(done));
  assert.equal(observed.length, 1);
  assert.deepEqual(plain(await reloadedChrome.storage.local.get(null)), {});
});

test("Chinese documentation covers product boundaries, architecture, and manual regression", () => {
  const readme = readRequired("README.md");
  for (const phrase of [
    "不自动发送",
    "不联网",
    "仅在 chatgpt.com",
    "加载已解压的扩展程序",
    "当前根目录",
    "新增",
    "编辑",
    "删除",
    "拖拽",
    "ph_prompts",
    "ph_placeholder_history",
    "ph_button_pos",
    "npm test",
    "刷新页面",
  ]) {
    assert.match(readme, new RegExp(phrase, "u"), `README.md must cover ${phrase}`);
  }
  assert.match(readme, /静默轨道/u);
  assert.match(readme, /悬停[\s\S]*编辑[\s\S]*删除/u);

  const development = readRequired("DEVELOPMENT.md");
  for (const phrase of [
    "无构建",
    "PromptHelper",
    "MutationObserver",
    "contenteditable",
    "textarea",
    "3000",
    "回滚",
    "跨标签",
    "选择器",
    "manifest.json",
  ]) {
    assert.match(
      development,
      new RegExp(phrase, "u"),
      `DEVELOPMENT.md must cover ${phrase}`,
    );
  }
  assert.match(development, /data-phg-state/u);
  assert.match(development, /cubic-bezier\(\.16,\s*1,\s*\.3,\s*1\)/u);

  const checklist = readRequired("TEST_CHECKLIST.md");
  for (const phrase of [
    "新对话",
    "旧对话",
    "临时对话",
    "开头",
    "中间",
    "结尾",
    "多行",
    "【光标】",
    "[光标]",
    "自定义占位符",
    "刷新",
    "附件",
    "不自动发送",
    "拖拽",
    "缩放",
    "SPA",
    "明色",
    "暗色",
    "减少动画",
    "Esc",
    "Tab",
    "焦点",
    "原生控件",
    "控制台",
    "网络",
  ]) {
    assert.match(
      checklist,
      new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"),
      `TEST_CHECKLIST.md must cover ${phrase}`,
    );
  }
  assert.match(checklist, /浮动入口[\s\S]*阴影/u);
  assert.match(checklist, /词条[\s\S]*悬停[\s\S]*编辑/u);
  assert.match(checklist, /减少动画/u);
  assert.match(checklist, /粗指针|触屏/u);
  assert.doesNotMatch(checklist, /“提示词”浮钮/u);
  assert.match(checklist, /只有一个蓝紫色“提示框 \+ 光标”浮动入口/u);
});

test("historical launcher design declares the later visual design as superseding it", () => {
  const historicalDesign = readRequired(
    "docs/superpowers/specs/2026-07-15-quiet-orbit-ui-design.md",
  );

  assert.match(historicalDesign, /Superseded launcher visuals/u);
  assert.match(
    historicalDesign,
    /2026-07-21-adaptive-actions-themes-position-design\.md/u,
  );
  assert.match(historicalDesign, /50x52 px rounded-rectangle/u);
  assert.match(historicalDesign, /without a `P` badge/u);
});

test("package scripts run the complete isolated suite and node --check every JavaScript file", () => {
  const packageJson = JSON.parse(readRequired("package.json"));

  assert.equal(packageJson.scripts?.test, "node --test --test-isolation=none");
  assert.equal(packageJson.scripts?.verify, "npm run check && npm test");

  const checkCommands = String(packageJson.scripts?.check || "").split(" && ");
  const checkedFiles = checkCommands.map((command) => {
    const match = /^node --check "?([^"\s]+)"?$/u.exec(command);
    assert.ok(match, `invalid syntax-check command: ${command}`);
    return match[1].replaceAll("\\", "/");
  });
  const expectedFiles = [
    ...fs
      .readdirSync(ROOT, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".js"))
      .map((entry) => path.join(ROOT, entry.name)),
    ...collectJavaScript(path.join(ROOT, "tests")),
  ]
    .filter((filePath) => path.basename(filePath) !== "check-js.js")
    .map((filePath) => path.relative(ROOT, filePath).replaceAll("\\", "/"))
    .sort();

  assert.deepEqual([...checkedFiles].sort(), expectedFiles);
});
