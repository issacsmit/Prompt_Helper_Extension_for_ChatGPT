# Adaptive Card Actions, Themes, and Position Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the black light-theme card actions with accessible SVG icon buttons, complete the extension's light/dark visual tokens, and place an unsaved launcher 24px from the viewport's right and bottom edges.

**Architecture:** Keep the existing `PromptHelperUI`, CSS-only ChatGPT theme detection, drag persistence, and viewport clamping. Add one safe inline-SVG factory for card actions, move theme-sensitive colors into `#phg-root` variables, and distinguish the 24px initial inset from the existing 12px draggable safety boundary.

**Tech Stack:** Chrome Manifest V3 content script, plain JavaScript, namespaced CSS, Node.js built-in test runner.

## Global Constraints

- Preserve prompt CRUD, insertion, storage keys, saved button positions, panel avoidance, SPA behavior, and the single `storage` permission.
- Use only fixed local SVG paths created with `createElementNS()`; do not use `innerHTML`, remote assets, icon packages, or user-derived SVG attributes.
- Theme styles remain scoped to `#phg-root` and follow ChatGPT's explicit root markers before the system preference fallback.
- Fine-pointer actions remain hover/focus revealed; coarse-pointer actions remain visible with at least 44 × 44px targets.
- New or unsaved positions use a 24px right/bottom inset; dragging and resize clamping retain the existing 12px safety boundary.
- The workspace's `.git` directory is empty. Do not initialize or repair Git as part of this plan; record the inability to make the normally required per-task commits.

## File Structure

- `ui.js`: safe action-icon construction, icon-only card action markup, default-position calculation.
- `content.css`: semantic dark/light tokens and card-action/icon component states.
- `tests/ui.test.js`: DOM, CSS, accessibility, and coordinate regression coverage.
- `README.md`: user-visible theme, icon, and initial-position behavior.
- `DEVELOPMENT.md`: SVG, theme-token, and positioning contracts.
- `TEST_CHECKLIST.md`: real-page visual and interaction checks.

---

### Task 1: Replace the Black Text Actions with Theme-Aware SVG Buttons

**Files:**
- Modify: `tests/ui.test.js:677`
- Modify: `tests/ui.test.js:962`
- Modify: `ui.js:564`
- Modify: `ui.js:1209`
- Modify: `content.css:1`
- Modify: `content.css:496`

**Interfaces:**
- Consumes: existing `createSvgElement(documentObject, tagName, attributes)` and delegated `data-phg-action` click handling.
- Produces: `createCardActionIcon(documentObject, kind) -> SVGElement`, where `kind` is `"edit"` or `"delete"`; buttons with `data-phg-action`, `aria-label`, `title`, and a single `svg[data-phg-icon]` child.

- [ ] **Step 1: Write failing DOM and CSS tests**

Extend `render shows empty state or accessible prompt cards and dispatches CRUD actions` immediately after locating the card actions:

```js
  const editButton = card.querySelector('[data-phg-action="edit"]');
  const deleteButton = card.querySelector('[data-phg-action="delete"]');
  for (const [button, kind, label] of [
    [editButton, "edit", "编辑提示词"],
    [deleteButton, "delete", "删除提示词"],
  ]) {
    assert.ok(button);
    assert.equal(button.getAttribute("title"), label);
    assert.match(button.getAttribute("aria-label"), new RegExp(label, "u"));
    const icon = button.querySelector("svg");
    assert.ok(icon);
    assert.equal(icon.getAttribute("data-phg-icon"), kind);
    assert.equal(icon.getAttribute("aria-hidden"), "true");
    assert.equal(button.textContent, "");
  }
```

Reuse the new `editButton` variable later in that test instead of declaring it a second time. Change `editButton.click()` to `editButton.querySelector("svg").click()` and change the later delete click to:

```js
  deleteButton.querySelector("svg").click();
```

This makes the regression exercise delegated events whose original target is the SVG rather than the button shell.

Add this standalone CSS regression test after the existing Quiet Orbit stylesheet test:

```js
test("card action icons use theme-aware surfaces without the light-theme black block", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "content.css"), "utf8");

  for (const token of [
    "action-bg",
    "action-bg-hover",
    "action-border",
    "action-icon",
    "danger-bg",
    "danger-bg-hover",
    "danger-border",
    "danger-icon",
  ]) {
    assert.match(css, new RegExp(`--phg-${token}:`, "u"), token);
  }
  assert.match(
    css,
    /#phg-root\s*\{[^}]*--phg-action-bg:\s*#292a30;[^}]*--phg-danger-icon:\s*#ffaaa7;/su,
  );
  assert.match(
    css,
    /html\.light\s+#phg-root,\s*html\[data-theme="light"\]\s+#phg-root\s*\{[^}]*--phg-action-bg:\s*#f3f3f5;[^}]*--phg-danger-icon:\s*#b42318;/su,
  );
  assert.match(
    css,
    /@media\s*\(prefers-color-scheme:\s*light\)\s*\{\s*html:not\(\.dark\):not\(\[data-theme="dark"\]\)\s+#phg-root\s*\{[^}]*--phg-action-bg:\s*#f3f3f5;[^}]*--phg-danger-icon:\s*#b42318;/su,
  );
  assert.match(
    css,
    /\.phg-card-action\s*\{[^}]*background:\s*var\(--phg-action-bg\);[^}]*color:\s*var\(--phg-action-icon\);/su,
  );
  assert.doesNotMatch(
    css,
    /\.phg-card-action\s*\{[^}]*background:\s*#202126;/su,
  );
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```powershell
node --test --test-isolation=none --test-name-pattern="render shows|card action icons" tests/ui.test.js
```

Expected: FAIL because the current edit/delete buttons contain visible text and no SVG, and the stylesheet has no semantic action tokens while `.phg-card-action` still uses `#202126`.

- [ ] **Step 3: Add the fixed inline SVG factory**

Insert this immediately after `createLauncherMark()` in `ui.js`:

```js
  function createCardActionIcon(documentObject, kind) {
    const icon = createSvgElement(documentObject, "svg", {
      viewBox: "0 0 20 20",
      width: "16",
      height: "16",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1.7",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      focusable: "false",
      "aria-hidden": "true",
      "data-phg-icon": kind,
      class: "phg-card-action-icon",
    });
    const pathData =
      kind === "delete"
        ? [
            "M4 5h12",
            "M7 5V3.5h6V5",
            "M5.5 5l.7 11h7.6l.7-11",
            "M8.2 8v5",
            "M11.8 8v5",
          ]
        : [
            "M4 13.8V16h2.2L15.4 6.8a1.55 1.55 0 0 0-2.2-2.2Z",
            "m11.7 6.1 2.2 2.2",
          ];
    for (const data of pathData) {
      icon.append(createSvgElement(documentObject, "path", { d: data }));
    }
    return icon;
  }
```

- [ ] **Step 4: Replace visible edit/delete text with icons and accessible labels**

Replace the two card action button constructions in `_renderPromptList()` with:

```js
        const edit = createElement(this._document, "button", {
          className: "phg-card-action phg-card-action-edit",
          type: "button",
          attributes: {
            "data-phg-action": "edit",
            "data-phg-id": record.id,
            "aria-label": `编辑提示词：${record.name}`,
            title: "编辑提示词",
          },
        });
        edit.append(createCardActionIcon(this._document, "edit"));
        const remove = createElement(this._document, "button", {
          className: "phg-card-action phg-card-action-danger",
          type: "button",
          attributes: {
            "data-phg-action": "delete",
            "data-phg-id": record.id,
            "aria-label": `删除提示词：${record.name}`,
            title: "删除提示词",
          },
        });
        remove.append(createCardActionIcon(this._document, "delete"));
```

- [ ] **Step 5: Add action-specific theme variables**

Add these dark defaults to `#phg-root` after `--phg-danger`:

```css
  --phg-action-bg: #292a30;
  --phg-action-bg-hover: #34353d;
  --phg-action-border: #3b3d47;
  --phg-action-icon: #c9cad1;
  --phg-danger-bg: rgb(255 170 167 / 8%);
  --phg-danger-bg-hover: rgb(255 170 167 / 15%);
  --phg-danger-border: rgb(255 170 167 / 24%);
  --phg-danger-icon: #ffaaa7;
```

Add these values to both the explicit light selector and the light system-fallback selector, immediately after `--phg-danger`:

```css
    --phg-action-bg: #f3f3f5;
    --phg-action-bg-hover: #e8e8ec;
    --phg-action-border: #d7d7dd;
    --phg-action-icon: #55565e;
    --phg-danger-bg: rgb(180 35 24 / 6%);
    --phg-danger-bg-hover: rgb(180 35 24 / 11%);
    --phg-danger-border: rgb(180 35 24 / 20%);
    --phg-danger-icon: #b42318;
```

- [ ] **Step 6: Style the icon controls without hardcoded black surfaces**

Replace the current `.phg-card-action`, hover, and danger declarations with:

```css
#phg-root .phg-card-action {
  display: grid;
  width: 32px;
  min-width: 32px;
  min-height: 32px;
  padding: 7px;
  place-items: center;
  border: 1px solid var(--phg-action-border);
  border-radius: 8px;
  background: var(--phg-action-bg);
  color: var(--phg-action-icon);
  cursor: pointer;
}

#phg-root .phg-card-action:hover {
  border-color: var(--phg-border-strong);
  background: var(--phg-action-bg-hover);
  color: var(--phg-text);
}

#phg-root .phg-card-action-danger {
  border-color: var(--phg-danger-border);
  background: var(--phg-danger-bg);
  color: var(--phg-danger-icon);
}

#phg-root .phg-card-action-danger:hover {
  border-color: var(--phg-danger-border);
  background: var(--phg-danger-bg-hover);
  color: var(--phg-danger-icon);
}

#phg-root .phg-card-action-icon {
  display: block;
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
  pointer-events: none;
}
```

Keep `.phg-icon-button-danger` and `.phg-history-delete` on `var(--phg-danger)`, but remove `.phg-card-action-danger` from their shared color-only selector because it now has a complete component rule.

- [ ] **Step 7: Run the focused tests and verify GREEN**

Run:

```powershell
node --test --test-isolation=none --test-name-pattern="render shows|card action icons" tests/ui.test.js
```

Expected: PASS. The existing CRUD assertions in the render test must still pass, proving delegated clicks continue to work when the event target is inside an SVG.

- [ ] **Step 8: Record commit limitation**

Run `git status --short`. Expected: `fatal: not a git repository` because `.git` is empty. Do not initialize Git; record that Task 1 changes remain uncommitted for this environmental reason.

---

### Task 2: Complete the Light and Dark Theme Tokens

**Files:**
- Modify: `tests/ui.test.js:962`
- Modify: `content.css:1`
- Modify: `content.css:100`
- Modify: `content.css:240`
- Modify: `content.css:308`
- Modify: `content.css:615`
- Modify: `content.css:677`
- Modify: `content.css:725`
- Modify: `content.css:743`
- Modify: `content.css:770`

**Interfaces:**
- Consumes: existing `html.dark`, `html[data-theme="dark"]`, `html.light`, `html[data-theme="light"]`, and `prefers-color-scheme` cascade.
- Produces: semantic tokens for dividers, header surfaces, muted icons, add controls, focus rings, and component shadows; no JavaScript theme observer.

- [ ] **Step 1: Write a failing complete-theme-token test**

Add after the action-control CSS test:

```js
test("both themes provide semantic chrome and shadow tokens", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "content.css"), "utf8");
  const tokens = [
    "divider",
    "header-surface",
    "footer-surface",
    "icon-muted",
    "add-bg",
    "add-border",
    "add-icon",
    "focus-ring",
    "launcher-shadow",
    "launcher-shadow-hover",
    "panel-shadow",
    "status-shadow",
    "dialog-shadow",
  ];

  for (const token of tokens) {
    assert.match(css, new RegExp(`--phg-${token}:`, "u"), token);
  }
  assert.match(
    css,
    /#phg-root\s*\{[^}]*--phg-header-surface:\s*#202126;[^}]*--phg-dialog-shadow:/su,
  );
  assert.match(
    css,
    /html\.light\s+#phg-root,\s*html\[data-theme="light"\]\s+#phg-root\s*\{[^}]*--phg-header-surface:\s*#fbfbfc;[^}]*--phg-dialog-shadow:/su,
  );
  assert.match(
    css,
    /@media\s*\(prefers-color-scheme:\s*light\)\s*\{\s*html:not\(\.dark\):not\(\[data-theme="dark"\]\)\s+#phg-root\s*\{[^}]*--phg-header-surface:\s*#fbfbfc;[^}]*--phg-dialog-shadow:/su,
  );
  assert.doesNotMatch(
    css,
    /\.phg-panel-header\s*\{[^}]*background:\s*#202126;/su,
  );
  assert.doesNotMatch(css, /\.phg-add-arrow\s*\{[^}]*color:\s*#777985;/su);
  assert.doesNotMatch(css, /\.phg-panel-close\s*\{[^}]*color:\s*#9899a3;/su);
});
```

- [ ] **Step 2: Run the theme test and verify RED**

Run:

```powershell
node --test --test-isolation=none --test-name-pattern="both themes provide" tests/ui.test.js
```

Expected: FAIL because the semantic chrome/shadow tokens do not exist and theme-sensitive hardcoded colors remain.

- [ ] **Step 3: Add the dark chrome and shadow defaults**

Add these variables to `#phg-root` after the action variables:

```css
  --phg-divider: rgb(70 72 83 / 64%);
  --phg-header-surface: #202126;
  --phg-footer-surface: #1e1f23;
  --phg-icon-muted: #9899a3;
  --phg-add-bg: rgb(108 121 244 / 14%);
  --phg-add-border: rgb(129 123 215 / 34%);
  --phg-add-icon: #a9a6ef;
  --phg-focus-ring: #8b83f0;
  --phg-launcher-shadow: 0 13px 30px rgb(6 7 15 / 42%), 0 3px 10px rgb(0 0 0 / 28%), inset 0 1px 0 rgb(255 255 255 / 27%);
  --phg-launcher-shadow-hover: 0 18px 38px rgb(8 7 24 / 48%), 0 6px 14px rgb(0 0 0 / 30%), inset 0 1px 0 rgb(255 255 255 / 32%);
  --phg-panel-shadow: 0 25px 58px rgb(0 0 0 / 52%), inset 0 1px 0 rgb(255 255 255 / 4.5%);
  --phg-status-shadow: 0 14px 34px rgb(0 0 0 / 42%);
  --phg-dialog-shadow: 0 28px 70px rgb(0 0 0 / 58%);
```

- [ ] **Step 4: Add complete explicit and system light overrides**

Add the following exact variables to both the explicit light selector and the light system-fallback selector after the action variables:

```css
    --phg-divider: #e1e1e5;
    --phg-header-surface: #fbfbfc;
    --phg-footer-surface: #fdfdfd;
    --phg-icon-muted: #74757d;
    --phg-add-bg: rgb(108 121 244 / 9%);
    --phg-add-border: rgb(99 91 212 / 24%);
    --phg-add-icon: #635bd4;
    --phg-focus-ring: #6259da;
    --phg-launcher-shadow: 0 13px 28px rgb(64 53 135 / 24%), 0 3px 9px rgb(35 31 63 / 16%), inset 0 1px 0 rgb(255 255 255 / 38%);
    --phg-launcher-shadow-hover: 0 17px 34px rgb(64 53 135 / 28%), 0 5px 12px rgb(35 31 63 / 18%), inset 0 1px 0 rgb(255 255 255 / 42%);
    --phg-panel-shadow: 0 22px 50px rgb(33 35 48 / 18%), inset 0 1px 0 rgb(255 255 255 / 72%);
    --phg-status-shadow: 0 12px 30px rgb(33 35 48 / 16%);
    --phg-dialog-shadow: 0 24px 60px rgb(33 35 48 / 22%);
```

- [ ] **Step 5: Replace theme-sensitive hardcoded component colors**

Make these exact declaration substitutions in `content.css`:

```css
/* .phg-launcher */
box-shadow: var(--phg-launcher-shadow);

/* .phg-panel */
border: 1px solid var(--phg-border-strong);
box-shadow: var(--phg-panel-shadow);

/* .phg-panel-header */
border-bottom: 1px solid var(--phg-divider);
background: var(--phg-header-surface);

/* .phg-panel-footer */
border-top: 1px solid var(--phg-divider);
background: var(--phg-footer-surface);

/* .phg-orbit-mark::after */
border: 1px solid var(--phg-panel);

/* .phg-add-icon */
border: 1px solid var(--phg-add-border);
background: var(--phg-add-bg);
color: var(--phg-add-icon);

/* .phg-add-arrow and .phg-panel-close */
color: var(--phg-icon-muted);

/* shared focus-visible rule */
outline: 2px solid var(--phg-focus-ring);

/* .phg-status */
box-shadow: var(--phg-status-shadow);

/* .phg-dialog */
box-shadow: var(--phg-dialog-shadow);

/* .phg-button-danger */
border-color: var(--phg-danger-border);
background: var(--phg-danger-bg);
color: var(--phg-danger-icon);

/* .phg-status[data-phg-kind="error"] */
border-color: var(--phg-danger-border);
color: var(--phg-danger-icon);

/* fine-pointer .phg-launcher:hover */
box-shadow: var(--phg-launcher-shadow-hover);
```

Keep the purple brand gradient fixed. Keep translucent overlays and tiny SVG drop shadows fixed because they express interaction/shape rather than a page-theme surface.

- [ ] **Step 6: Run the complete theme tests and verify GREEN**

Run:

```powershell
node --test --test-isolation=none --test-name-pattern="theme|stylesheet|action icons" tests/ui.test.js
```

Expected: PASS, including the existing explicit light/dark selector and danger-token tests.

- [ ] **Step 7: Record commit limitation**

Run `git status --short`. Expected: `fatal: not a git repository`. Do not initialize Git; record that Task 2 changes remain uncommitted for this environmental reason.

---

### Task 3: Give Unsaved Launchers a 24px Right-Bottom Inset

**Files:**
- Modify: `tests/ui.test.js:32`
- Modify: `ui.js:22`

**Interfaces:**
- Consumes: `clampFloatingPosition(position, viewport, size, margin)` callers and saved `{ left, top }` coordinates.
- Produces: backward-compatible `clampFloatingPosition(position, viewport, size, margin = 12, defaultInset = 24)`; valid explicit positions still clamp against `margin`, while missing coordinates start at `defaultInset` from the right/bottom.

- [ ] **Step 1: Change the default-position expectation**

In `floating positions default to the lower-right and stay recoverable`, change only the first expectation:

```js
  assert.deepEqual(
    uiApi.clampFloatingPosition(null, viewport, size, 12),
    { left: 248, top: 168 },
  );
```

Keep the out-of-range explicit-position expectation `{ left: 12, top: 180 }` and the tiny-viewport expectation `{ left: 0, top: 0 }` unchanged. This proves that only the unsaved default moves inward while the 12px draggable bounds remain stable.

- [ ] **Step 2: Run the position test and verify RED**

Run:

```powershell
node --test --test-isolation=none --test-name-pattern="floating positions default" tests/ui.test.js
```

Expected: FAIL with actual `{ left: 260, top: 180 }`, which is the current 12px default inset.

- [ ] **Step 3: Implement a distinct default inset**

Replace `clampFloatingPosition()` with:

```js
  function clampFloatingPosition(
    position,
    viewport,
    size,
    margin = 12,
    defaultInset = 24,
  ) {
    const safeMargin = Math.max(0, finiteNumber(margin));
    const safeDefaultInset = Math.max(0, finiteNumber(defaultInset, 24));
    const width = Math.max(0, finiteNumber(viewport?.width));
    const height = Math.max(0, finiteNumber(viewport?.height));
    const itemWidth = Math.max(0, finiteNumber(size?.width));
    const itemHeight = Math.max(0, finiteNumber(size?.height));
    const horizontal = axisBounds(width, itemWidth, safeMargin);
    const vertical = axisBounds(height, itemHeight, safeMargin);
    const defaultLeft = width - itemWidth - safeDefaultInset;
    const defaultTop = height - itemHeight - safeDefaultInset;
    const requestedLeft = finiteNumber(position?.left, defaultLeft);
    const requestedTop = finiteNumber(position?.top, defaultTop);

    return {
      left: clamp(requestedLeft, horizontal.minimum, horizontal.maximum),
      top: clamp(requestedTop, vertical.minimum, vertical.maximum),
    };
  }
```

Do not change the existing render, resize, panel, or drag calls that explicitly pass `12`; the new fifth-parameter default supplies the initial 24px inset only when a coordinate is absent.

- [ ] **Step 4: Run position and panel-layout tests and verify GREEN**

Run:

```powershell
node --test --test-isolation=none --test-name-pattern="floating positions|panel positioning|panel placement|drag" tests/ui.test.js
```

Expected: PASS. Explicit saved/dragged positions retain 12px clamping, and panel placement continues to stay inside the viewport.

- [ ] **Step 5: Record commit limitation**

Run `git status --short`. Expected: `fatal: not a git repository`. Do not initialize Git; record that Task 3 changes remain uncommitted for this environmental reason.

---

### Task 4: Document, Audit, and Fully Verify the Behavior

**Files:**
- Modify: `README.md:26`
- Modify: `README.md:63`
- Modify: `DEVELOPMENT.md:99`
- Modify: `DEVELOPMENT.md:110`
- Modify: `TEST_CHECKLIST.md:49`
- Modify: `TEST_CHECKLIST.md:76`

**Interfaces:**
- Consumes: the completed action-icon, theme-token, and default-position behavior.
- Produces: accurate user and maintainer documentation plus a complete verification record.

- [ ] **Step 1: Update user-facing behavior in `README.md`**

In the Quiet Orbit section, add:

```markdown
提示词卡片的编辑和删除操作使用铅笔、垃圾桶图标；精细指针下仅在当前卡片悬停或聚焦时显示，触屏设备始终显示。图标按钮会随明暗主题切换表面、边框和图标颜色，不在浅色主题中显示黑色按钮块。
```

In the drag section, add:

```markdown
没有已保存位置时，浮钮默认位于网页右下角，距右侧和底部各 24px；拖动后继续优先恢复用户保存的位置，并使用 12px 视口安全边界。
```

- [ ] **Step 2: Update implementation contracts in `DEVELOPMENT.md`**

In the Quiet Orbit visual contract, add:

```markdown
卡片编辑/删除图标与浮动入口一样由固定内联 SVG 构造，使用 `currentColor` 接收主题颜色；按钮必须保留 `aria-label`、`title`、焦点环和粗指针 44 px 目标。主题敏感的操作表面、分隔线、次级图标、创建入口与阴影只通过 `--phg-*` 语义变量取值，不得在组件规则中重新写入仅适用于暗色主题的黑灰色。
```

After the theme-selector paragraph, add:

```markdown
无持久位置时，`clampFloatingPosition()` 使用 24 px 默认内缩计算右下角坐标；显式保存/拖动坐标和窗口缩放仍按 12 px 安全边界夹取。默认内缩与可拖动边界是两个独立约束，不得通过增大全局 margin 改变已有用户位置。
```

- [ ] **Step 3: Extend the manual regression checklist**

Add under the Quiet Orbit section:

```markdown
- [ ] 清除 `ph_button_pos` 后刷新，浮钮距网页右侧、底部各约 24 px；拖到距边缘 12 px 的位置并刷新后仍恢复该保存坐标。
- [ ] 卡片的编辑和删除显示为铅笔、垃圾桶图标；悬停提示、中文无障碍名称、键盘焦点与点击行为正确，点击图标本身不会插入提示词。
```

Add under the theme section:

```markdown
- [ ] 浅色主题下编辑/删除图标使用浅色或淡红表面，不出现黑色按钮块；深色主题下两者仍有足够对比，切换主题后无需刷新即可更新。
- [ ] 标题栏分隔线、关闭图标、创建入口、焦点环、面板与弹窗阴影在明暗主题中均与页面一致。
```

- [ ] **Step 4: Run syntax checks**

Run:

```powershell
npm run check
```

Expected: exit code 0 with every listed JavaScript file passing `node --check`.

- [ ] **Step 5: Run the full automated test suite**

Run:

```powershell
npm test
```

Expected: exit code 0, zero failed tests, and no warnings or unhandled rejections.

- [ ] **Step 6: Run the canonical combined verification**

Run:

```powershell
npm run verify
```

Expected: exit code 0; both syntax checks and the full Node test suite pass in one fresh run.

- [ ] **Step 7: Inspect the final scope**

Run:

```powershell
Get-Item ui.js,content.css,tests\ui.test.js,README.md,DEVELOPMENT.md,TEST_CHECKLIST.md | Select-Object Name,Length,LastWriteTime
rg -n "#202126|phg-card-action-icon|--phg-action-bg|--phg-header-surface|defaultInset = 24|各 24px" ui.js content.css tests\ui.test.js README.md DEVELOPMENT.md TEST_CHECKLIST.md
```

Expected: the six intended files show updated timestamps; `#202126` may remain only as the dark value of `--phg-header-surface`, never as `.phg-card-action` or `.phg-panel-header` component styling; icon, theme, position, and documentation markers are present.

- [ ] **Step 8: Record commit limitation and handoff**

Run `git status --short`. Expected: `fatal: not a git repository`. Do not initialize Git. Report the modified files, fresh verification counts, and the empty-`.git` limitation to the user.
