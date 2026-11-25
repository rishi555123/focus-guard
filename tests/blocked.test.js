// Tests for the block page's unlock button (src/blocked/blocked.js), run against a
// stand-in page and chrome API. Plain Node 22+, no installs:  node --test
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// In the order blocked.html loads them
const SCRIPTS = ["src/shared/constants.js", "src/shared/browser.js", "src/blocked/questions.js", "src/blocked/links.js", "src/blocked/blocked.js"]
  .map((f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8"));
const TARGET = "https://chatgpt.com/";

function fakeElement() {
  const classes = new Set();
  return {
    textContent: "", value: "", hidden: false, disabled: false, readOnly: false, listeners: {},
    classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) },
    addEventListener(type, fn) { this.listeners[type] = fn; },
    append() {}
  };
}

// Loads the block page. `unlock` answers the unlock message (it can return or throw).
// `constants` replaces src/shared/constants.js, to check nothing has its numbers built in.
// The 60-second wait runs only when the test calls wait().
function loadBlockPage(unlock, constants = SCRIPTS[0]) {
  const elements = {};
  const timers = new Map();
  let nextTimer = 1;
  const location = { search: "?t=" + encodeURIComponent(TARGET), href: "", replace() {} };
  const chrome = {
    storage: { local: { get: async () => ({}) }, onChanged: { addListener() {} } },
    runtime: { sendMessage: async (msg) => (msg.type === "unlock" ? unlock(msg) : { ok: true, blocked: true }) },
    tabs: {}
  };
  const document = {
    getElementById: (id) => (elements[id] ??= fakeElement()),
    createElement: () => fakeElement()
  };
  const context = vm.createContext({
    chrome, document, location, URL, URLSearchParams, Math,
    navigator: {}, history: { length: 1 },
    performance: { getEntriesByType: () => [] },
    setInterval: (fn) => { timers.set(nextTimer, fn); return nextTimer++; },
    clearInterval: (id) => timers.delete(id)
  });
  for (const script of [constants, ...SCRIPTS.slice(1)]) vm.runInContext(script, context);

  const reason = elements.reason, button = elements.unlock, count = elements.count;
  return {
    reason, button, count, location, elements,
    type(text) { reason.value = text; reason.listeners.input(); },
    click() { if (!button.disabled) button.listeners.click(); }, // like a browser, a disabled button ignores clicks
    async wait() { // every tick of the 60-second wait, until its timer stops
      for (let i = 0; i < 100 && timers.size; i++) for (const fn of [...timers.values()]) await fn();
      assert.equal(timers.size, 0, "the wait finished");
    }
  };
}

const REASON = "I tried printing the values before the loop and the index is off by one somewhere.";

test("a granted pass opens the site", async () => {
  const page = loadBlockPage(() => ({ ok: true, granted: true, domain: "chatgpt.com" }));
  page.type(REASON);
  page.click();
  assert.equal(page.button.disabled, true, "no second click during the wait");
  assert.equal(page.reason.readOnly, true);
  await page.wait();
  assert.equal(page.location.href, TARGET);
});

test("if the unlock fails, the button and reason come back so you can retry", async () => {
  const page = loadBlockPage(() => ({ ok: false, error: "Error: storage is full" }));
  page.type(REASON);
  page.click();
  await page.wait();
  assert.equal(page.button.disabled, false, "button can be pressed again");
  assert.equal(page.reason.readOnly, false, "reason can be edited again");
  assert.equal(page.reason.value, REASON, "what you wrote is kept");
  assert.match(page.count.textContent, /Couldn't grant a pass: Error: storage is full\. You can try again\./);
  assert.ok(page.count.classList.contains("failed"), "shown as an error");
  assert.equal(page.location.href, "", "the site isn't opened");
});

test("if Focus Guard doesn't answer at all, you can retry too", async () => {
  const page = loadBlockPage(() => { throw new Error("Could not establish connection. Receiving end does not exist."); });
  page.type(REASON);
  page.click();
  await page.wait();
  assert.equal(page.button.disabled, false);
  assert.equal(page.reason.readOnly, false);
  assert.match(page.count.textContent, /Couldn't grant a pass: Could not establish connection\..*You can try again\./);
});

test("a retry waits again, clears the error, and can then succeed", async () => {
  let fail = true;
  const page = loadBlockPage(() => (fail ? { ok: false, error: "busy" } : { ok: true, granted: true, domain: "chatgpt.com" }));
  page.type(REASON);
  page.click();
  await page.wait();
  fail = false;
  page.click();
  assert.equal(page.button.disabled, true, "the retry has its own wait");
  assert.ok(!page.count.classList.contains("failed"), "the old error is cleared");
  assert.match(page.count.textContent, /^Wait 60s/);
  await page.wait();
  assert.equal(page.location.href, TARGET);
});

test("the unlock wording and limits all come from shared/constants.js", async () => {
  const page = loadBlockPage(() => ({ ok: true, granted: true, domain: "chatgpt.com" }),
    "const SESSION_LENGTHS = [25, 50, 90]; const PASS_MINUTES = 7; const UNLOCK_MIN_CHARS = 45; const UNLOCK_WAIT_SECONDS = 3;" +
    "const minutesText = (n) => `${n} minute${n === 1 ? \"\" : \"s\"}`;");
  assert.equal(page.elements.unlockIntro.textContent, "Write what you've tried. You'll get a 7-minute pass for this site after a 3-second wait.");
  assert.equal(page.button.textContent, "Start 3-second wait");
  assert.equal(page.count.textContent, "Write at least 45 characters");
  page.type("x".repeat(44));
  assert.equal(page.button.disabled, true, "44 characters isn't enough");
  assert.equal(page.count.textContent, "1 more character", "singular for one");
  page.type("x".repeat(43));
  assert.equal(page.count.textContent, "2 more characters");
  page.type("x".repeat(45));
  assert.equal(page.button.disabled, false);
  page.click();
  assert.equal(page.count.textContent, "Wait 3s. Try one more idea while you wait.");
  await page.wait();
  assert.equal(page.count.textContent, "Pass granted for chatgpt.com for 7 minutes");
});
