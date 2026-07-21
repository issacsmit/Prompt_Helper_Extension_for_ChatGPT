# Quiet Orbit UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the functional-but-generic interface with the approved「静默轨道」launcher, compact panel, hover-revealed prompt actions, segmented dialogs, synchronized ChatGPT themes, and fluid accessible motion without changing prompt insertion or storage behavior.

**Architecture:** Keep the existing controller, storage, prompt engine, editor adapter, root singleton, and pointer-positioning logic. Change only `PromptHelperUI`'s DOM/state presentation and the namespaced stylesheet; use `data-phg-state="open|closed"` instead of `hidden` for the panel so closing can animate. Theme matching is CSS-driven from ChatGPT's root theme markers with a system fallback, so no new observer or permission is required.

**Tech Stack:** Chrome Manifest V3 content scripts, native JavaScript IIFEs/CommonJS test exports, namespaced CSS, Node 24 built-in test runner, self-contained local ChatGPT fixture.

## Global Constraints

- Preserve all behavior documented in `docs/superpowers/specs/2026-07-15-quiet-orbit-ui-design.md`.
- Continue matching only `https://chatgpt.com/*`; permissions remain exactly `storage`.
- Do not add background scripts, network access, remote assets, AI optimization, build tooling, packages, or runtime dependencies.
- Keep all extension DOM under `#phg-root`, all classes prefixed `phg-`, and all user content assigned through `textContent`/`value`.
- Preserve prompt CRUD, bookmark insertion, placeholder history, drag persistence, SPA singleton behavior, focus management, storage rollback, and cross-tab synchronization.
- The launcher icon must be a local inline SVG representing a conversation bubble, command caret, and small `P`; do not use Gemini or OpenAI artwork.
- Fine-pointer desktop UI hides edit/delete actions until `hover` or `focus-within`; coarse-pointer UI keeps them visible with at least 44 px targets.
- Main open/close motion animates only `transform` and `opacity`; the panel must not animate `filter: blur()`.
- Honor `prefers-reduced-motion: reduce` by removing stagger, displacement, scaling, and rail growth.
- Preserve the existing empty `.git` and `.agents` directories. This workspace is not a valid Git repository, so the checkpoint steps below record verification instead of making commits.

## File Map

- Modify `ui.js`: inline icon factory, launcher/panel/dialog markup, `data-phg-state` state machine, card action classes, status anchoring, and existing event checks.
- Replace visual rules in `content.css`: Quiet Orbit variables, launcher, panel, cards, dialogs, theme selectors, motion, coarse-pointer and reduced-motion fallbacks.
- Modify `tests/ui.test.js`: DOM/state contract tests and static CSS regression guards.
- Modify `tests/fixtures/chatgpt-composer-fixture.js`: make fixture theme changes also emulate ChatGPT's root `dark`/`light` markers.
- Modify `tests/fixtures/chatgpt-composer.css`: remove old direct extension color overrides and keep only fixture page theming/reduced-motion helpers.
- Modify `tests/file-integrity.test.js`: assert the fixture exercises ChatGPT-style theme markers and documentation covers the new UI regression surface.
- Modify `README.md`, `DEVELOPMENT.md`, and `TEST_CHECKLIST.md`: document the new visual behavior and manual checks.
- Do not modify `prompt-engine.js`, `storage.js`, or `chatgpt-editor.js` unless a failing regression demonstrates an actual integration defect.

---

### Task 1: Quiet Orbit DOM and Panel State Contract

**Files:**
- Modify: `tests/ui.test.js:579-797`
- Modify: `ui.js:598-802, 1028-1087, 1089-1239, 1317-1408`

**Interfaces:**
- Consumes: existing `createElement(document, tagName, options)`, `PromptHelperController`, drag/layout helpers, and `PromptHelperUI.openPanel()` / `closePanel()` callers.
- Produces: `createLauncherMark(document) -> Element`, `PromptHelperUI._isPanelOpen() -> boolean`, a panel with `data-phg-state`, and stable classes `.phg-panel-body`, `.phg-panel-footer`, `.phg-card-action`, `.phg-dialog-header`, `.phg-dialog-body`, `.phg-dialog-footer` for the stylesheet and tests.

- [ ] **Step 1: Replace the old mount-state assertions with a failing Quiet Orbit contract test**

In `tests/ui.test.js`, update the mount test and add the panel-state assertions below:

```js
test("PromptHelperUI mounts the Quiet Orbit launcher and three-part panel", () => {
  const { ui, root, documentObject } = mountUi();
  const launcher = documentObject.getElementById("phg-launcher");
  const panel = documentObject.getElementById("phg-panel");

  assert.equal(root.id, "phg-root");
  assert.equal(documentObject.querySelectorAll("#phg-root").length, 1);
  assert.equal(launcher.tagName, "BUTTON");
  assert.doesNotMatch(launcher.textContent, /提示词/u);
  assert.ok(launcher.querySelector(".phg-launcher-mark"));
  assert.ok(launcher.querySelector("svg"));
  assert.ok(launcher.querySelector(".phg-launcher-badge"));
  assert.equal(launcher.getAttribute("aria-controls"), "phg-panel");

  assert.equal(panel.getAttribute("data-phg-state"), "closed");
  assert.equal(panel.getAttribute("aria-hidden"), "true");
  assert.equal(panel.hidden, false);
  assert.equal(panel.inert, true);
  assert.ok(panel.querySelector(".phg-panel-header"));
  assert.ok(panel.querySelector(".phg-panel-body"));
  assert.ok(panel.querySelector(".phg-panel-footer"));
  assert.ok(documentObject.getElementById("phg-add-prompt"));

  ui.openPanel();
  assert.equal(panel.getAttribute("data-phg-state"), "open");
  assert.equal(panel.getAttribute("aria-hidden"), "false");
  assert.equal(panel.inert, false);
  assert.equal(launcher.getAttribute("aria-expanded"), "true");

  ui.closePanel({ restoreFocus: false });
  assert.equal(panel.getAttribute("data-phg-state"), "closed");
  assert.equal(panel.getAttribute("aria-hidden"), "true");
  assert.equal(panel.inert, true);
  assert.equal(launcher.getAttribute("aria-expanded"), "false");
});
```

Update existing assertions at the old lines 717, 767, 771, 782, and 789 to inspect `data-phg-state` instead of `panel.hidden`.

- [ ] **Step 2: Run the focused test and confirm the expected RED state**

Run:

```powershell
node --test --test-isolation=none tests/ui.test.js
```

Expected: FAIL because the launcher still contains `提示词`, the icon/panel sections do not exist, and the panel still uses `hidden`.

- [ ] **Step 3: Add a safe inline SVG factory**

In `ui.js`, immediately after `createElement`, add these helpers. The namespace fallback keeps the existing fake DOM working while real Chrome receives proper SVG elements.

```js
  const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

  function createSvgElement(documentObject, tagName, attributes = {}) {
    const element =
      typeof documentObject?.createElementNS === "function"
        ? documentObject.createElementNS(SVG_NAMESPACE, tagName)
        : documentObject.createElement(tagName);
    for (const [name, value] of Object.entries(attributes)) {
      element.setAttribute(name, String(value));
    }
    return element;
  }

  function createLauncherMark(documentObject) {
    const wrapper = createElement(documentObject, "span", {
      className: "phg-launcher-mark",
      attributes: { "aria-hidden": "true" },
    });
    const svg = createSvgElement(documentObject, "svg", {
      viewBox: "0 0 32 28",
      fill: "none",
      focusable: "false",
    });
    const bubble = createSvgElement(documentObject, "path", {
      d: "M5 4h16a5 5 0 0 1 5 5v7a5 5 0 0 1-5 5H13l-6 4v-4H5a5 5 0 0 1-5-5V9a5 5 0 0 1 5-5Z",
      class: "phg-launcher-bubble",
    });
    const caret = createSvgElement(documentObject, "path", {
      d: "m8 10 3 3-3 3M15 16h5",
      class: "phg-launcher-caret",
    });
    const badge = createElement(documentObject, "span", {
      className: "phg-launcher-badge",
      text: "P",
    });
    svg.append(bubble, caret);
    wrapper.append(svg, badge);
    return wrapper;
  }
```

- [ ] **Step 4: Rebuild the launcher and three-part panel without changing controller hooks**

In `PromptHelperUI.mount()`:

1. Remove `text: "提示词"` from the launcher and append `createLauncherMark(this._document)`.
2. Initialize the panel with `data-phg-state="closed"`, `aria-hidden="true"`, and `panel.inert = true`; do not set `panel.hidden`.
3. Make the header contain a `.phg-panel-identity` wrapper with `.phg-orbit-mark`, the existing `#phg-panel-title`, and a compact close button whose visible text is `×` and whose accessible name remains `关闭提示词助手`.
4. Put the list and empty state inside `.phg-panel-body`.
5. Move `#phg-add-prompt` into `.phg-panel-footer`; its content must be `.phg-add-icon` (`＋`), `.phg-add-label` (`创建提示词`), and `.phg-add-arrow` (`→`). Keep the same id and click handler.

Use this exact state helper and replace every `this._panel.hidden` branch in `openPanel`, `closePanel`, launcher click, Escape handling, `_updatePanelPosition`, and outside-pointer handling:

```js
    _isPanelOpen() {
      return this._panel?.getAttribute("data-phg-state") === "open";
    }

    _setPanelOpen(open) {
      if (!this._panel || !this._launcher) {
        return;
      }
      this._panel.setAttribute("data-phg-state", open ? "open" : "closed");
      this._panel.setAttribute("aria-hidden", open ? "false" : "true");
      this._panel.inert = !open;
      this._launcher.setAttribute("aria-expanded", open ? "true" : "false");
      this._launcher.setAttribute(
        "aria-label",
        open ? "关闭提示词助手" : "打开提示词助手",
      );
    }
```

`openPanel()` calls `_setPanelOpen(true)` then `_updatePanelPosition()`. `closePanel()` closes any dialog, calls `_setPanelOpen(false)`, and preserves the existing conditional focus restoration.

- [ ] **Step 5: Run UI and controller tests to confirm the state migration is GREEN**

Run:

```powershell
node --test --test-isolation=none tests/ui.test.js tests/controller.test.js
```

Expected: all UI/controller tests pass; insertion still calls `closePanel({ restoreFocus: false })` and drag-click suppression still leaves the panel closed.

- [ ] **Step 6: Add failing card and dialog structure tests**

Extend the existing render/dialog tests with:

```js
  const card = documentObject.querySelector(".phg-prompt-card");
  assert.ok(card.querySelector(".phg-card-main"));
  assert.ok(card.querySelector(".phg-card-actions"));
  assert.equal(card.querySelectorAll(".phg-card-action").length, 2);
  assert.ok(card.querySelector(".phg-card-action-danger"));

  ui.openPromptDialog(prompt, card.querySelector('[data-phg-action="edit"]'));
  const dialog = documentObject.getElementById("phg-dialog");
  assert.ok(dialog.querySelector(".phg-dialog-header"));
  assert.ok(dialog.querySelector(".phg-dialog-body"));
  assert.ok(dialog.querySelector(".phg-dialog-footer"));
```

Run the focused UI test and expect failure because those new classes/sections do not exist yet.

- [ ] **Step 7: Segment prompt/delete dialogs and assign stable card action classes**

Change `_createDialogShell(titleText)` to return `{ layer, dialog, header, body, footer, title }`. Build the header/body/footer as siblings, append `title` to `header`, and let each caller populate `body` and `footer`.

For the prompt form, append field wrappers and history to `.phg-dialog-body`, append cancel/save to `.phg-dialog-footer`, then append both sections to the form. For delete confirmation, append the message to `body`, the two buttons to `footer`, and append `header`, `body`, `footer` directly to the dialog. Preserve all ids, submit handlers, focus behavior, and retry retention.

Change card buttons to:

```js
className: "phg-card-action phg-card-action-edit"
```

and:

```js
className: "phg-card-action phg-card-action-danger"
```

Keep `data-phg-action`, ids, labels, disabled state, and event delegation unchanged.

- [ ] **Step 8: Run the full UI/controller suite and record the checkpoint**

Run:

```powershell
node --test --test-isolation=none tests/ui.test.js tests/controller.test.js
```

Expected: PASS. Record the result in `.superpowers/sdd/quiet-orbit-progress.md` as Task 1 complete; do not initialize or commit Git.

---

### Task 2: Launcher, Panel, Cards, and Fluid Motion Styling

**Files:**
- Modify: `tests/ui.test.js:798-end`
- Replace: `content.css`

**Interfaces:**
- Consumes: DOM classes and `data-phg-state` produced by Task 1.
- Produces: the exact Quiet Orbit visual tokens, fine/coarse pointer behavior, and motion contract consumed by browser regression in Task 4.

- [ ] **Step 1: Write failing static guards for the approved visual system**

Replace the old generic stylesheet test with focused assertions:

```js
test("content stylesheet encodes Quiet Orbit visuals and interaction states", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "content.css"), "utf8");

  assert.match(css, /--phg-panel:\s*#1f2024/u);
  assert.match(css, /--phg-card:\s*#232429/u);
  assert.match(css, /--phg-accent-start:\s*#6c79f4/u);
  assert.match(css, /--phg-accent-end:\s*#8a5dda/u);
  assert.match(css, /linear-gradient\(145deg,\s*var\(--phg-accent-start\)/u);
  assert.match(css, /\.phg-launcher::before/u);
  assert.match(css, /translate3d\(0,\s*-3px,\s*0\)\s*scale\(1\.035\)/u);
  assert.match(css, /\.phg-panel\[data-phg-state="open"\]/u);
  assert.match(css, /cubic-bezier\(\.16,\s*1,\s*\.3,\s*1\)/u);
  assert.match(css, /nth-child\(1\)[\s\S]*55ms/u);
  assert.match(css, /nth-child\(2\)[\s\S]*82ms/u);
  assert.match(css, /nth-child\(3\)[\s\S]*109ms/u);
  assert.match(css, /\.phg-prompt-card:hover[\s\S]*\.phg-card-actions/u);
  assert.match(css, /\.phg-prompt-card:focus-within[\s\S]*\.phg-card-actions/u);
  assert.match(css, /@media[^\{]*pointer:\s*coarse/u);
  assert.match(css, /prefers-reduced-motion:\s*reduce/u);
  assert.doesNotMatch(css, /\.phg-panel\s*\{[^}]*filter\s*:/u);
  assert.doesNotMatch(css, /(^|\})\s*(?:button|input|textarea|\*)\s*\{/mu);
});
```

- [ ] **Step 2: Run the static UI test and confirm RED**

Run:

```powershell
node --test --test-isolation=none tests/ui.test.js
```

Expected: FAIL on missing Quiet Orbit variables, launcher pseudo-element, open-state selector, stagger timing, and coarse-pointer rule.

- [ ] **Step 3: Replace root variables and launcher styling**

Start `content.css` with a fully namespaced reset and these exact tokens:

```css
#phg-root {
  --phg-page: #18191c;
  --phg-panel: #1f2024;
  --phg-card: #232429;
  --phg-card-hover: #27282e;
  --phg-text: #f4f4f6;
  --phg-muted: #8d8e97;
  --phg-border: #34353e;
  --phg-border-strong: #464853;
  --phg-accent-start: #6c79f4;
  --phg-accent-mid: #795fe5;
  --phg-accent-end: #8a5dda;
  --phg-danger: #ffaaa7;
  --phg-spring: cubic-bezier(.16, 1, .3, 1);
  position: fixed;
  inset: 0;
  z-index: 2147483000;
  pointer-events: none;
  color: var(--phg-text);
  font: 14px/1.45 ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
```

Implement the launcher at 52 px with the approved three-stop gradient, base shadow, internal highlight, `::before` radial halo, SVG stroke, `P` badge, hover transform `translate3d(0, -3px, 0) scale(1.035)`, active scale `0.97`, drag override, and `focus-visible` ring. The halo transitions only opacity/transform; it may have a static blur.

- [ ] **Step 4: Implement panel state and continuous open/close motion**

Use these state rules exactly as the motion backbone:

```css
#phg-root .phg-panel {
  position: fixed;
  width: min(348px, calc(100vw - 24px));
  max-height: min(540px, calc(100vh - 24px));
  overflow: hidden;
  visibility: hidden;
  border: 1px solid #393a44;
  border-radius: 14px;
  background: var(--phg-panel);
  background: color-mix(in srgb, var(--phg-panel) 98%, transparent);
  box-shadow: 0 25px 58px rgb(0 0 0 / 52%), inset 0 1px 0 rgb(255 255 255 / 4.5%);
  opacity: 0;
  pointer-events: none;
  transform: translate3d(11px, 16px, 0) scale(.955);
  transform-origin: var(--phg-panel-origin, right bottom);
  transition: transform 175ms cubic-bezier(.4, 0, 1, 1), opacity 125ms ease, visibility 0s linear 175ms;
}

#phg-root .phg-panel[data-phg-state="open"] {
  visibility: visible;
  opacity: 1;
  pointer-events: auto;
  transform: translate3d(0, 0, 0) scale(1);
  transition: transform 270ms var(--phg-spring), opacity 165ms ease, visibility 0s;
}
```

Use header/list/footer surfaces from the approved spec. Add the subtle top gradient line and orbit mark. Keep the body scrollable while header/footer remain fixed.

- [ ] **Step 5: Implement compact cards, rail growth, hover-only actions, and stagger**

Cards are 58 px minimum height with single-line preview. Their left `::before` rail grows from `scaleY(.2)` to `scaleY(1)` in 230 ms. Do not translate the whole card on hover.

Fine-pointer behavior:

```css
@media (hover: hover) and (pointer: fine) {
  #phg-root .phg-card-actions {
    opacity: 0;
    pointer-events: none;
    transform: translate3d(7px, 0, 0);
    transition: opacity 170ms ease 25ms, transform 235ms var(--phg-spring) 25ms;
  }

  #phg-root .phg-prompt-card:hover .phg-card-actions,
  #phg-root .phg-prompt-card:focus-within .phg-card-actions {
    opacity: 1;
    pointer-events: auto;
    transform: translate3d(0, 0, 0);
  }
}
```

Coarse-pointer behavior:

```css
@media (hover: none), (pointer: coarse) {
  #phg-root .phg-card-actions { opacity: 1; transform: none; }
  #phg-root .phg-card-action { min-width: 44px; min-height: 44px; }
}
```

When the panel is closed, visible rows are `opacity: 0` and translated down 5 px. When open, rows 1–3 transition with 55/82/109 ms delay; the footer begins at 130 ms. Do not stagger close.

- [ ] **Step 6: Implement the original create row and empty state**

Style the footer control as a neutral row, not a Gemini-style dashed CTA: 38 px desktop height, square muted-indigo plus tile, flexible label, and right arrow that moves 2 px on hover. The empty state uses an orbit outline, short Chinese copy, and the same create action without adding new functionality.

- [ ] **Step 7: Add reduced-motion overrides and run the focused tests**

The reduced-motion block must set transitions/animations to none for launcher, halo, caret, panel, rows, rails, actions, footer, dialog, overlay, and status. It must also remove closed/open displacement and row stagger while preserving visibility and pointer states.

Run:

```powershell
node --test --test-isolation=none tests/ui.test.js tests/controller.test.js
```

Expected: PASS. Record Task 2 complete in `.superpowers/sdd/quiet-orbit-progress.md`.

---

### Task 3: Dialogs, Themes, Status, and Fixture Theme Fidelity

**Files:**
- Modify: `ui.js:747-846, 1332-1384`
- Modify: `content.css`
- Modify: `tests/ui.test.js:641-727, 798-end`
- Modify: `tests/fixtures/chatgpt-composer-fixture.js:77-98`
- Modify: `tests/fixtures/chatgpt-composer.css:183-236`
- Modify: `tests/file-integrity.test.js:129-160, 213-289`

**Interfaces:**
- Consumes: segmented dialog DOM from Task 1 and Quiet Orbit variables from Task 2.
- Produces: ChatGPT-root theme selectors, compact dialog styling, anchored errors, and a fixture that changes the same theme markers as production.

- [ ] **Step 1: Add failing theme/dialog/static fixture assertions**

Append to the stylesheet test:

```js
  assert.match(css, /html\.dark\s+#phg-root/u);
  assert.match(css, /html\[data-theme="dark"\]\s+#phg-root/u);
  assert.match(css, /html\.light\s+#phg-root/u);
  assert.match(css, /prefers-color-scheme:\s*dark/u);
  assert.match(css, /\.phg-dialog-header/u);
  assert.match(css, /\.phg-dialog-body/u);
  assert.match(css, /\.phg-dialog-footer/u);
  assert.match(css, /\.phg-history-row/u);
  assert.match(css, /\.phg-status\[data-phg-kind="error"\]/u);
```

In `tests/file-integrity.test.js`, read `chatgpt-composer-fixture.js` and assert:

```js
assert.match(fixtureScript, /classList\.toggle\("dark"/u);
assert.match(fixtureScript, /classList\.toggle\("light"/u);
assert.match(fixtureScript, /setAttribute\("data-theme"/u);
```

Run `node --test --test-isolation=none tests/ui.test.js tests/file-integrity.test.js` and expect RED.

- [ ] **Step 2: Implement page-theme selectors with a system fallback**

Keep light tokens as a separate complete token set. Apply dark tokens for both selectors ChatGPT may expose:

```css
html.dark #phg-root,
html[data-theme="dark"] #phg-root {
  --phg-page: #18191c;
  --phg-panel: #1f2024;
  --phg-card: #232429;
  --phg-card-hover: #27282e;
  --phg-text: #f4f4f6;
  --phg-muted: #8d8e97;
  --phg-border: #34353e;
  --phg-border-strong: #464853;
}

html.light #phg-root,
html[data-theme="light"] #phg-root {
  --phg-page: #f5f5f4;
  --phg-panel: #ffffff;
  --phg-card: #f7f7f6;
  --phg-card-hover: #f0f0f4;
  --phg-text: #202123;
  --phg-muted: #6b6c72;
  --phg-border: #dedee3;
  --phg-border-strong: #c8c9d2;
}
```

Inside `@media (prefers-color-scheme: dark)`, apply the dark tokens only when the root lacks explicit `.light` and `[data-theme="light"]` markers. CSS selector changes update immediately when ChatGPT changes its root class/attribute; no JavaScript observer is added.

- [ ] **Step 3: Style segmented prompt/delete dialogs and history chips**

Set the prompt dialog to `min(410px, calc(100vw - 24px))`, maximum viewport height, 14 px radius, and independent header/body/footer. The body scrolls; the header/footer stay visible. Inputs use a two-layer low-opacity indigo focus ring. History rows render as compact pill-like values plus a distinct delete control. The delete confirmation reuses the same shell with a narrower `.phg-dialog[data-phg-kind="delete"]` width and dangerous primary action.

Keep every current focus trap, Esc path, opener restoration, busy state, and visible error behavior. Run the existing dialog tests after styling changes; no JavaScript semantics should change.

- [ ] **Step 4: Anchor visible status near the floating control**

Add `_updateStatusPosition()` in `PromptHelperUI` and call it from `showStatus`, `render`, `updateLayout`, drag move, and resize. Use the launcher rect, status rect, viewport, and a 12 px margin to place the toast above the launcher when space exists, otherwise below; clamp left/top to the viewport. Do not move focus to the status.

```js
    _updateStatusPosition() {
      if (!this._status || this._status.hidden || !this._launcher) {
        return;
      }
      const viewport = viewportSize(this._window, this._document);
      const launcherRect = this._launcher.getBoundingClientRect();
      const statusRect = this._status.getBoundingClientRect();
      const margin = 12;
      const gap = 10;
      const width = statusRect.width || Math.min(320, viewport.width - margin * 2);
      const height = statusRect.height || 44;
      const maximumLeft = Math.max(margin, viewport.width - width - margin);
      const maximumTop = Math.max(margin, viewport.height - height - margin);
      const preferredTop = launcherRect.top - height - gap;
      const fallbackTop = launcherRect.bottom + gap;
      setPositionStyle(this._status, {
        left: clamp(launcherRect.right - width, margin, maximumLeft),
        top: clamp(
          preferredTop >= margin ? preferredTop : fallbackTop,
          margin,
          maximumTop,
        ),
      });
    }
```

Add a UI test that calls `ui.showStatus("保存失败，请重试。", "error")`, asserts finite `style.left`/`style.top`, then moves the launcher through the existing drag sequence and confirms the status remains clamped inside the fake 900×700 viewport.

- [ ] **Step 5: Make the fixture emulate ChatGPT theme markers**

Replace the fixture theme handler with:

```js
  themeControl?.addEventListener("change", () => {
    const theme = themeControl.value;
    const root = documentObject.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.classList.toggle("light", theme === "light");
    if (theme === "system") {
      root.removeAttribute("data-theme");
      root.removeAttribute("data-fixture-theme");
    } else {
      root.setAttribute("data-theme", theme);
      root.setAttribute("data-fixture-theme", theme);
    }
    showStatus(`fixture 主题已切换为：${theme}。`);
  });
```

Remove the fixture CSS blocks that directly assign `--phg-*` colors. Retain fixture page colors and the explicit reduced-motion simulation block.

The fixture override must disable pseudo-element motion as well as element motion:

```css
html[data-fixture-reduced-motion="true"] #phg-root *,
html[data-fixture-reduced-motion="true"] #phg-root *::before,
html[data-fixture-reduced-motion="true"] #phg-root *::after {
  animation: none !important;
  transition: none !important;
}
```

- [ ] **Step 6: Run focused and full automated verification**

Run:

```powershell
node --test --test-isolation=none tests/ui.test.js tests/controller.test.js tests/file-integrity.test.js
npm run verify
```

Expected: focused tests PASS; then all syntax checks and the complete suite PASS with zero failures. Record Task 3 complete.

---

### Task 4: Documentation and Browser Regression

**Files:**
- Modify: `README.md`
- Modify: `DEVELOPMENT.md`
- Modify: `TEST_CHECKLIST.md`
- Modify: `tests/file-integrity.test.js`
- Use: `tests/fixtures/chatgpt-composer.html`

**Interfaces:**
- Consumes: complete UI and fixture from Tasks 1–3.
- Produces: user-facing documentation, a repeatable manual regression path, and final delivery evidence.

- [ ] **Step 1: Add failing documentation coverage assertions**

Extend the documentation test in `tests/file-integrity.test.js`:

```js
assert.match(readme, /静默轨道/u);
assert.match(readme, /悬停[\s\S]*编辑[\s\S]*删除/u);
assert.match(development, /data-phg-state/u);
assert.match(development, /cubic-bezier\(\.16,\s*1,\s*\.3,\s*1\)/u);
assert.match(checklist, /浮动入口[\s\S]*阴影/u);
assert.match(checklist, /词条[\s\S]*悬停[\s\S]*编辑/u);
assert.match(checklist, /减少动画/u);
assert.match(checklist, /粗指针|触屏/u);
```

Run `node --test --test-isolation=none tests/file-integrity.test.js` and expect RED.

- [ ] **Step 2: Update documentation with exact approved behavior**

Update:

- `README.md`: describe the custom launcher, compact three-part panel, hover/focus action reveal, theme synchronization, and unchanged privacy/permission boundary.
- `DEVELOPMENT.md`: document `data-phg-state`, panel animation timings, fine/coarse pointer CSS, root theme selectors, inline SVG safety, and reduced-motion behavior.
- `TEST_CHECKLIST.md`: add explicit checks for idle/hover/active/drag launcher states; repeated open/close smoothness; row hover/focus/coarse-pointer controls; light/dark/system theme switching; dialog segmentation; reduced motion; error anchoring; CRUD/insertion/SPA/attachment regressions.

Run the documentation test and expect PASS.

- [ ] **Step 3: Run the local fixture visual regression**

Serve the workspace locally without installing dependencies, open `tests/fixtures/chatgpt-composer.html`, and verify:

1. Launcher: no text/Gemini/OpenAI mark; base shadow is quiet; hover adds a soft halo and 3 px lift; press and drag feel distinct.
2. Motion: repeated open/close has no flash, blur, jump, or unclickable frame; panel settles near 270 ms and closes faster.
3. Cards: actions are absent at rest; only the hovered/focused card reveals edit/delete; clicking actions never inserts; clicking body inserts.
4. Dialog: three sections remain within viewport, fields/history work, save failure retains values, Esc/focus restoration work.
5. Themes: fixture light/dark/system changes immediately update extension variables.
6. Reduced motion: no stagger, scale, displacement, or rail growth; state remains understandable.
7. Functional safety: multiline insertion, placeholder caret, attachment preservation, send-button enablement, storage persistence, cross-tab change handling, and SPA composer rebuild still work.
8. Console: no extension errors or unhandled promise rejections.

Capture any defect as a failing automated regression before changing production code.

- [ ] **Step 4: Inspect current ChatGPT integration without sending a message**

On `https://chatgpt.com/`, confirm the extension does not overlap the composer/native controls at default and dragged positions, follows the live page theme, and survives navigation between new and existing conversations. Do not automatically send a prompt. If unpacked-extension installation is unavailable in the controlled browser, record that boundary and complete this step in the user's Chrome using `TEST_CHECKLIST.md`.

- [ ] **Step 5: Run final clean verification and review**

Run:

```powershell
npm run verify
Get-ChildItem -Force .git,.agents
```

Expected: every JavaScript syntax check passes; the complete Node suite reports zero failures; `.git` and `.agents` remain present and empty. Request a fresh read-only review against the design spec; fix any Critical/Important finding with a failing test first, then rerun `npm run verify`.

- [ ] **Step 6: Record completion without Git mutation**

Update `.superpowers/sdd/quiet-orbit-progress.md` with final test counts, browser checks, reviewer result, and any controlled-browser limitation. Do not initialize Git, create a branch, or delete the existing empty metadata directories.
