// Tests for src/shared/theme.js, which picks the light or dark theme on every extension page,
// run against a stand-in page and chrome API. Plain Node 22+, no installs:  node --test
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");
const SOURCE = fs.readFileSync(path.join(ROOT, "src/shared/theme.js"), "utf8");

// `copy` is the localStorage copy, `saved` the chrome.storage choice, `dark` the system setting.
// `copy: "blocked"` makes localStorage throw, as it can when site data is blocked.
function loadTheme({ copy = null, saved, dark = false } = {}) {
  const local = new Map(copy && copy !== "blocked" ? [["theme", copy]] : []);
  const blocked = () => { throw new Error("storage is blocked"); };
  const localStorage = copy === "blocked"
    ? { getItem: blocked, setItem: blocked, removeItem: blocked }
    : { getItem: (k) => local.get(k) ?? null, setItem: (k, v) => local.set(k, String(v)), removeItem: (k) => local.delete(k) };
  const store = saved === undefined ? {} : { theme: saved };
  const storageListeners = [], mediaListeners = [];
  const media = { matches: dark, addEventListener: (type, fn) => mediaListeners.push(fn) };
  const root = { dataset: {} };
  const chrome = {
    storage: {
      local: {
        get: async (key) => (key in store ? { [key]: store[key] } : {}),
        set: async (items) => {
          const changes = {};
          for (const [k, v] of Object.entries(items)) { changes[k] = { oldValue: store[k], newValue: v }; store[k] = v; }
          storageListeners.forEach((fn) => fn(changes, "local"));
        },
        remove: async (key) => {
          if (!(key in store)) return;
          const changes = { [key]: { oldValue: store[key] } };
          delete store[key];
          storageListeners.forEach((fn) => fn(changes, "local"));
        }
      },
      onChanged: { addListener: (fn) => storageListeners.push(fn) }
    }
  };
  const context = vm.createContext({ chrome, localStorage, document: { documentElement: root }, matchMedia: () => media });
  vm.runInContext(SOURCE, context);
  return {
    theme: () => root.dataset.theme,
    copy: () => local.get("theme") ?? null,
    store,
    setTheme: vm.runInContext("setTheme", context),
    settle: () => new Promise((resolve) => setImmediate(resolve)), // let chrome.storage answer
    // Another page (the popup) changes the choice, or the system setting changes
    changeElsewhere: (theme) => (theme ? chrome.storage.local.set({ theme }) : chrome.storage.local.remove("theme")),
    systemTurns: (isDark) => { media.matches = isDark; mediaListeners.forEach((fn) => fn()); }
  };
}

test("the saved copy is applied straight away, before chrome.storage answers", () => {
  assert.equal(loadTheme({ copy: "dark", saved: "dark" }).theme(), "dark");
  assert.equal(loadTheme({ copy: "light", saved: "light", dark: true }).theme(), "light");
});

test("Auto (nothing saved) follows the system setting", async () => {
  assert.equal(loadTheme({ dark: false }).theme(), "light");
  const page = loadTheme({ dark: true });
  assert.equal(page.theme(), "dark");
  await page.settle();
  assert.equal(page.theme(), "dark", "still dark once chrome.storage says Auto");
});

test("a missing copy is filled in from chrome.storage", async () => {
  const page = loadTheme({ saved: "dark" });
  assert.equal(page.theme(), "light", "Auto until chrome.storage answers");
  await page.settle();
  assert.equal(page.theme(), "dark");
  assert.equal(page.copy(), "dark", "and the copy is saved for next time");
});

test("an out-of-date copy is corrected from chrome.storage", async () => {
  const page = loadTheme({ copy: "dark" }); // the choice went back to Auto
  await page.settle();
  assert.equal(page.theme(), "light");
  assert.equal(page.copy(), null);
});

test("it still works when localStorage is blocked", async () => {
  const page = loadTheme({ copy: "blocked", saved: "dark" });
  await page.settle();
  assert.equal(page.theme(), "dark");
  await page.setTheme("light");
  assert.equal(page.theme(), "light");
});

test("setTheme saves Light or Dark in both places, and Auto clears both", async () => {
  const page = loadTheme();
  await page.setTheme("dark");
  assert.equal(page.theme(), "dark");
  assert.deepEqual([page.store.theme, page.copy()], ["dark", "dark"]);
  await page.setTheme("auto");
  assert.equal(page.theme(), "light");
  assert.ok(!("theme" in page.store), "Auto is a missing value, like for existing users");
  assert.equal(page.copy(), null);
});

test("a choice made before chrome.storage first answers isn't undone by that answer", async () => {
  const page = loadTheme({ saved: "light" });
  const done = page.setTheme("dark"); // clicked straight away
  await page.settle();
  await done;
  assert.equal(page.theme(), "dark");
});

test("an open page follows a choice made in the popup", async () => {
  const page = loadTheme();
  await page.settle();
  await page.changeElsewhere("dark");
  assert.equal(page.theme(), "dark");
  await page.changeElsewhere(null);
  assert.equal(page.theme(), "light");
});

test("in Auto, an open page follows the system setting; a picked theme doesn't", async () => {
  const auto = loadTheme();
  auto.systemTurns(true);
  assert.equal(auto.theme(), "dark");
  const picked = loadTheme({ copy: "light", saved: "light" });
  await picked.settle();
  picked.systemTurns(true);
  assert.equal(picked.theme(), "light");
});

test("unknown saved values mean Auto", async () => {
  const page = loadTheme({ copy: "purple", saved: "purple", dark: true });
  await page.settle();
  assert.equal(page.theme(), "dark");
});

for (const page of ["src/popup/popup.html", "src/welcome/welcome.html", "src/blocked/blocked.html"]) {
  test(`${page} loads theme.js in <head>, right after the stylesheet`, () => {
    const head = fs.readFileSync(path.join(ROOT, page), "utf8").split("</head>")[0];
    assert.match(head, /<link rel="stylesheet" href="\.\.\/shared\/style\.css">\s*<script src="\.\.\/shared\/theme\.js"><\/script>/);
    assert.doesNotMatch(head, /<script src="\.\.\/shared\/theme\.js"[^>]*\s(async|defer)/, "it must block drawing until the theme is set");
  });
}
