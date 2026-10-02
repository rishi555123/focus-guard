// Tests for src/shared/browser.js: telling Edge from Chrome, and the wording,
// settings pages and page sections that go with each.
// Plain Node 22+, no installs:  node --test
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");
const SOURCE = fs.readFileSync(path.join(ROOT, "src/shared/browser.js"), "utf8");

// Load browser.js as if running in a browser with this navigator
function load(navigator) {
  const context = vm.createContext({ navigator });
  vm.runInContext(SOURCE, context);
  return {
    detect: vm.runInContext("detectBrowser", context),
    browser: structuredClone(vm.runInContext("BROWSER", context)),
    browsers: structuredClone(vm.runInContext("BROWSERS", context)),
    apply: vm.runInContext("applyBrowserText", context)
  };
}

const EDGE_BRANDS = [
  { brand: "Not_A Brand", version: "8" }, { brand: "Chromium", version: "120" }, { brand: "Microsoft Edge", version: "120" }
];
const CHROME_BRANDS = [
  { brand: "Google Chrome", version: "120" }, { brand: "Not_A Brand", version: "8" }, { brand: "Chromium", version: "120" }
];
const EDGE_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0";
const CHROME_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

test("Edge is detected from its User-Agent Client Hints brand", () => {
  assert.equal(load({ userAgentData: { brands: EDGE_BRANDS }, userAgent: CHROME_UA }).browser.id, "edge",
    "client hints win over the user agent string");
});

test("the brand is found wherever it is in the list", () => {
  const reordered = [EDGE_BRANDS[2], EDGE_BRANDS[0], EDGE_BRANDS[1]];
  assert.equal(load({ userAgentData: { brands: reordered } }).browser.id, "edge");
});

test("Chrome is detected from its brands", () => {
  assert.equal(load({ userAgentData: { brands: CHROME_BRANDS }, userAgent: EDGE_UA }).browser.id, "chrome");
});

test("without client hints, the Edg/ token in the user agent is the fallback", () => {
  assert.equal(load({ userAgent: EDGE_UA }).browser.id, "edge");
  assert.equal(load({ userAgent: CHROME_UA }).browser.id, "chrome");
  assert.equal(load({ userAgentData: { brands: [] }, userAgent: EDGE_UA }).browser.id, "edge", "empty brands list");
});

test("other Chromium browsers and odd values get the Chrome wording", () => {
  assert.equal(load({ userAgentData: { brands: [{ brand: "Brave", version: "1" }, { brand: "Chromium", version: "120" }] } }).browser.id, "chrome");
  assert.equal(load({ userAgent: CHROME_UA + " OPR/105.0.0.0" }).browser.id, "chrome");
  assert.equal(load({ userAgent: "Mozilla/5.0 ... Edge/18.19582" }).browser.id, "chrome", "legacy EdgeHTML isn't Chromium Edge");
  assert.equal(load({}).browser.id, "chrome");
  assert.equal(load(undefined).browser.id, "chrome");
  assert.equal(load({ userAgentData: { brands: [null, { brand: "Microsoft Edge" }] } }).browser.id, "edge");
});

test("Edge uses InPrivate, edge:// pages and an optional Copilot step", () => {
  const { browsers } = load({});
  const edge = browsers.edge;
  assert.equal(edge.text.private, "InPrivate");
  assert.equal(edge.text.notifyApp, "Microsoft Edge");
  assert.equal(edge.extensionsPage, "edge://extensions");
  assert.equal(edge.newTab, "edge://newtab/");
  assert.equal(edge.assistant.name, "Copilot in Edge");
  assert.equal(edge.assistant.optional, true);
  assert.match(edge.assistant.settingsUrl, /^edge:\/\/settings\//);
});

test("Chrome uses Incognito, chrome:// pages and the Gemini step", () => {
  const chrome = load({}).browsers.chrome;
  assert.equal(chrome.text.private, "Incognito");
  assert.equal(chrome.text.notifyApp, "Google Chrome");
  assert.equal(chrome.extensionsPage, "chrome://extensions");
  assert.equal(chrome.newTab, "chrome://newtab/");
  assert.equal(chrome.assistant.name, "Gemini in Chrome");
  assert.equal(chrome.assistant.optional, false);
  assert.equal(chrome.assistant.settingsUrl, "chrome://settings/ai/gemini");
});

test("no Edge setting points at a chrome:// page, and no Chrome setting at edge://", () => {
  const { browsers } = load({});
  assert.doesNotMatch(JSON.stringify(browsers.edge), /chrome:\/\//);
  assert.doesNotMatch(JSON.stringify(browsers.chrome), /edge:\/\//);
  assert.doesNotMatch(JSON.stringify(browsers.edge), /Gemini|Incognito/);
});

test("each browser keeps its own 'turned it off' checkbox", () => {
  const { browsers } = load({});
  assert.equal(browsers.chrome.assistant.storageKey, "geminiOff");
  assert.equal(browsers.edge.assistant.storageKey, "copilotOff");
});

// A tiny stand-in for a page, enough for applyBrowserText
function fakePage(elements) {
  return { querySelectorAll: (sel) => elements.filter((el) => (sel === "[data-browser]" ? el.dataset.browser : el.dataset.text)) };
}

test("applyBrowserText shows only this browser's sections and fills in its words", () => {
  const { apply } = load({ userAgentData: { brands: EDGE_BRANDS } });
  const gemini = { dataset: { browser: "chrome" }, hidden: true };
  const copilot = { dataset: { browser: "edge" }, hidden: true };
  const word = { dataset: { text: "private" }, textContent: "Incognito" };
  const app = { dataset: { text: "notifyApp" }, textContent: "Google Chrome" };
  const unknown = { dataset: { text: "nope" }, textContent: "kept" };
  apply(fakePage([gemini, copilot, word, app, unknown]));
  assert.equal(gemini.hidden, true, "Gemini step stays hidden in Edge");
  assert.equal(copilot.hidden, false);
  assert.equal(word.textContent, "InPrivate");
  assert.equal(app.textContent, "Microsoft Edge");
  assert.equal(unknown.textContent, "kept");
});

test("in Chrome, the Gemini section shows and the Copilot one stays hidden", () => {
  const { apply } = load({ userAgentData: { brands: CHROME_BRANDS } });
  const gemini = { dataset: { browser: "chrome" }, hidden: true };
  const copilot = { dataset: { browser: "edge" }, hidden: true };
  apply(fakePage([gemini, copilot]));
  assert.deepEqual([gemini.hidden, copilot.hidden], [false, true]);
});

// The pages themselves

const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

for (const page of ["src/welcome/welcome.html", "src/popup/popup.html", "src/blocked/blocked.html"]) {
  test(`${page}: browser-specific parts start hidden, and every word key exists`, () => {
    const html = read(page);
    const keys = Object.keys(load({}).browsers.chrome.text);
    for (const [tag] of html.matchAll(/<[^>]*\sdata-browser="[^"]*"[^>]*>/g)) {
      assert.match(tag, /data-browser="(chrome|edge)"/, tag);
      assert.match(tag, /\shidden[\s>]/, "must start hidden so the wrong browser's text never flashes: " + tag);
    }
    for (const [, key] of html.matchAll(/\sdata-text="([^"]+)"/g)) assert.ok(keys.includes(key), "unknown data-text: " + key);
    if (/data-(browser|text)=/.test(html)) assert.match(html, /src="\.\.\/shared\/browser\.js"/, "page needs browser.js");
  });
}

test("the welcome page has a Gemini step for Chrome and a Copilot step for Edge", () => {
  const html = read("src/welcome/welcome.html");
  const chromeStep = html.match(/<section[^>]*data-browser="chrome"[\s\S]*?<\/section>/)[0];
  const edgeStep = html.match(/<section[^>]*data-browser="edge"[\s\S]*?<\/section>/)[0];
  assert.match(chromeStep, /Gemini in Chrome/);
  assert.match(edgeStep, /Optional: turn off Copilot in Edge/);
  assert.doesNotMatch(edgeStep, /Gemini|Chrome/, "the Edge step never mentions Gemini or Chrome");
});

test("no page hard-codes a chrome:// or edge:// address outside browser.js", () => {
  for (const file of ["src/shared/setup.js", "src/popup/popup.js", "src/welcome/welcome.js", "src/blocked/blocked.js"]) {
    assert.doesNotMatch(read(file).replace(/\/\/.*$/gm, ""), /(chrome|edge):\/\//, file);
  }
});
