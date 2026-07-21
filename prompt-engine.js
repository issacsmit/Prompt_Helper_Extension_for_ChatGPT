(function exposePromptEngine(globalObject) {
  "use strict";

  const namespace = globalObject.PromptHelper || {};
  const constants =
    typeof module !== "undefined" && module.exports
      ? require("./constants.js")
      : namespace;
  const DEFAULT_PLACEHOLDER = constants.DEFAULT_PLACEHOLDER || "【光标】";
  const LEGACY_PLACEHOLDER = constants.LEGACY_PLACEHOLDER || "[光标]";
  const MAX_PLACEHOLDER_HISTORY = constants.MAX_PLACEHOLDER_HISTORY || 5;

  function normalizePlaceholder(value) {
    if (typeof value !== "string") {
      return null;
    }

    const normalized = value.trim();
    return normalized || null;
  }

  function isCustomPlaceholder(value) {
    return (
      value !== null &&
      value !== DEFAULT_PLACEHOLDER &&
      value !== LEGACY_PLACEHOLDER
    );
  }

  function normalizeHistory(history) {
    if (!Array.isArray(history)) {
      return [];
    }

    const normalized = [];
    const seen = new Set();

    for (const value of history) {
      const placeholder = normalizePlaceholder(value);
      if (!isCustomPlaceholder(placeholder) || seen.has(placeholder)) {
        continue;
      }

      seen.add(placeholder);
      normalized.push(placeholder);
      if (normalized.length === MAX_PLACEHOLDER_HISTORY) {
        break;
      }
    }

    return normalized;
  }

  function prepareInsertion(record, history) {
    const text = record && typeof record.prompt === "string" ? record.prompt : "";
    const recordPlaceholder = normalizePlaceholder(record?.placeholder);
    const candidates = [];

    if (isCustomPlaceholder(recordPlaceholder)) {
      candidates.push(recordPlaceholder);
    }
    candidates.push(
      DEFAULT_PLACEHOLDER,
      LEGACY_PLACEHOLDER,
      ...normalizeHistory(history),
    );

    const seen = new Set();
    for (const placeholder of candidates) {
      if (seen.has(placeholder)) {
        continue;
      }
      seen.add(placeholder);

      const caretOffset = text.indexOf(placeholder);
      if (caretOffset === -1) {
        continue;
      }

      return {
        text:
          text.slice(0, caretOffset) +
          text.slice(caretOffset + placeholder.length),
        caretOffset,
        matchedPlaceholder: placeholder,
      };
    }

    return {
      text,
      caretOffset: text.length,
      matchedPlaceholder: null,
    };
  }

  function updatePlaceholderHistory(history, placeholder) {
    const normalizedHistory = normalizeHistory(history);
    const nextPlaceholder = normalizePlaceholder(placeholder);

    if (!isCustomPlaceholder(nextPlaceholder)) {
      return normalizedHistory;
    }

    return [
      nextPlaceholder,
      ...normalizedHistory.filter((value) => value !== nextPlaceholder),
    ].slice(0, MAX_PLACEHOLDER_HISTORY);
  }

  const api = { prepareInsertion, updatePlaceholderHistory };
  Object.assign(namespace, api);
  globalObject.PromptHelper = namespace;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(globalThis);
