(function exposePromptHelperUI(globalObject) {
  "use strict";

  const namespace = globalObject.PromptHelper || {};

  function finiteNumber(value, fallback = 0) {
    return Number.isFinite(value) ? value : fallback;
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function axisBounds(viewportLength, itemLength, margin) {
    const available = Math.max(0, viewportLength - itemLength);
    if (available < margin * 2) {
      return { minimum: 0, maximum: available };
    }
    return { minimum: margin, maximum: available - margin };
  }

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

  function calculatePanelPosition(
    buttonRect,
    panelSize,
    viewport,
    options = {},
  ) {
    const gap = Math.max(0, finiteNumber(options.gap, 8));
    const margin = Math.max(0, finiteNumber(options.margin, 12));
    const width = Math.max(0, finiteNumber(panelSize?.width));
    const height = Math.max(0, finiteNumber(panelSize?.height));
    const viewportWidth = Math.max(0, finiteNumber(viewport?.width));
    const viewportHeight = Math.max(0, finiteNumber(viewport?.height));
    const left = finiteNumber(buttonRect?.left);
    const top = finiteNumber(buttonRect?.top);
    const right = finiteNumber(buttonRect?.right, left + finiteNumber(buttonRect?.width));
    const bottom = finiteNumber(buttonRect?.bottom, top + finiteNumber(buttonRect?.height));
    const buttonWidth = finiteNumber(buttonRect?.width, Math.max(0, right - left));
    const buttonHeight = finiteNumber(buttonRect?.height, Math.max(0, bottom - top));
    const spaces = {
      below: viewportHeight - margin - bottom - gap,
      above: top - margin - gap,
      right: viewportWidth - margin - right - gap,
      left: left - margin - gap,
    };

    let placement;
    if (spaces.below >= height) {
      placement = "below";
    } else if (spaces.above >= height) {
      placement = "above";
    } else if (spaces.right >= width) {
      placement = "right";
    } else if (spaces.left >= width) {
      placement = "left";
    } else {
      placement = Object.entries(spaces).sort((first, second) => second[1] - first[1])[0][0];
    }

    let requestedLeft;
    let requestedTop;
    if (placement === "below" || placement === "above") {
      requestedLeft =
        left + buttonWidth / 2 > viewportWidth / 2 ? right - width : left;
      requestedTop = placement === "below" ? bottom + gap : top - gap - height;
    } else {
      requestedLeft = placement === "right" ? right + gap : left - gap - width;
      requestedTop = top + (buttonHeight - height) / 2;
    }

    const clamped = clampFloatingPosition(
      { left: requestedLeft, top: requestedTop },
      { width: viewportWidth, height: viewportHeight },
      { width, height },
      margin,
    );
    return { ...clamped, placement };
  }

  function isFocusableCandidate(element) {
    if (!element || element.disabled || element.hidden) {
      return false;
    }
    if (typeof element.getAttribute === "function") {
      return (
        element.getAttribute("aria-hidden") !== "true" &&
        element.getAttribute("aria-disabled") !== "true" &&
        element.getAttribute("tabindex") !== "-1"
      );
    }
    return true;
  }

  function getFocusCycleTarget(elements, activeElement, backwards = false) {
    const focusable = Array.from(elements || []).filter(isFocusableCandidate);
    if (focusable.length === 0) {
      return null;
    }
    const currentIndex = focusable.indexOf(activeElement);
    if (currentIndex === -1) {
      return backwards ? focusable[focusable.length - 1] : focusable[0];
    }
    const direction = backwards ? -1 : 1;
    return focusable[(currentIndex + direction + focusable.length) % focusable.length];
  }

  function isDragGesture(start, current, threshold = 6) {
    if (!start || !current) {
      return false;
    }
    const startX = finiteNumber(start.x, Number.NaN);
    const startY = finiteNumber(start.y, Number.NaN);
    const currentX = finiteNumber(current.x, Number.NaN);
    const currentY = finiteNumber(current.y, Number.NaN);
    if (![startX, startY, currentX, currentY].every(Number.isFinite)) {
      return false;
    }
    const safeThreshold = Math.max(0, finiteNumber(threshold, 6));
    const deltaX = currentX - startX;
    const deltaY = currentY - startY;
    return deltaX * deltaX + deltaY * deltaY > safeThreshold * safeThreshold;
  }

  function dropIndexFromDisplacement(fromIndex, deltaY, stride, count) {
    const last = Math.max(0, (Number.isInteger(count) ? count : 0) - 1);
    if (!Number.isInteger(fromIndex) || last === 0) {
      return 0;
    }
    const spacing = finiteNumber(stride);
    const offset = finiteNumber(deltaY);
    if (!Number.isFinite(spacing) || spacing <= 0 || !Number.isFinite(offset)) {
      return clamp(fromIndex, 0, last);
    }
    const slotsMoved = offset / spacing;
    const steps = Math.round(Math.abs(slotsMoved));
    return clamp(fromIndex + Math.sign(slotsMoved) * steps, 0, last);
  }

  function listDragShift(fromIndex, toIndex, index, stride) {
    const distance = finiteNumber(stride);
    if (
      !Number.isInteger(fromIndex) ||
      !Number.isInteger(toIndex) ||
      !Number.isInteger(index) ||
      index === fromIndex ||
      !Number.isFinite(distance)
    ) {
      return 0;
    }
    if (fromIndex < toIndex && index > fromIndex && index <= toIndex) {
      return -distance;
    }
    if (fromIndex > toIndex && index >= toIndex && index < fromIndex) {
      return distance;
    }
    return 0;
  }

  function promptPreviewText(prompt) {
    const previewText = String(prompt || "").replace(/\s+/gu, " ").trim();
    return previewText || "（正文为空）";
  }

  function moveIds(ids, fromIndex, toIndex) {
    if (!Array.isArray(ids)) {
      return [];
    }
    if (
      !Number.isInteger(fromIndex) ||
      !Number.isInteger(toIndex) ||
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= ids.length ||
      toIndex >= ids.length
    ) {
      return [...ids];
    }
    const next = [...ids];
    if (fromIndex !== toIndex) {
      const [id] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, id);
    }
    return next;
  }

  function reorderRecords(records, orderedIds) {
    if (!Array.isArray(records) || !Array.isArray(orderedIds)) {
      return null;
    }
    if (records.length !== orderedIds.length) {
      return null;
    }
    if (records.length === 0) {
      return [];
    }

    const byId = new Map();
    for (const record of records) {
      if (!record || typeof record.id !== "string" || byId.has(record.id)) {
        return null;
      }
      byId.set(record.id, record);
    }
    if (byId.size !== records.length) {
      return null;
    }

    const next = [];
    const seen = new Set();
    for (const id of orderedIds) {
      if (typeof id !== "string" || !byId.has(id) || seen.has(id)) {
        return null;
      }
      seen.add(id);
      next.push({ ...byId.get(id) });
    }
    return next;
  }

  function clonePrompts(prompts) {
    return Array.isArray(prompts)
      ? prompts.map((record) => ({ ...record }))
      : [];
  }

  function cloneControllerState(state) {
    return {
      prompts: clonePrompts(state?.prompts),
      placeholderHistory: Array.isArray(state?.placeholderHistory)
        ? [...state.placeholderHistory]
        : [],
      buttonPosition: state?.buttonPosition
        ? { ...state.buttonPosition }
        : null,
      autoSelectBracketPlaceholder:
        state?.autoSelectBracketPlaceholder !== false,
      loading: Boolean(state?.loading),
      busy: Boolean(state?.busy),
    };
  }

  function defaultIdFactory() {
    if (typeof globalObject.crypto?.randomUUID === "function") {
      return globalObject.crypto.randomUUID();
    }
    return `prompt-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  class PromptHelperController {
    constructor(options = {}) {
      this._storage = options.storage;
      this._editor = options.editor;
      this._view = options.view || null;
      this._prepareInsertion =
        options.prepareInsertion || namespace.prepareInsertion;
      this._updatePlaceholderHistory =
        options.updatePlaceholderHistory || namespace.updatePlaceholderHistory;
      this._idFactory = options.idFactory || defaultIdFactory;
      this._defaultPlaceholder =
        options.defaultPlaceholder || namespace.DEFAULT_PLACEHOLDER || "【光标】";
      this._state = {
        prompts: [],
        placeholderHistory: [],
        buttonPosition: null,
        autoSelectBracketPlaceholder: true,
        loading: false,
        busy: false,
      };
      this._initialized = false;
      this._destroyed = false;
      this._unsubscribe = null;
      this._externalSyncPending = false;
    }

    getState() {
      return cloneControllerState(this._state);
    }

    async initialize() {
      if (this._initialized) {
        return { ok: true, alreadyInitialized: true };
      }
      this._initialized = true;
      this._state.loading = true;
      this._render();

      let result = { ok: true };
      try {
        const loaded = await this._storage.load();
        if (!this._destroyed) {
          this._state = {
            ...cloneControllerState(loaded),
            loading: false,
            busy: false,
          };
        }
      } catch (error) {
        result = { ok: false, code: error?.code || "LOAD_FAILED" };
        this._state = {
          prompts: [],
          placeholderHistory: [],
          buttonPosition: null,
          autoSelectBracketPlaceholder: true,
          loading: false,
          busy: false,
        };
        this._showStatus("提示词加载失败，已使用安全空列表。", "error");
      }

      if (!this._destroyed) {
        this._render();
        this._subscribeToStorage(result.ok);
      }
      return result;
    }

    async savePrompt(input = {}) {
      if (!this._canWrite()) {
        return this._busyResult();
      }

      const name = typeof input.name === "string" ? input.name.trim() : "";
      if (!name) {
        this._showStatus("请输入提示词名称。", "error");
        return { ok: false, code: "NAME_REQUIRED" };
      }
      const prompt = typeof input.prompt === "string" ? input.prompt : "";
      const placeholder =
        typeof input.placeholder === "string" && input.placeholder.trim()
          ? input.placeholder.trim()
          : this._defaultPlaceholder;
      const providedId =
        typeof input.id === "string" && input.id.trim()
          ? input.id.trim()
          : null;
      const existingIndex = providedId
        ? this._state.prompts.findIndex((record) => record.id === providedId)
        : -1;
      if (providedId && existingIndex === -1) {
        this._showStatus("要编辑的提示词已不存在。", "error");
        return { ok: false, code: "PROMPT_NOT_FOUND" };
      }
      const generatedId = String(providedId || this._idFactory() || "").trim();
      if (!generatedId) {
        this._showStatus("无法生成提示词编号，请重试。", "error");
        return { ok: false, code: "ID_UNAVAILABLE" };
      }

      const record = {
        id: generatedId,
        name,
        prompt,
        placeholder,
      };
      const candidatePrompts = clonePrompts(this._state.prompts);
      if (existingIndex === -1) {
        candidatePrompts.push(record);
      } else {
        candidatePrompts[existingIndex] = record;
      }
      const candidateHistory = this._updatedHistory(placeholder);

      const result = await this._persistPromptCandidate(
        candidatePrompts,
        candidateHistory,
        "保存失败，请重试。",
      );
      return result.ok ? { ok: true, id: generatedId } : result;
    }

    async deletePrompt(id) {
      if (!this._canWrite()) {
        return this._busyResult();
      }
      const candidatePrompts = this._state.prompts.filter(
        (record) => record.id !== id,
      );
      if (candidatePrompts.length === this._state.prompts.length) {
        this._showStatus("要删除的提示词已不存在。", "error");
        return { ok: false, code: "PROMPT_NOT_FOUND" };
      }
      return this._persistPromptCandidate(
        candidatePrompts,
        this._state.placeholderHistory,
        "删除失败，请重试。",
      );
    }

    async reorderPrompts(orderedIds) {
      if (!this._canWrite()) {
        return this._busyResult();
      }
      const next = reorderRecords(this._state.prompts, orderedIds);
      if (!next) {
        this._showStatus("无法调整提示词顺序，请刷新后重试。", "error");
        return { ok: false, code: "INVALID_ORDER" };
      }
      if (next.every((record, index) => record.id === this._state.prompts[index].id)) {
        return { ok: true };
      }
      return this._persistPromptCandidate(
        next,
        this._state.placeholderHistory,
        "调整顺序失败，请重试。",
        { optimistic: true, silent: true },
      );
    }

    async deletePlaceholderHistory(placeholder) {
      if (!this._canWrite()) {
        return this._busyResult();
      }
      const candidateHistory = this._state.placeholderHistory.filter(
        (value) => value !== placeholder,
      );
      if (candidateHistory.length === this._state.placeholderHistory.length) {
        return { ok: false, code: "HISTORY_NOT_FOUND" };
      }
      return this._persistPromptCandidate(
        this._state.prompts,
        candidateHistory,
        "删除历史失败，请重试。",
      );
    }

    async insertPrompt(id) {
      const record = this._state.prompts.find((entry) => entry.id === id);
      if (!record) {
        this._showStatus("要插入的提示词已不存在。", "error");
        return { ok: false, code: "PROMPT_NOT_FOUND" };
      }
      if (
        typeof this._prepareInsertion !== "function" ||
        typeof this._editor?.insert !== "function"
      ) {
        this._showStatus("提示词插入功能暂不可用。", "error");
        return { ok: false, code: "INSERTION_UNAVAILABLE" };
      }

      let insertion;
      try {
        const prepared = this._prepareInsertion(
          { ...record },
          [...this._state.placeholderHistory],
          {
            autoSelectBracketPlaceholder:
              this._state.autoSelectBracketPlaceholder,
          },
        );
        insertion = await Promise.resolve(
          this._editor.insert(
            prepared.text,
            prepared.caretOffset,
            prepared.selectionEndOffset,
          ),
        );
      } catch (_error) {
        insertion = { ok: false, code: "INSERTION_FAILED" };
      }

      if (insertion?.ok) {
        if (typeof this._view?.closePanel === "function") {
          this._view.closePanel({ restoreFocus: false });
        }
        return { ok: true, code: insertion.code || "INSERTED" };
      }

      const code = insertion?.code || "INSERTION_FAILED";
      if (code === "EDITOR_NOT_FOUND") {
        this._showStatus("未找到 ChatGPT 输入框，请稍后重试。", "error");
      } else if (code === "INSERTION_FAILED") {
        this._showStatus("插入失败，ChatGPT 输入框未接受内容。", "error");
      } else {
        this._showStatus("提示词插入失败，请重试。", "error");
      }
      return { ok: false, code };
    }

    async saveButtonPosition(position) {
      if (!this._canWrite()) {
        return this._busyResult();
      }
      if (
        !position ||
        !Number.isFinite(position.left) ||
        !Number.isFinite(position.top) ||
        position.left < 0 ||
        position.top < 0
      ) {
        return { ok: false, code: "INVALID_POSITION" };
      }

      const candidate = { left: position.left, top: position.top };
      this._state.buttonPosition = candidate;
      this._state.busy = true;
      this._render();
      try {
        await this._storage.saveButtonPosition(candidate);
        this._state.busy = false;
        this._render();
        this._flushExternalSync();
        return { ok: true };
      } catch (error) {
        this._state.busy = false;
        this._render();
        this._showStatus("按钮位置保存失败，当前位置会保留到本页关闭。", "error");
        this._flushExternalSync();
        return { ok: false, code: error?.code || "SAVE_FAILED" };
      }
    }

    async setAutoSelectBracketPlaceholder(enabled) {
      if (!this._canWrite()) {
        return this._busyResult();
      }
      if (typeof this._storage?.saveAutoSelectBracketPlaceholder !== "function") {
        this._showStatus("插入设置暂时无法保存。", "error");
        return { ok: false, code: "SETTING_UNAVAILABLE" };
      }

      const snapshot = cloneControllerState(this._state);
      const candidate = Boolean(enabled);
      this._state.busy = true;
      this._render();
      try {
        await this._storage.saveAutoSelectBracketPlaceholder(candidate);
        this._state = {
          ...snapshot,
          autoSelectBracketPlaceholder: candidate,
          busy: false,
          loading: false,
        };
        this._render();
        this._flushExternalSync();
        return { ok: true };
      } catch (error) {
        this._state = { ...snapshot, busy: false, loading: false };
        this._render();
        this._showStatus("插入设置保存失败，请重试。", "error");
        this._flushExternalSync();
        return { ok: false, code: error?.code || "SAVE_FAILED" };
      }
    }

    captureBookmark() {
      if (typeof this._editor?.captureBookmark !== "function") {
        return null;
      }
      try {
        return this._editor.captureBookmark();
      } catch (_error) {
        this._showStatus("暂时无法记录输入框光标位置。", "error");
        return null;
      }
    }

    destroy() {
      if (this._destroyed) {
        return;
      }
      this._destroyed = true;
      if (typeof this._unsubscribe === "function") {
        try {
          this._unsubscribe();
        } catch (_error) {
          // Extension invalidation during teardown must not escape.
        }
      }
      this._unsubscribe = null;
      this._externalSyncPending = false;
    }

    _canWrite() {
      return !this._destroyed && !this._state.busy;
    }

    _busyResult() {
      this._showStatus("正在保存，请稍候。", "error");
      return { ok: false, code: "BUSY" };
    }

    _updatedHistory(placeholder) {
      if (typeof this._updatePlaceholderHistory !== "function") {
        return [...this._state.placeholderHistory];
      }
      return this._updatePlaceholderHistory(
        [...this._state.placeholderHistory],
        placeholder,
      );
    }

    async _persistPromptCandidate(
      candidatePrompts,
      candidateHistory,
      errorMessage,
      options = {},
    ) {
      const snapshot = cloneControllerState(this._state);
      this._state.busy = true;
      if (options.optimistic) {
        this._state.prompts = clonePrompts(candidatePrompts);
        this._state.placeholderHistory = [...candidateHistory];
      }
      if (!options.silent) {
        this._render();
      }
      try {
        await this._storage.savePrompts(candidatePrompts, candidateHistory);
        this._state = {
          ...snapshot,
          prompts: clonePrompts(candidatePrompts),
          placeholderHistory: [...candidateHistory],
          busy: false,
          loading: false,
        };
        this._render();
        this._flushExternalSync();
        return { ok: true };
      } catch (error) {
        this._state = { ...snapshot, busy: false, loading: false };
        this._render();
        this._showStatus(errorMessage, "error");
        this._flushExternalSync();
        return { ok: false, code: error?.code || "SAVE_FAILED" };
      }
    }

    _subscribeToStorage(reportError = true) {
      if (typeof this._storage?.subscribe !== "function" || this._unsubscribe) {
        return;
      }
      try {
        this._unsubscribe = this._storage.subscribe(() =>
          this._handleExternalStorageChange(),
        );
      } catch (_error) {
        if (reportError) {
          this._showStatus("跨标签页同步暂不可用。", "error");
        }
      }
    }

    _handleExternalStorageChange() {
      if (this._destroyed) {
        return Promise.resolve();
      }
      if (this._state.busy) {
        this._externalSyncPending = true;
        return Promise.resolve();
      }
      return this._reloadExternalState();
    }

    async _reloadExternalState() {
      if (this._destroyed) {
        return;
      }
      try {
        const loaded = await this._storage.load();
        if (this._destroyed) {
          return;
        }
        this._state = {
          ...cloneControllerState(loaded),
          loading: false,
          busy: false,
        };
        this._render();
      } catch (_error) {
        if (!this._destroyed) {
          this._showStatus("跨标签页同步失败，请刷新后重试。", "error");
        }
      }
    }

    _flushExternalSync() {
      if (!this._externalSyncPending || this._destroyed) {
        return;
      }
      this._externalSyncPending = false;
      void this._reloadExternalState();
    }

    _render() {
      if (this._destroyed || typeof this._view?.render !== "function") {
        return;
      }
      this._view.render(this.getState());
    }

    _showStatus(message, kind) {
      if (this._destroyed || typeof this._view?.showStatus !== "function") {
        return;
      }
      this._view.showStatus(message, kind);
    }
  }

  function createElement(documentObject, tagName, options = {}) {
    const element = documentObject.createElement(tagName);
    if (options.id) {
      element.id = options.id;
    }
    if (options.className) {
      element.className = options.className;
    }
    if (options.text !== undefined) {
      element.textContent = options.text;
    }
    if (options.type) {
      element.type = options.type;
    }
    for (const [name, value] of Object.entries(options.attributes || {})) {
      element.setAttribute(name, value);
    }
    return element;
  }

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
      viewBox: "0 0 100 104.586",
      fill: "none",
      focusable: "false",
      preserveAspectRatio: "xMidYMid meet",
    });
    const prompt = createSvgElement(documentObject, "path", {
      d: "M54.9 74.6H30.4A10.8 10.8 0 0 1 19.6 63.8V38.4A10.8 10.8 0 0 1 30.4 27.6h39.6a10.8 10.8 0 0 1 10.8 10.8v25.4a10.8 10.8 0 0 1-2.5 6.9",
      class: "phg-launcher-prompt",
    });
    const insertion = createSvgElement(documentObject, "path", {
      d: "M31.4 39.6v20.5",
      class: "phg-launcher-insertion",
    });
    const outerClickRing = createSvgElement(documentObject, "circle", {
      cx: "61.4",
      cy: "64.5",
      r: "10.8",
      class: "phg-launcher-click-ring phg-launcher-click-ring-outer",
    });
    const innerClickRing = createSvgElement(documentObject, "circle", {
      cx: "61.4",
      cy: "64.5",
      r: "6.5",
      class: "phg-launcher-click-ring phg-launcher-click-ring-inner",
    });
    const pointer = createSvgElement(documentObject, "path", {
      d: "M61.1 64.1 61.8 80.2 65.1 77.1 69.1 83.4 71.5 81.8 67.9 75.9 73.2 75Z",
      class: "phg-launcher-pointer",
    });
    svg.append(prompt, insertion, outerClickRing, innerClickRing, pointer);
    wrapper.append(svg);
    return wrapper;
  }

  function createCardDragIcon(documentObject) {
    const icon = createSvgElement(documentObject, "svg", {
      viewBox: "0 0 20 20",
      width: "16",
      height: "16",
      fill: "currentColor",
      focusable: "false",
      "aria-hidden": "true",
      "data-phg-icon": "reorder",
      class: "phg-card-drag-icon",
    });
    for (const [cx, cy] of [
      [7, 5],
      [13, 5],
      [7, 10],
      [13, 10],
      [7, 15],
      [13, 15],
    ]) {
      icon.append(createSvgElement(documentObject, "circle", { cx, cy, r: "1.45" }));
    }
    return icon;
  }

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

  function createSettingsIcon(documentObject) {
    const icon = createSvgElement(documentObject, "svg", {
      viewBox: "0 0 20 20",
      width: "17",
      height: "17",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1.6",
      "stroke-linecap": "round",
      focusable: "false",
      "aria-hidden": "true",
      class: "phg-settings-icon",
    });
    for (const data of ["M4 5h12", "M4 10h12", "M4 15h12"]) {
      icon.append(createSvgElement(documentObject, "path", { d: data }));
    }
    for (const [cx, cy] of [
      [7, 5],
      [13, 10],
      [9, 15],
    ]) {
      icon.append(
        createSvgElement(documentObject, "circle", {
          cx,
          cy,
          r: "1.55",
          fill: "var(--phg-header-surface)",
        }),
      );
    }
    return icon;
  }

  function viewportSize(windowObject, documentObject) {
    return {
      width: Math.max(
        0,
        finiteNumber(
          windowObject?.innerWidth,
          documentObject?.documentElement?.clientWidth || 0,
        ),
      ),
      height: Math.max(
        0,
        finiteNumber(
          windowObject?.innerHeight,
          documentObject?.documentElement?.clientHeight || 0,
        ),
      ),
    };
  }

  function positionFromStyle(element) {
    return {
      left: Number.parseFloat(element?.style?.left) || 0,
      top: Number.parseFloat(element?.style?.top) || 0,
    };
  }

  function setPositionStyle(element, position) {
    if (!element || !position) {
      return;
    }
    element.style.left = `${position.left}px`;
    element.style.top = `${position.top}px`;
  }

  class PromptHelperUI {
    constructor(options = {}) {
      this._document = options.document || globalObject.document || null;
      this._window =
        options.window || this._document?.defaultView || globalObject.window || null;
      this._controller = null;
      this._root = null;
      this._launcher = null;
      this._panel = null;
      this._list = null;
      this._empty = null;
      this._status = null;
      this._addButton = null;
      this._settingsButton = null;
      this._closeButton = null;
      this._dialogLayer = null;
      this._dialog = null;
      this._dialogOpener = null;
      this._dialogKind = null;
      this._dialogRecord = null;
      this._state = cloneControllerState({});
      this._buttonPosition = null;
      this._drag = null;
      this._listDrag = null;
      this._suppressNextClick = false;
      this._suppressNextInsert = false;
      this._destroyed = false;
      this._onResize = () => this._handleResize();
      this._onDocumentPointerDown = (event) =>
        this._handleDocumentPointerDown(event);
    }

    get root() {
      return this._root;
    }

    mount(controller) {
      if (this._root) {
        if (controller) {
          this._controller = controller;
        }
        this.ensureMounted();
        return this._root;
      }
      if (!this._document || typeof this._document.createElement !== "function") {
        return null;
      }
      this._controller = controller || this._controller;

      const existing = this._document.getElementById?.("phg-root");
      if (existing) {
        this._root = existing;
        return existing;
      }

      const root = createElement(this._document, "div", {
        id: "phg-root",
        className: "phg-root",
        attributes: { "data-phg-ui": "prompt-helper" },
      });
      const launcher = createElement(this._document, "button", {
        id: "phg-launcher",
        className: "phg-launcher",
        type: "button",
        attributes: {
          "aria-label": "打开提示词助手",
          "aria-controls": "phg-panel",
          "aria-expanded": "false",
        },
      });
      launcher.append(createLauncherMark(this._document));
      const panel = createElement(this._document, "section", {
        id: "phg-panel",
        className: "phg-panel",
        attributes: {
          role: "dialog",
          "aria-modal": "false",
          "aria-labelledby": "phg-panel-title",
          "data-phg-state": "closed",
          "aria-hidden": "true",
        },
      });
      panel.inert = true;

      const header = createElement(this._document, "header", {
        className: "phg-panel-header",
      });
      const identity = createElement(this._document, "div", {
        className: "phg-panel-identity",
      });
      const orbitMark = createElement(this._document, "span", {
        className: "phg-orbit-mark",
        attributes: { "aria-hidden": "true" },
      });
      const title = createElement(this._document, "h2", {
        id: "phg-panel-title",
        className: "phg-panel-title",
        text: "提示词助手",
      });
      const closeButton = createElement(this._document, "button", {
        id: "phg-close-panel",
        className: "phg-icon-button phg-panel-close",
        type: "button",
        text: "×",
        attributes: { "aria-label": "关闭提示词助手" },
      });
      const settingsButton = createElement(this._document, "button", {
        id: "phg-open-settings",
        className: "phg-icon-button phg-panel-settings",
        type: "button",
        attributes: {
          "aria-label": "打开插入设置",
          title: "插入设置",
        },
      });
      settingsButton.append(createSettingsIcon(this._document));
      const panelActions = createElement(this._document, "div", {
        className: "phg-panel-actions",
      });
      panelActions.append(settingsButton, closeButton);
      identity.append(orbitMark, title);
      header.append(identity, panelActions);

      const body = createElement(this._document, "div", {
        className: "phg-panel-body",
      });
      const list = createElement(this._document, "div", {
        id: "phg-prompt-list",
        className: "phg-prompt-list",
        attributes: { "aria-label": "提示词列表" },
      });
      const empty = createElement(this._document, "p", {
        id: "phg-empty",
        className: "phg-empty",
        text: "还没有提示词，点击“新增”创建第一条。",
      });
      body.append(list, empty);

      const footer = createElement(this._document, "footer", {
        className: "phg-panel-footer",
      });
      const addButton = createElement(this._document, "button", {
        id: "phg-add-prompt",
        className: "phg-button phg-button-primary",
        type: "button",
        attributes: { "aria-label": "新增提示词" },
      });
      const addIcon = createElement(this._document, "span", {
        className: "phg-add-icon",
        text: "＋",
      });
      const addLabel = createElement(this._document, "span", {
        className: "phg-add-label",
        text: "创建提示词",
      });
      const addArrow = createElement(this._document, "span", {
        className: "phg-add-arrow",
        text: "→",
      });
      addButton.append(addIcon, addLabel, addArrow);
      footer.append(addButton);

      const status = createElement(this._document, "div", {
        id: "phg-status",
        className: "phg-status",
        attributes: { role: "status", "aria-live": "polite" },
      });
      status.hidden = true;
      panel.append(header, body, footer);
      root.append(launcher, panel, status);

      this._root = root;
      this._launcher = launcher;
      this._panel = panel;
      this._list = list;
      this._empty = empty;
      this._status = status;
      this._addButton = addButton;
      this._settingsButton = settingsButton;
      this._closeButton = closeButton;
      this._bindEvents();
      this.ensureMounted();
      this.render(this._state);
      return root;
    }

    ensureMounted() {
      if (!this._root || this._root.isConnected || this._destroyed) {
        return this._root;
      }
      const parent = this._document?.body || this._document?.documentElement;
      parent?.appendChild?.(this._root);
      return this._root;
    }

    render(state) {
      this._state = cloneControllerState(state || {});
      if (!this._root) {
        return;
      }
      this.ensureMounted();
      this._renderPromptList();
      this._addButton.disabled = this._state.busy || this._state.loading;
      this._settingsButton.disabled = this._state.busy || this._state.loading;
      this._launcher.disabled = this._state.loading;
      const buttonRect = this._launcher.getBoundingClientRect();
      const buttonSize = {
        width: buttonRect.width || 52,
        height: buttonRect.height || 52,
      };
      this._buttonPosition = clampFloatingPosition(
        this._state.buttonPosition,
        viewportSize(this._window, this._document),
        buttonSize,
        12,
      );
      setPositionStyle(this._launcher, this._buttonPosition);
      this._updatePanelPosition();
      this._updateStatusPosition();
      this._updateDialogState();
    }

    showStatus(message, kind = "info") {
      if (!this._status) {
        return;
      }
      this._status.textContent = String(message || "");
      this._status.setAttribute("data-phg-kind", kind === "error" ? "error" : "info");
      this._status.hidden = !message;
      this._updateStatusPosition();
    }

    openPanel() {
      this._setPanelOpen(true);
      this._updatePanelPosition();
    }

    closePanel(options = {}) {
      if (!this._panel) {
        return;
      }
      if (this._dialogLayer) {
        this.closeDialog({ restoreFocus: false });
      }
      this._setPanelOpen(false);
      if (options.restoreFocus !== false) {
        this._launcher.focus?.({ preventScroll: true });
      }
    }

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

    openPromptDialog(record = null, opener = null) {
      if (!this._root) {
        return null;
      }
      this.closeDialog({ restoreFocus: false });
      this._dialogKind = "prompt";
      this._dialogRecord = record ? { ...record } : null;
      this._dialogOpener = opener || this._document.activeElement || this._addButton;

      const { layer, dialog, header, body, footer } = this._createDialogShell(
        record ? "编辑提示词" : "新增提示词",
      );
      const form = createElement(this._document, "form", {
        id: "phg-prompt-form",
        className: "phg-form",
      });
      const nameField = this._createField(
        "名称",
        "input",
        "phg-prompt-name",
        record?.name || "",
      );
      nameField.control.required = true;
      nameField.control.setAttribute("autocomplete", "off");
      const bodyField = this._createField(
        "正文",
        "textarea",
        "phg-prompt-body",
        record?.prompt || "",
      );
      bodyField.control.setAttribute("rows", "7");
      const placeholderField = this._createField(
        "光标占位符",
        "input",
        "phg-prompt-placeholder",
        record?.placeholder || namespace.DEFAULT_PLACEHOLDER || "【光标】",
      );
      placeholderField.control.setAttribute("autocomplete", "off");
      placeholderField.wrapper.append(
        createElement(this._document, "span", {
          className: "phg-field-help",
          text: "若正文命中此占位符，会优先移除它并定位光标。",
        }),
      );

      const historySection = createElement(this._document, "section", {
        className: "phg-history",
        attributes: { "aria-labelledby": "phg-history-title" },
      });
      const historyTitle = createElement(this._document, "h3", {
        id: "phg-history-title",
        className: "phg-history-title",
        text: "最近使用的占位符",
      });
      const historyList = createElement(this._document, "div", {
        id: "phg-history-list",
        className: "phg-history-list",
      });
      historySection.append(historyTitle, historyList);

      const cancelButton = createElement(this._document, "button", {
        id: "phg-cancel-dialog",
        className: "phg-button phg-button-secondary",
        type: "button",
        text: "取消",
      });
      const saveButton = createElement(this._document, "button", {
        id: "phg-save-prompt",
        className: "phg-button phg-button-primary",
        type: "submit",
        text: "保存",
      });
      footer.append(cancelButton, saveButton);
      body.append(
        nameField.wrapper,
        bodyField.wrapper,
        placeholderField.wrapper,
        historySection,
      );
      form.append(body, footer);
      dialog.append(header, form);
      layer.append(dialog);
      this._root.append(layer);
      this._setDialogReferences(layer, dialog);
      this._renderHistory();

      cancelButton.addEventListener("click", () => this.closeDialog());
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (this._state.busy) {
          return;
        }
        const result = await this._controller?.savePrompt?.({
          id: this._dialogRecord?.id,
          name: nameField.control.value,
          prompt: bodyField.control.value,
          placeholder: placeholderField.control.value,
        });
        if (result?.ok) {
          this.closeDialog();
        }
      });
      historyList.addEventListener("click", (event) => {
        const fillButton = event.target?.closest?.("[data-phg-history-value]");
        if (fillButton) {
          placeholderField.control.value = fillButton.getAttribute(
            "data-phg-history-value",
          );
          placeholderField.control.focus?.();
          return;
        }
        const deleteButton = event.target?.closest?.("[data-phg-history-delete]");
        if (deleteButton) {
          void this._controller?.deletePlaceholderHistory?.(
            deleteButton.getAttribute("data-phg-history-delete"),
          );
        }
      });
      nameField.control.focus?.({ preventScroll: true });
      this._updateDialogState();
      return dialog;
    }

    openSettingsDialog(opener = null) {
      if (!this._root) {
        return null;
      }
      this.closeDialog({ restoreFocus: false });
      this._dialogKind = "settings";
      this._dialogRecord = null;
      this._dialogOpener =
        opener || this._document.activeElement || this._settingsButton;

      const { layer, dialog, header, body, footer } =
        this._createDialogShell("插入设置");
      const form = createElement(this._document, "form", {
        id: "phg-settings-form",
        className: "phg-form",
      });
      const setting = createElement(this._document, "label", {
        className: "phg-switch-setting",
        attributes: { for: "phg-auto-select-bracket-placeholder" },
      });
      const copy = createElement(this._document, "span", {
        className: "phg-setting-copy",
      });
      const settingTitle = createElement(this._document, "span", {
        className: "phg-setting-title",
        text: "自动选中第一处【…】",
      });
      const settingDescription = createElement(this._document, "span", {
        className: "phg-setting-description",
        text: "插入后可直接输入内容，替换整段全角中括号占位符。",
      });
      copy.append(settingTitle, settingDescription);
      const checkbox = createElement(this._document, "input", {
        id: "phg-auto-select-bracket-placeholder",
        className: "phg-switch-input",
        type: "checkbox",
        attributes: { role: "switch" },
      });
      checkbox.checked = this._state.autoSelectBracketPlaceholder;
      const switchTrack = createElement(this._document, "span", {
        className: "phg-switch-track",
        attributes: { "aria-hidden": "true" },
      });
      setting.append(copy, checkbox, switchTrack);
      const priorityNote = createElement(this._document, "p", {
        className: "phg-setting-note",
        text: "优先级：当前自定义光标 → 【光标】/[光标] → 第一处【…】 → 历史兼容占位符。只有实际命中的规则才会生效。",
      });
      body.append(setting, priorityNote);

      const cancelButton = createElement(this._document, "button", {
        id: "phg-cancel-dialog",
        className: "phg-button phg-button-secondary",
        type: "button",
        text: "取消",
      });
      const saveButton = createElement(this._document, "button", {
        id: "phg-save-settings",
        className: "phg-button phg-button-primary",
        type: "submit",
        text: "保存",
      });
      footer.append(cancelButton, saveButton);
      form.append(body, footer);
      dialog.append(header, form);
      layer.append(dialog);
      this._root.append(layer);
      this._setDialogReferences(layer, dialog);

      cancelButton.addEventListener("click", () => this.closeDialog());
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (this._state.busy) {
          return;
        }
        const result =
          await this._controller?.setAutoSelectBracketPlaceholder?.(
            checkbox.checked,
          );
        if (result?.ok) {
          this.closeDialog();
        }
      });
      checkbox.focus?.({ preventScroll: true });
      this._updateDialogState();
      return dialog;
    }

    openDeleteDialog(record, opener = null) {
      if (!record || !this._root) {
        return null;
      }
      this.closeDialog({ restoreFocus: false });
      this._dialogKind = "delete";
      this._dialogRecord = { ...record };
      this._dialogOpener = opener || this._document.activeElement;
      const { layer, dialog, header, body, footer } =
        this._createDialogShell("删除提示词");
      const message = createElement(this._document, "p", {
        className: "phg-confirm-message",
        text: `确定删除“${record.name}”吗？此操作无法撤销。`,
      });
      const cancelButton = createElement(this._document, "button", {
        id: "phg-cancel-dialog",
        className: "phg-button phg-button-secondary",
        type: "button",
        text: "取消",
      });
      const confirmButton = createElement(this._document, "button", {
        id: "phg-confirm-delete",
        className: "phg-button phg-button-danger",
        type: "button",
        text: "确认删除",
      });
      body.append(message);
      footer.append(cancelButton, confirmButton);
      dialog.append(header, body, footer);
      layer.append(dialog);
      this._root.append(layer);
      this._setDialogReferences(layer, dialog);
      cancelButton.addEventListener("click", () => this.closeDialog());
      confirmButton.addEventListener("click", async () => {
        if (this._state.busy) {
          return;
        }
        const result = await this._controller?.deletePrompt?.(record.id);
        if (result?.ok) {
          this.closeDialog();
        }
      });
      cancelButton.focus?.({ preventScroll: true });
      this._updateDialogState();
      return dialog;
    }

    closeDialog(options = {}) {
      if (!this._dialogLayer) {
        return;
      }
      const opener = this._resolveDialogOpener(
        this._dialogOpener,
        this._dialogKind,
        this._dialogRecord,
      );
      this._dialogLayer.remove?.();
      this._dialogLayer = null;
      this._dialog = null;
      this._dialogKind = null;
      this._dialogRecord = null;
      this._dialogOpener = null;
      if (options.restoreFocus !== false && opener?.focus) {
        opener.focus({ preventScroll: true });
      }
    }

    updateLayout() {
      if (!this._launcher) {
        return;
      }
      const rect = this._launcher.getBoundingClientRect();
      const clamped = clampFloatingPosition(
        this._buttonPosition || positionFromStyle(this._launcher),
        viewportSize(this._window, this._document),
        { width: rect.width || 50, height: rect.height || 52 },
        12,
      );
      this._buttonPosition = clamped;
      setPositionStyle(this._launcher, clamped);
      this._updatePanelPosition();
      this._updateStatusPosition();
    }

    destroy() {
      if (this._destroyed) {
        return;
      }
      this._destroyed = true;
      this.closeDialog({ restoreFocus: false });
      this._clearListDrag(false);
      this._window?.removeEventListener?.("resize", this._onResize);
      this._document?.removeEventListener?.(
        "pointerdown",
        this._onDocumentPointerDown,
        true,
      );
      this._root?.remove?.();
      this._root = null;
    }

    _bindEvents() {
      this._root.addEventListener(
        "pointerdown",
        () => this._controller?.captureBookmark?.(),
        true,
      );
      this._launcher.addEventListener("click", (event) => {
        if (this._suppressNextClick) {
          this._suppressNextClick = false;
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        if (!this._isPanelOpen()) {
          this.openPanel();
        } else {
          this.closePanel();
        }
      });
      this._launcher.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          this._controller?.captureBookmark?.();
        }
      });
      this._launcher.addEventListener("pointerdown", (event) =>
        this._handlePointerDown(event),
      );
      this._launcher.addEventListener("pointermove", (event) =>
        this._handlePointerMove(event),
      );
      this._launcher.addEventListener("pointerup", (event) =>
        this._handlePointerEnd(event),
      );
      this._launcher.addEventListener("pointercancel", (event) =>
        this._handlePointerEnd(event, true),
      );
      this._closeButton.addEventListener("click", () => this.closePanel());
      this._settingsButton.addEventListener("click", (event) =>
        this.openSettingsDialog(event.currentTarget),
      );
      this._addButton.addEventListener("click", (event) =>
        this.openPromptDialog(null, event.currentTarget),
      );
      this._list.addEventListener("click", (event) => this._handleListClick(event));
      this._list.addEventListener("pointerdown", (event) =>
        this._handleListPointerDown(event),
      );
      this._list.addEventListener("pointermove", (event) =>
        this._handleListPointerMove(event),
      );
      this._list.addEventListener("pointerup", (event) =>
        this._handleListPointerEnd(event),
      );
      this._list.addEventListener("pointercancel", (event) =>
        this._handleListPointerEnd(event, true),
      );
      this._list.addEventListener("keydown", (event) =>
        this._handleListKeyDown(event),
      );
      this._panel.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !this._dialogLayer) {
          event.preventDefault();
          this.closePanel();
        }
      });
      this._root.addEventListener("keydown", (event) => {
        if (
          event.key === "Escape" &&
          !this._dialogLayer &&
          this._isPanelOpen()
        ) {
          event.preventDefault();
          this.closePanel();
        }
      });
      this._document?.addEventListener?.(
        "pointerdown",
        this._onDocumentPointerDown,
        true,
      );
      this._window?.addEventListener?.("resize", this._onResize);
    }

    _renderPromptList() {
      if (this._listDrag?.dragged) {
        this._syncCardInteractiveState();
        return;
      }
      this._clearListDrag(false);
      const nextPrompts = this._state.prompts;
      const existingCards = this._promptCards();
      const cardsById = new Map(
        existingCards.map((card) => [
          card.getAttribute("data-phg-record-id"),
          card,
        ]),
      );
      const currentIds = existingCards.map((card) =>
        card.getAttribute("data-phg-record-id"),
      );
      const nextIdList = nextPrompts.map((record) => record.id);
      if (
        currentIds.length === nextIdList.length &&
        currentIds.every((id, index) => id === nextIdList[index])
      ) {
        for (const record of nextPrompts) {
          const card = cardsById.get(record.id);
          if (card) {
            this._syncPromptCard(card, record);
          }
        }
        this._empty.hidden = nextPrompts.length > 0;
        return;
      }
      const nextIds = new Set(nextIdList);
      for (const card of existingCards) {
        const id = card.getAttribute("data-phg-record-id");
        if (!nextIds.has(id)) {
          card.remove?.();
          cardsById.delete(id);
        }
      }
      const ordered = [];
      for (const record of nextPrompts) {
        let card = cardsById.get(record.id);
        if (card) {
          this._syncPromptCard(card, record);
        } else {
          card = this._createPromptCard(record);
        }
        ordered.push(card);
      }
      if (ordered.length) {
        this._list.append(...ordered);
      }
      this._empty.hidden = nextPrompts.length > 0;
    }

    _createPromptCard(record) {
      const card = createElement(this._document, "article", {
        className: "phg-prompt-card",
        attributes: { "data-phg-record-id": record.id, draggable: "false" },
      });
      const drag = createElement(this._document, "button", {
        className: "phg-card-drag",
        type: "button",
        attributes: {
          "data-phg-action": "reorder",
          "data-phg-id": record.id,
          "aria-label": `拖动调整顺序：${record.name}`,
          title: "拖动调整顺序",
          draggable: "false",
        },
      });
      drag.append(createCardDragIcon(this._document));
      const main = createElement(this._document, "button", {
        className: "phg-card-main",
        type: "button",
        attributes: {
          "data-phg-action": "insert",
          "data-phg-id": record.id,
          "aria-label": `插入提示词：${record.name}`,
        },
      });
      const name = createElement(this._document, "span", {
        className: "phg-card-name",
        text: record.name,
      });
      const preview = createElement(this._document, "span", {
        className: "phg-card-preview",
        text: promptPreviewText(record.prompt),
      });
      main.append(name, preview);
      const actions = createElement(this._document, "div", {
        className: "phg-card-actions",
      });
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
      actions.append(edit, remove);
      card.append(drag, main, actions);
      this._syncPromptCard(card, record);
      return card;
    }

    _syncPromptCard(card, record) {
      const name = card.querySelector?.(".phg-card-name");
      const preview = card.querySelector?.(".phg-card-preview");
      if (name) {
        name.textContent = record.name;
      }
      if (preview) {
        preview.textContent = promptPreviewText(record.prompt);
      }
      const drag = card.querySelector?.('[data-phg-action="reorder"]');
      const main = card.querySelector?.('[data-phg-action="insert"]');
      const edit = card.querySelector?.('[data-phg-action="edit"]');
      const remove = card.querySelector?.('[data-phg-action="delete"]');
      if (drag) {
        drag.setAttribute("aria-label", `拖动调整顺序：${record.name}`);
        drag.setAttribute("data-phg-id", record.id);
      }
      if (main) {
        main.setAttribute("aria-label", `插入提示词：${record.name}`);
        main.setAttribute("data-phg-id", record.id);
      }
      if (edit) {
        edit.setAttribute("aria-label", `编辑提示词：${record.name}`);
        edit.setAttribute("data-phg-id", record.id);
      }
      if (remove) {
        remove.setAttribute("aria-label", `删除提示词：${record.name}`);
        remove.setAttribute("data-phg-id", record.id);
      }
      for (const button of [drag, main, edit, remove]) {
        if (button) {
          button.disabled = this._state.busy;
        }
      }
    }

    _syncCardInteractiveState() {
      const cardsById = new Map(
        this._promptCards().map((card) => [
          card.getAttribute("data-phg-record-id"),
          card,
        ]),
      );
      for (const record of this._state.prompts) {
        const card = cardsById.get(record.id);
        if (card) {
          this._syncPromptCard(card, record);
        }
      }
    }

    _handleListClick(event) {
      if (this._suppressNextInsert) {
        this._suppressNextInsert = false;
        const suppressed = event.target
          ?.closest?.("[data-phg-action]")
          ?.getAttribute("data-phg-action");
        if (suppressed === "insert" || suppressed === "reorder" || !suppressed) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
      }
      const actionButton = event.target?.closest?.("[data-phg-action]");
      if (!actionButton || actionButton.disabled) {
        return;
      }
      const action = actionButton.getAttribute("data-phg-action");
      const id = actionButton.getAttribute("data-phg-id");
      const record = this._state.prompts.find((entry) => entry.id === id);
      if (!record) {
        return;
      }
      if (action === "reorder") {
        return;
      }
      if (action === "insert") {
        void this._controller?.insertPrompt?.(id);
      } else if (action === "edit") {
        event.stopPropagation();
        this.openPromptDialog(record, actionButton);
      } else if (action === "delete") {
        event.stopPropagation();
        this.openDeleteDialog(record, actionButton);
      }
    }

    _promptCards() {
      return Array.from(this._list?.querySelectorAll?.(".phg-prompt-card") || []);
    }

    _orderedPromptIds() {
      return this._promptCards().map((card) =>
        card.getAttribute("data-phg-record-id"),
      );
    }

    _restorePromptOrder(orderedIds) {
      if (!this._list || !Array.isArray(orderedIds) || orderedIds.length === 0) {
        return;
      }
      const cardsById = new Map(
        this._promptCards().map((card) => [
          card.getAttribute("data-phg-record-id"),
          card,
        ]),
      );
      const cards = orderedIds
        .map((id) => cardsById.get(id))
        .filter((card) => Boolean(card));
      if (cards.length) {
        this._list.append(...cards);
      }
    }

    _resetListDragStyles(cards) {
      for (const card of cards || this._promptCards()) {
        if (!card?.style) {
          continue;
        }
        card.style.transform = "";
        card.style.transition = "";
        card.style.zIndex = "";
        card.style.willChange = "";
      }
    }

    _clearListDrag(restoreOrigin) {
      const drag = this._listDrag;
      if (!drag) {
        return;
      }
      if (drag.paintFrame && typeof this._window?.cancelAnimationFrame === "function") {
        this._window.cancelAnimationFrame(drag.paintFrame);
      }
      this._listDrag = null;
      this._list?.releasePointerCapture?.(drag.pointerId);
      drag.card?.removeAttribute("data-phg-dragging");
      this._list?.removeAttribute("data-phg-reordering");
      this._resetListDragStyles(drag.cards);
      if (restoreOrigin) {
        this._restorePromptOrder(drag.originIds);
      }
    }

    _handleListPointerDown(event) {
      if (
        this._destroyed ||
        this._listDrag ||
        (event.button ?? 0) !== 0 ||
        this._state.busy ||
        this._state.loading ||
        this._state.prompts.length < 2
      ) {
        return;
      }
      const target = event.target;
      if (
        target?.closest?.('[data-phg-action="edit"]') ||
        target?.closest?.('[data-phg-action="delete"]')
      ) {
        return;
      }
      const handle = target?.closest?.('[data-phg-action="reorder"]');
      const main = target?.closest?.('[data-phg-action="insert"]');
      const fromHandle = Boolean(handle);
      const fromMain = Boolean(main) && event.pointerType !== "touch";
      if (!fromHandle && !fromMain) {
        return;
      }
      const card = (handle || main)?.closest?.(".phg-prompt-card");
      if (!card || handle?.disabled || main?.disabled) {
        return;
      }
      const cards = this._promptCards();
      const rects = cards.map((entry) => entry.getBoundingClientRect());
      const firstTop = finiteNumber(rects[0]?.top);
      const secondTop = finiteNumber(rects[1]?.top);
      const firstHeight = Math.max(0, finiteNumber(rects[0]?.height));
      this._listDrag = {
        pointerId: event.pointerId,
        start: { x: event.clientX, y: event.clientY },
        card,
        cards,
        fromHandle,
        fromIndex: cards.indexOf(card),
        toIndex: cards.indexOf(card),
        dragged: false,
        originIds: this._orderedPromptIds(),
        rects,
        stride:
          rects.length > 1 && Number.isFinite(secondTop - firstTop)
            ? secondTop - firstTop
            : firstHeight + 7,
        scrollTop: finiteNumber(this._list.parentElement?.scrollTop),
        lastClientY: event.clientY,
        paintFrame: 0,
      };
      this._list.setPointerCapture?.(event.pointerId);
    }

    _handleListPointerMove(event) {
      if (!this._listDrag || event.pointerId !== this._listDrag.pointerId) {
        return;
      }
      const current = { x: event.clientX, y: event.clientY };
      if (!this._listDrag.dragged) {
        this._listDrag.dragged = isDragGesture(this._listDrag.start, current, 6);
        if (!this._listDrag.dragged) {
          return;
        }
        this._listDrag.card.setAttribute("data-phg-dragging", "true");
        this._list.setAttribute("data-phg-reordering", "true");
        this._listDrag.card.style.zIndex = "2";
        this._listDrag.card.style.willChange = "transform";
      }
      event.preventDefault();
      this._scheduleDragPaint(event.clientY);
    }

    _handleListPointerEnd(event, cancelled = false) {
      if (!this._listDrag || event.pointerId !== this._listDrag.pointerId) {
        return;
      }
      const drag = this._listDrag;
      const dragged = drag.dragged;
      if (!dragged) {
        this._clearListDrag(false);
        return;
      }
      event.preventDefault();
      if (drag.lastClientY != null) {
        this._paintListDrag(drag.lastClientY);
      }
      if (cancelled) {
        this._clearListDrag(true);
        return;
      }
      this._suppressNextInsert = !drag.fromHandle;
      const orderedIds = moveIds(drag.originIds, drag.fromIndex, drag.toIndex);
      const visualTop = finiteNumber(
        drag.card.getBoundingClientRect?.().top,
        Number.NaN,
      );
      this._clearListDrag(false);
      this._restorePromptOrder(orderedIds);
      this._settleDraggedCard(drag.card, visualTop);
      void this._commitPromptOrder(orderedIds);
    }

    _handleListKeyDown(event) {
      const handle = event.target?.closest?.('[data-phg-action="reorder"]');
      if (!handle || handle.disabled || this._state.busy || this._state.loading) {
        return;
      }
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
        return;
      }
      event.preventDefault();
      const id = handle.getAttribute("data-phg-id");
      const ids = this._state.prompts.map((record) => record.id);
      const fromIndex = ids.indexOf(id);
      const toIndex = fromIndex + (event.key === "ArrowUp" ? -1 : 1);
      if (fromIndex < 0 || toIndex < 0 || toIndex >= ids.length) {
        return;
      }
      void this._commitPromptOrder(moveIds(ids, fromIndex, toIndex), id);
    }

    async _commitPromptOrder(orderedIds, focusId = null) {
      this._restorePromptOrder(orderedIds);
      const result = await this._controller?.reorderPrompts?.(orderedIds);
      if (!result?.ok || !focusId || this._destroyed) {
        return;
      }
      const handles = Array.from(
        this._list?.querySelectorAll?.('[data-phg-action="reorder"]') || [],
      );
      handles
        .find((button) => button.getAttribute("data-phg-id") === focusId)
        ?.focus?.({ preventScroll: true });
    }

    _scheduleDragPaint(clientY) {
      const drag = this._listDrag;
      if (!drag?.dragged) {
        return;
      }
      drag.lastClientY = clientY;
      const paint = () => {
        if (!this._listDrag?.dragged) {
          if (this._listDrag) {
            this._listDrag.paintFrame = 0;
          }
          return;
        }
        this._listDrag.paintFrame = 0;
        const y = this._listDrag.lastClientY;
        const scrolled = this._scrollListForDrag(y);
        this._paintListDrag(y);
        if (
          scrolled &&
          typeof this._window?.requestAnimationFrame === "function"
        ) {
          this._listDrag.paintFrame = this._window.requestAnimationFrame(paint);
        }
      };
      if (typeof this._window?.requestAnimationFrame !== "function") {
        this._scrollListForDrag(clientY);
        this._paintListDrag(clientY);
        return;
      }
      if (drag.paintFrame) {
        return;
      }
      drag.paintFrame = this._window.requestAnimationFrame(paint);
    }

    _paintListDrag(clientY) {
      const drag = this._listDrag;
      if (!drag?.dragged || !Array.isArray(drag.cards)) {
        return;
      }
      const scrollDelta =
        finiteNumber(this._list.parentElement?.scrollTop) - drag.scrollTop;
      const deltaY = clientY - drag.start.y + scrollDelta;
      drag.toIndex = dropIndexFromDisplacement(
        drag.fromIndex,
        deltaY,
        drag.stride,
        drag.cards.length,
      );
      if (!Array.isArray(drag.appliedShifts)) {
        drag.appliedShifts = new Array(drag.cards.length).fill(null);
      }
      for (let index = 0; index < drag.cards.length; index += 1) {
        const card = drag.cards[index];
        if (!card?.style) {
          continue;
        }
        if (index === drag.fromIndex) {
          card.style.transform = `translate3d(0, ${deltaY}px, 0)`;
          continue;
        }
        const shift = listDragShift(
          drag.fromIndex,
          drag.toIndex,
          index,
          drag.stride,
        );
        if (drag.appliedShifts[index] === shift) {
          continue;
        }
        card.style.transform = shift
          ? `translate3d(0, ${shift}px, 0)`
          : "translate3d(0, 0, 0)";
        drag.appliedShifts[index] = shift;
      }
    }

    _settleDraggedCard(card, visualTop) {
      if (!card?.style) {
        return;
      }
      const canAnimate =
        Number.isFinite(visualTop) &&
        typeof this._window?.requestAnimationFrame === "function" &&
        !this._prefersReducedMotion();
      if (!canAnimate) {
        card.style.transform = "";
        card.style.transition = "";
        card.style.zIndex = "";
        card.style.willChange = "";
        return;
      }
      const nextTop = finiteNumber(card.getBoundingClientRect?.().top, Number.NaN);
      const delta = visualTop - nextTop;
      if (!Number.isFinite(nextTop) || Math.abs(delta) < 1) {
        card.style.transform = "";
        card.style.transition = "";
        card.style.zIndex = "";
        card.style.willChange = "";
        return;
      }
      card.style.transition = "none";
      card.style.zIndex = "2";
      card.style.transform = `translate3d(0, ${delta}px, 0)`;
      void card.offsetWidth;
      this._window.requestAnimationFrame(() => {
        card.style.transition = "transform 180ms cubic-bezier(.16, 1, .3, 1)";
        card.style.transform = "translate3d(0, 0, 0)";
        const finish = () => {
          if (card.getAttribute?.("data-phg-dragging") === "true") {
            return;
          }
          card.style.transition = "";
          card.style.transform = "";
          card.style.zIndex = "";
          card.style.willChange = "";
        };
        if (typeof this._window.setTimeout === "function") {
          this._window.setTimeout(finish, 220);
        } else {
          finish();
        }
      });
    }

    _prefersReducedMotion() {
      return Boolean(
        this._window?.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches,
      );
    }

    _scrollListForDrag(clientY) {
      const scroller = this._list?.parentElement;
      if (!scroller || !Number.isFinite(clientY)) {
        return false;
      }
      const rect = scroller.getBoundingClientRect?.();
      if (!rect || !Number.isFinite(rect.height) || rect.height <= 0) {
        return false;
      }
      if (typeof scroller.scrollTop !== "number") {
        return false;
      }
      const zone = 36;
      const maxStep = 16;
      let delta = 0;
      if (clientY < rect.top + zone) {
        const intensity = Math.min(1, (rect.top + zone - clientY) / zone);
        delta = -Math.max(2, maxStep * intensity);
      } else if (clientY > rect.bottom - zone) {
        const intensity = Math.min(1, (clientY - (rect.bottom - zone)) / zone);
        delta = Math.max(2, maxStep * intensity);
      }
      if (!delta) {
        return false;
      }
      const before = scroller.scrollTop;
      scroller.scrollTop = Math.max(0, scroller.scrollTop + delta);
      return scroller.scrollTop !== before;
    }

    _createDialogShell(titleText) {
      const layer = createElement(this._document, "div", {
        id: "phg-dialog-layer",
        className: "phg-dialog-layer",
      });
      const dialog = createElement(this._document, "div", {
        id: "phg-dialog",
        className: "phg-dialog",
        attributes: {
          role: "dialog",
          "aria-modal": "true",
          "aria-labelledby": "phg-dialog-title",
          "data-phg-kind": this._dialogKind || "prompt",
        },
      });
      const title = createElement(this._document, "h2", {
        id: "phg-dialog-title",
        className: "phg-dialog-title",
        text: titleText,
      });
      const header = createElement(this._document, "header", {
        className: "phg-dialog-header",
      });
      const body = createElement(this._document, "div", {
        className: "phg-dialog-body",
      });
      const footer = createElement(this._document, "footer", {
        className: "phg-dialog-footer",
      });
      header.append(title);
      layer.addEventListener("pointerdown", (event) => {
        if (event.target === layer) {
          this.closeDialog();
        }
      });
      return { layer, dialog, header, body, footer, title };
    }

    _createField(labelText, tagName, id, value) {
      const wrapper = createElement(this._document, "label", {
        className: "phg-field",
        attributes: { for: id },
      });
      const label = createElement(this._document, "span", {
        className: "phg-field-label",
        text: labelText,
      });
      const control = createElement(this._document, tagName, {
        id,
        className: "phg-control",
      });
      control.value = value;
      wrapper.append(label, control);
      return { wrapper, control };
    }

    _setDialogReferences(layer, dialog) {
      this._dialogLayer = layer;
      this._dialog = dialog;
      dialog.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          this.closeDialog();
          return;
        }
        if (event.key !== "Tab") {
          return;
        }
        const focusable = dialog.querySelectorAll(
          'button,input,textarea,select,[tabindex]:not([tabindex="-1"])',
        );
        const target = getFocusCycleTarget(
          focusable,
          this._document.activeElement,
          Boolean(event.shiftKey),
        );
        if (target) {
          event.preventDefault();
          target.focus?.();
        }
      });
    }

    _renderHistory() {
      const historyList = this._document.getElementById?.("phg-history-list");
      if (!historyList) {
        return;
      }
      historyList.replaceChildren();
      if (this._state.placeholderHistory.length === 0) {
        historyList.append(
          createElement(this._document, "p", {
            className: "phg-history-empty",
            text: "暂无自定义占位符历史。",
          }),
        );
        return;
      }
      for (const value of this._state.placeholderHistory) {
        const row = createElement(this._document, "div", {
          className: "phg-history-row",
        });
        const fill = createElement(this._document, "button", {
          className: "phg-history-value",
          type: "button",
          text: value,
          attributes: {
            "data-phg-history-value": value,
            "aria-label": `使用占位符 ${value}`,
          },
        });
        const remove = createElement(this._document, "button", {
          className: "phg-history-delete",
          type: "button",
          text: "删除",
          attributes: {
            "data-phg-history-delete": value,
            "aria-label": `删除占位符历史 ${value}`,
          },
        });
        fill.disabled = this._state.busy;
        remove.disabled = this._state.busy;
        row.append(fill, remove);
        historyList.append(row);
      }
    }

    _resolveDialogOpener(opener, kind, record) {
      if (opener?.isConnected) {
        return opener;
      }
      if (kind === "settings" && this._settingsButton?.isConnected) {
        return this._settingsButton;
      }
      if (record?.id && this._list) {
        const action = kind === "delete" ? "delete" : "edit";
        const replacement = Array.from(
          this._list.querySelectorAll?.(`[data-phg-action="${action}"]`) || [],
        ).find((button) => button.getAttribute("data-phg-id") === record.id);
        if (replacement) {
          return replacement;
        }
      }
      return this._addButton?.isConnected ? this._addButton : this._launcher;
    }

    _updateDialogState() {
      if (!this._dialog) {
        return;
      }
      this._renderHistory();
      for (const id of [
        "phg-save-prompt",
        "phg-save-settings",
        "phg-confirm-delete",
      ]) {
        const button = this._document.getElementById?.(id);
        if (button) {
          button.disabled = this._state.busy;
        }
      }
      const setting = this._document.getElementById?.(
        "phg-auto-select-bracket-placeholder",
      );
      if (setting) {
        setting.disabled = this._state.busy;
      }
    }

    _updatePanelPosition() {
      if (!this._panel || !this._isPanelOpen() || !this._launcher) {
        return;
      }
      const buttonRect = this._launcher.getBoundingClientRect();
      const panelRect = this._panel.getBoundingClientRect();
      const panelWidth = finiteNumber(this._panel.offsetWidth);
      const panelHeight = finiteNumber(this._panel.offsetHeight);
      const position = calculatePanelPosition(
        buttonRect,
        {
          width: panelWidth > 0 ? panelWidth : panelRect.width || 360,
          height: panelHeight > 0 ? panelHeight : panelRect.height || 440,
        },
        viewportSize(this._window, this._document),
        { gap: 10, margin: 12 },
      );
      setPositionStyle(this._panel, position);
      this._panel.setAttribute("data-phg-placement", position.placement);
    }

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

    _handlePointerDown(event) {
      if ((event.button ?? 0) !== 0 || this._state.loading) {
        return;
      }
      const position = positionFromStyle(this._launcher);
      this._drag = {
        pointerId: event.pointerId,
        start: { x: event.clientX, y: event.clientY },
        origin: position,
        dragged: false,
      };
      this._launcher.setPointerCapture?.(event.pointerId);
    }

    _handlePointerMove(event) {
      if (!this._drag || event.pointerId !== this._drag.pointerId) {
        return;
      }
      const current = { x: event.clientX, y: event.clientY };
      if (!this._drag.dragged) {
        this._drag.dragged = isDragGesture(this._drag.start, current, 6);
        if (this._drag.dragged) {
          this._launcher.setAttribute("data-phg-dragging", "true");
        }
      }
      if (!this._drag.dragged) {
        return;
      }
      event.preventDefault();
      const rect = this._launcher.getBoundingClientRect();
      this._buttonPosition = clampFloatingPosition(
        {
          left: this._drag.origin.left + current.x - this._drag.start.x,
          top: this._drag.origin.top + current.y - this._drag.start.y,
        },
        viewportSize(this._window, this._document),
        { width: rect.width || 50, height: rect.height || 52 },
        12,
      );
      setPositionStyle(this._launcher, this._buttonPosition);
      this._updatePanelPosition();
      this._updateStatusPosition();
    }

    _handlePointerEnd(event, cancelled = false) {
      if (!this._drag || event.pointerId !== this._drag.pointerId) {
        return;
      }
      const dragged = this._drag.dragged;
      this._launcher.releasePointerCapture?.(event.pointerId);
      this._launcher.removeAttribute("data-phg-dragging");
      this._drag = null;
      if (dragged && !cancelled) {
        event.preventDefault();
        this._suppressNextClick = true;
        void this._controller?.saveButtonPosition?.({ ...this._buttonPosition });
      }
    }

    _handleResize() {
      if (!this._launcher) {
        return;
      }
      const before = positionFromStyle(this._launcher);
      this.updateLayout();
      this._updateStatusPosition();
      const after = positionFromStyle(this._launcher);
      if (before.left !== after.left || before.top !== after.top) {
        void this._controller?.saveButtonPosition?.(after);
      }
    }

    _handleDocumentPointerDown(event) {
      if (
        !this._root ||
        !this._panel ||
        !this._isPanelOpen() ||
        this._dialogLayer ||
        this._root.contains?.(event.target)
      ) {
        return;
      }
      this.closePanel({ restoreFocus: false });
    }
  }

  const api = {
    clampFloatingPosition,
    calculatePanelPosition,
    getFocusCycleTarget,
    isDragGesture,
    dropIndexFromDisplacement,
    listDragShift,
    reorderRecords,
    PromptHelperController,
    PromptHelperUI,
  };
  Object.assign(namespace, api);
  globalObject.PromptHelper = namespace;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(globalThis);
