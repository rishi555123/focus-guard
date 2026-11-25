// Tests for the block page's unlock flow (src/blocked/blocked.js), run against a
// stand-in page and chrome API. Plain Node 22+, no installs:  node --test
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// In the order blocked.html loads them
const SCRIPTS = ["src/shared/constants.js", "src/shared/reason.js", "src/shared/sites.js", "src/shared/browser.js", "src/blocked/questions.js", "src/blocked/links.js", "src/blocked/blocked.js"]
  .map((f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8"));
const TARGET = "https://chatgpt.com/";
// Elements blocked.html starts hidden, so the stand-ins start the same way
const HIDDEN_IDS = [...fs.readFileSync(path.join(__dirname, "../src/blocked/blocked.html"), "utf8").matchAll(/<\w+\b[^>]*\bid="([^"]+)"[^>]*\bhidden\b/g)].map((m) => m[1]);
const KEYS = ["tried", "expected", "got"];
const ANSWERS = {
  tried: "I printed the values right before the loop",
  expected: "The loop should stop at the last index",
  got: "It reads one past the end and crashes"
};

function fakeElement() {
  const classes = new Set();
  return {
    textContent: "", value: "", hidden: false, disabled: false, readOnly: false, listeners: {},
    classList: {
      add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c),
      toggle: (c, on) => (on ? classes.add(c) : classes.delete(c))
    },
    addEventListener(type, fn) { this.listeners[type] = fn; },
    append() {}
  };
}

// Loads the block page. `unlock` answers the unlock message (it can return or throw).
// `constants` replaces src/shared/constants.js, to check nothing has its numbers built in.
// `clipboard` stands in for navigator.clipboard.writeText.
// The wait runs only when the test calls wait().
function loadBlockPage(unlock, { constants = SCRIPTS[0], clipboard = async () => {} } = {}) {
  const elements = Object.fromEntries(HIDDEN_IDS.map((id) => [id, { ...fakeElement(), hidden: true }]));
  const timers = new Map();
  const sent = [];
  let nextTimer = 1;
  const location = { search: "?t=" + encodeURIComponent(TARGET), href: "", replace(url) { this.replaced = url; } };
  const chrome = {
    storage: { local: { get: async () => ({}) }, onChanged: { addListener() {} } },
    runtime: {
      sendMessage: async (msg) => { sent.push(msg); return msg.type === "unlock" ? unlock(msg) : { ok: true, blocked: true }; }
    },
    tabs: {}
  };
  const document = {
    getElementById: (id) => (elements[id] ??= fakeElement()),
    createElement: () => fakeElement()
  };
  const context = vm.createContext({
    chrome, document, location, URL, URLSearchParams, Math,
    navigator: { clipboard: { writeText: clipboard } }, history: { length: 1 },
    performance: { getEntriesByType: () => [] },
    setInterval: (fn) => { timers.set(nextTimer, fn); return nextTimer++; },
    clearInterval: (id) => timers.delete(id)
  });
  for (const script of [constants, ...SCRIPTS.slice(1)]) vm.runInContext(script, context);

  const button = elements.unlock, count = elements.count;
  return {
    button, count, location, elements, sent,
    box: (key) => elements[key],
    hint: (key) => elements[key + "Hint"],
    type(key, text) { elements[key].value = text; elements[key].listeners.input(); },
    answer(answers = ANSWERS) { for (const key of KEYS) this.type(key, answers[key]); },
    click(id = "unlock") { if (!elements[id].disabled) return elements[id].listeners.click?.() ?? elements[id].onclick?.(); }, // a disabled button ignores clicks
    async wait() { // every tick of the wait, until its timer stops
      for (let i = 0; i < 100 && timers.size; i++) for (const fn of [...timers.values()]) await fn();
      assert.equal(timers.size, 0, "the wait finished");
    }
  };
}

const GRANTED = () => ({ ok: true, granted: true, domain: "chatgpt.com" });

test("each answer gets its own hint, and the button waits for all three", () => {
  const page = loadBlockPage(GRANTED);
  assert.ok(HIDDEN_IDS.includes("granted"), "the Open and Copy buttons start hidden");
  assert.equal(page.elements.granted.hidden, true);
  assert.equal(page.count.textContent, "Answer all three questions");
  assert.equal(page.button.disabled, true);
  page.type("tried", "I printed it");
  assert.equal(page.hint("tried").textContent, "8 more characters");
  assert.ok(!page.hint("tried").classList.contains("failed"), "too short isn't shown as an error");
  assert.equal(page.hint("expected").textContent, "", "no hint before you start an answer");
  page.type("tried", "I printed the values right before the lop");
  page.type("expected", "asdfasdf asdfasdf asdfasdf");
  assert.match(page.hint("expected").textContent, /random typing/);
  assert.ok(page.hint("expected").classList.contains("failed"));
  assert.equal(page.button.disabled, true);
  page.answer();
  for (const key of KEYS) assert.equal(page.hint(key).textContent, "", key);
  assert.equal(page.button.disabled, false);
  assert.equal(page.count.textContent, "Ready");
});

test("a granted pass waits for you to open the site, and sends the three answers", async () => {
  const page = loadBlockPage(GRANTED);
  page.answer();
  page.click();
  assert.equal(page.button.disabled, true, "no second click during the wait");
  for (const key of KEYS) assert.equal(page.box(key).readOnly, true, key);
  await page.wait();
  assert.deepEqual(structuredClone(page.sent.find((m) => m.type === "unlock").answers), ANSWERS);
  assert.equal(page.location.href, "", "the site doesn't open by itself");
  assert.match(page.count.textContent, /^Pass granted for chatgpt\.com for 5 minutes/);
  assert.equal(page.elements.granted.hidden, false);
  assert.equal(page.button.hidden, true);
  assert.equal(page.elements.open.textContent, "Open chatgpt.com");
  page.click("open");
  assert.equal(page.location.href, TARGET);
});

test("Copy as AI prompt copies the three answers with a request for a hint", async () => {
  const copied = [];
  const page = loadBlockPage(GRANTED, { clipboard: async (text) => { copied.push(text); } });
  page.answer({ ...ANSWERS, tried: "  " + ANSWERS.tried + "  " });
  page.click();
  await page.wait();
  await page.click("copyPrompt");
  assert.deepEqual(copied, [
    `I tried: ${ANSWERS.tried}\nI expected: ${ANSWERS.expected}\nInstead: ${ANSWERS.got}\n` +
    "Please give me a hint or explain the cause, not the full solution."
  ]);
  assert.equal(page.elements.copied.textContent, "Copied");
});

test("if copying fails, the page says so", async () => {
  const page = loadBlockPage(GRANTED, { clipboard: async () => { throw new Error("Document is not focused."); } });
  page.answer();
  page.click();
  await page.wait();
  await page.click("copyPrompt");
  assert.equal(page.elements.copied.textContent, "Couldn't copy: Document is not focused.");
});

test("if the unlock fails, the button and answers come back so you can retry", async () => {
  const page = loadBlockPage(() => ({ ok: false, error: "Error: storage is full" }));
  page.answer();
  page.click();
  await page.wait();
  assert.equal(page.button.disabled, false, "button can be pressed again");
  for (const key of KEYS) {
    assert.equal(page.box(key).readOnly, false, `${key} can be edited again`);
    assert.equal(page.box(key).value, ANSWERS[key], "what you wrote is kept");
  }
  assert.match(page.count.textContent, /Couldn't grant a pass: Error: storage is full\. You can try again\./);
  assert.ok(page.count.classList.contains("failed"), "shown as an error");
  assert.equal(page.elements.granted.hidden, true, "no Open button");
  assert.equal(page.location.href, "", "the site isn't opened");
});

test("if Focus Guard doesn't answer at all, you can retry too", async () => {
  const page = loadBlockPage(() => { throw new Error("Could not establish connection. Receiving end does not exist."); });
  page.answer();
  page.click();
  await page.wait();
  assert.equal(page.button.disabled, false);
  assert.equal(page.box("tried").readOnly, false);
  assert.match(page.count.textContent, /Couldn't grant a pass: Could not establish connection\..*You can try again\./);
});

test("a retry waits again, clears the error, and can then succeed", async () => {
  let fail = true;
  const page = loadBlockPage(() => (fail ? { ok: false, error: "busy" } : GRANTED()));
  page.answer();
  page.click();
  await page.wait();
  fail = false;
  page.click();
  assert.equal(page.button.disabled, true, "the retry has its own wait");
  assert.ok(!page.count.classList.contains("failed"), "the old error is cleared");
  assert.match(page.count.textContent, /^Wait 60s/);
  await page.wait();
  assert.equal(page.elements.granted.hidden, false);
});

test("with no session running, the site still reopens by itself", async () => {
  const page = loadBlockPage(() => ({ ok: true, granted: false, reopen: true }));
  page.answer();
  page.click();
  await page.wait();
  assert.equal(page.location.href, TARGET);
});

test("the unlock wording and limits all come from shared/constants.js", async () => {
  const page = loadBlockPage(GRANTED, {
    constants: "const SESSION_LENGTHS = [25, 50, 90]; const PASS_MINUTES = 7; const UNLOCK_MIN_CHARS = 30; const UNLOCK_WAIT_SECONDS = 3;" +
      "const minutesText = (n) => `${n} minute${n === 1 ? \"\" : \"s\"}`;"
  });
  assert.equal(page.elements.unlockIntro.textContent,
    "Answer all three questions, at least 30 characters each. You'll get a 7-minute pass for this site after a 3-second wait.");
  assert.equal(page.button.textContent, "Start 3-second wait");
  page.answer();
  page.type("got", "x is undefined at line 12 now"); // 29 characters
  assert.equal(page.hint("got").textContent, "1 more character", "singular for one");
  page.type("got", "x is undefined at line 1");
  assert.equal(page.hint("got").textContent, "6 more characters");
  page.type("got", "TypeError: x is undefined at line 12");
  assert.equal(page.button.disabled, false);
  page.click();
  assert.equal(page.count.textContent, "Wait 3s. Try one more idea while you wait.");
  await page.wait();
  assert.match(page.count.textContent, /^Pass granted for chatgpt\.com for 7 minutes/);
});
