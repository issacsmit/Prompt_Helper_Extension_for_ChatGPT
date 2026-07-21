(function exposeConstants(globalObject) {
  "use strict";

  const STORAGE_KEYS = Object.freeze({
    PROMPTS: "ph_prompts",
    PLACEHOLDER_HISTORY: "ph_placeholder_history",
    BUTTON_POSITION: "ph_button_pos",
  });

  const api = Object.freeze({
    DEFAULT_PLACEHOLDER: "【光标】",
    LEGACY_PLACEHOLDER: "[光标]",
    MAX_PLACEHOLDER_HISTORY: 5,
    STORAGE_KEYS,
    STORAGE_TIMEOUT_MS: 3000,
  });

  const namespace = globalObject.PromptHelper || {};
  Object.assign(namespace, api);
  globalObject.PromptHelper = namespace;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(globalThis);
