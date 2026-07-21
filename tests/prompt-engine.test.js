"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

function optionalRequire(modulePath) {
  try {
    return require(modulePath);
  } catch (error) {
    if (error && error.code === "MODULE_NOT_FOUND") {
      return {};
    }
    throw error;
  }
}

test("constants expose the supported placeholders through CommonJS and PromptHelper", () => {
  const constants = optionalRequire("../constants.js");

  assert.equal(constants.DEFAULT_PLACEHOLDER, "【光标】");
  assert.equal(constants.LEGACY_PLACEHOLDER, "[光标]");
  assert.equal(globalThis.PromptHelper?.DEFAULT_PLACEHOLDER, constants.DEFAULT_PLACEHOLDER);
  assert.equal(globalThis.PromptHelper?.LEGACY_PLACEHOLDER, constants.LEGACY_PLACEHOLDER);
});

test("prompt engine exposes its public functions through CommonJS and PromptHelper", () => {
  const engine = optionalRequire("../prompt-engine.js");

  assert.equal(typeof engine.prepareInsertion, "function");
  assert.equal(typeof engine.updatePlaceholderHistory, "function");
  assert.equal(globalThis.PromptHelper?.prepareInsertion, engine.prepareInsertion);
  assert.equal(
    globalThis.PromptHelper?.updatePlaceholderHistory,
    engine.updatePlaceholderHistory,
  );
});

const { DEFAULT_PLACEHOLDER, LEGACY_PLACEHOLDER } = require("../constants.js");
const { prepareInsertion, updatePlaceholderHistory } = require("../prompt-engine.js");

test("record custom placeholder wins even when lower-priority markers occur earlier", () => {
  const content = [
    DEFAULT_PLACEHOLDER,
    LEGACY_PLACEHOLDER,
    "<past>",
    "before<record>after",
  ].join("|");

  assert.deepEqual(
    prepareInsertion({ prompt: content, placeholder: "<record>" }, ["<past>"]),
    {
      text: content.replace("<record>", ""),
      caretOffset: content.indexOf("<record>"),
      matchedPlaceholder: "<record>",
    },
  );
});

test("default placeholder wins over legacy and history candidates", () => {
  const content = `<past>|${LEGACY_PLACEHOLDER}|before${DEFAULT_PLACEHOLDER}after`;

  assert.deepEqual(prepareInsertion({ prompt: content }, ["<past>"]), {
    text: content.replace(DEFAULT_PLACEHOLDER, ""),
    caretOffset: content.indexOf(DEFAULT_PLACEHOLDER),
    matchedPlaceholder: DEFAULT_PLACEHOLDER,
  });
});

test("legacy placeholder wins over history candidates", () => {
  const content = `<past>|before${LEGACY_PLACEHOLDER}after`;

  assert.deepEqual(prepareInsertion({ prompt: content }, ["<past>"]), {
    text: content.replace(LEGACY_PLACEHOLDER, ""),
    caretOffset: content.indexOf(LEGACY_PLACEHOLDER),
    matchedPlaceholder: LEGACY_PLACEHOLDER,
  });
});

test("history supplies a compatibility placeholder after built-in candidates miss", () => {
  const content = "prefix<older>suffix";

  assert.deepEqual(prepareInsertion({ prompt: content }, ["<newer>", "<older>"]), {
    text: "prefixsuffix",
    caretOffset: 6,
    matchedPlaceholder: "<older>",
  });
});

test("only the first occurrence of the selected placeholder is removed", () => {
  const content = `A${DEFAULT_PLACEHOLDER}B${DEFAULT_PLACEHOLDER}C`;

  assert.deepEqual(prepareInsertion({ prompt: content }), {
    text: `AB${DEFAULT_PLACEHOLDER}C`,
    caretOffset: 1,
    matchedPlaceholder: DEFAULT_PLACEHOLDER,
  });
});

test("multiline text is preserved and caret offset points to the removed marker", () => {
  const content = `第一行\n第二行 <slot> 尾部\n第三行`;

  assert.deepEqual(prepareInsertion({ prompt: content, placeholder: "<slot>" }), {
    text: "第一行\n第二行  尾部\n第三行",
    caretOffset: content.indexOf("<slot>"),
    matchedPlaceholder: "<slot>",
  });
});

test("text stays unchanged and caret moves to the end when no marker matches", () => {
  const content = "第一行\n第二行";

  assert.deepEqual(prepareInsertion({ prompt: content }, ["<past>"]), {
    text: content,
    caretOffset: content.length,
    matchedPlaceholder: null,
  });
});

test("history keeps the newest occurrence first and removes duplicates", () => {
  assert.deepEqual(
    updatePlaceholderHistory(["<one>", "<two>", "<one>"], "<two>"),
    ["<two>", "<one>"],
  );
});

test("history trims custom markers and excludes empty or built-in markers", () => {
  const history = [
    "  <one>  ",
    "",
    null,
    DEFAULT_PLACEHOLDER,
    "<two>",
    LEGACY_PLACEHOLDER,
    "<one>",
  ];

  assert.deepEqual(updatePlaceholderHistory(history, "  <new>  "), [
    "<new>",
    "<one>",
    "<two>",
  ]);
  assert.deepEqual(updatePlaceholderHistory(history, DEFAULT_PLACEHOLDER), [
    "<one>",
    "<two>",
  ]);
});

test("history retains at most five most-recent custom markers", () => {
  assert.deepEqual(
    updatePlaceholderHistory(["<one>", "<two>", "<three>", "<four>", "<five>"], "<six>"),
    ["<six>", "<one>", "<two>", "<three>", "<four>"],
  );
});
