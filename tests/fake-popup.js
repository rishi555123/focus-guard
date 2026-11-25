// Runs the real popup scripts (in popup.html's order) against a stand-in page and chrome API.
// Shared by the popup tests; not a test file itself.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const HTML = read("src/popup/popup.html");
// The scripts popup.html loads, in order: theme.js in <head>, the rest at the end of <body>
const SCRIPTS = [...HTML.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => path.posix.join("src/popup", m[1]));

function element(id) {
  const classes = new Set();
  return {
    id, hidden: false, disabled: false, checked: false, textContent: "", value: "", dataset: {}, children: [], style: {},
    attributes: {}, listeners: {},
    classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c),
      toggle: (c, on) => ((on ?? !classes.has(c)) ? classes.add(c) : classes.delete(c)) },
    setAttribute(k, v) { this.attributes[k] = String(v); },
    getAttribute(k) { return this.attributes[k] ?? null; },
    addEventListener(type, fn) { this.listeners[type] = fn; },
    append(...kids) { this.children.push(...kids); },
    replaceChildren(...kids) { this.children = kids; }
  };
}

// `store` is what chrome.storage.local holds. `constants` replaces src/shared/constants.js.
function loadPopup({ store = {}, constants, now } = {}) {
  const els = {};
  const durations = element("durations");
  const document = {
    documentElement: { dataset: {} },
    getElementById: (id) => (els[id] ??= element(id)),
    createElement: (tag) => element(tag),
    querySelector: (sel) => (sel === ".durations" ? durations : null),
    querySelectorAll: (sel) => (sel === ".durations button" ? durations.children : [])
  };
  const sent = [];
  const listeners = [];
  const chrome = {
    storage: {
      local: {
        get: async (keys) => {
          const list = keys == null ? Object.keys(store) : [].concat(keys);
          return structuredClone(Object.fromEntries(list.filter((k) => k in store).map((k) => [k, store[k]])));
        },
        set: async (items) => {
          const changes = {};
          for (const [k, v] of Object.entries(items)) { changes[k] = { newValue: v }; store[k] = structuredClone(v); }
          listeners.forEach((fn) => fn(changes, "local"));
        },
        remove: async (k) => { delete store[k]; }
      },
      onChanged: { addListener: (fn) => listeners.push(fn) }
    },
    runtime: { sendMessage: async (msg) => { sent.push(msg); return { ok: true }; } },
    extension: { isAllowedIncognitoAccess: async () => true },
    tabs: { create() {} }
  };
  const localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  const RealDate = Date;
  const FakeDate = now == null ? Date : class extends RealDate {
    constructor(...a) { super(...(a.length ? a : [now])); }
    static now() { return now; }
  };
  const context = vm.createContext({
    document, chrome, localStorage, navigator: {}, URL, Intl, Date: FakeDate,
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    setInterval: () => 0, clearInterval() {}, setTimeout: () => 0, confirm: () => false
  });
  for (const file of SCRIPTS) {
    vm.runInContext(file.endsWith("shared/constants.js") && constants ? constants : read(file), context);
  }
  return {
    els, store, sent, durations,
    settle: () => new Promise((resolve) => setImmediate(() => setImmediate(resolve))) // let render() finish
  };
}

module.exports = { loadPopup, SCRIPTS };
