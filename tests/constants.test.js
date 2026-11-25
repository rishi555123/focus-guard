// Tests for src/shared/constants.js: the session lengths, pass length and unlock limits
// live there and nowhere else. Plain Node 22+, no installs:  node --test
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const CONSTANTS_FILE = "src/shared/constants.js";

const constants = vm.createContext({});
vm.runInContext(read(CONSTANTS_FILE), constants);
const C = structuredClone(vm.runInContext("({ SESSION_LENGTHS, PASS_MINUTES, UNLOCK_MIN_CHARS, UNLOCK_WAIT_SECONDS })", constants));

// Text that mentions one of the numbers on purpose, for something else
const ALLOWED = [
  ["src/blocked/questions.js", "Have you stepped away for 5 minutes?"] // advice, not the pass length
];

// Ways one of the numbers could be typed out again, built from the current values
const lengths = C.SESSION_LENGTHS.join("\\s*,\\s*");
const FORBIDDEN = [
  ["the session lengths list", new RegExp(`\\[\\s*${lengths}\\s*\\]`)],
  ["a session length button", /data-min="\d+"/],
  ...C.SESSION_LENGTHS.map((m) => [`the ${m}-minute session length`, new RegExp(`\\b${m}\\s*(min\\b|minutes?\\b|:00\\b)`)]),
  ["the pass length", new RegExp(`\\b${C.PASS_MINUTES}[- ]minutes?\\b`)],
  ["the unlock wait", new RegExp(`\\b${C.UNLOCK_WAIT_SECONDS}[- ]?(s\\b|seconds?\\b)`)],
  ["the reason length", new RegExp(`\\b${C.UNLOCK_MIN_CHARS} (more )?characters?\\b`)],
  ["a second copy of a constant", /\bconst\s+(SESSION_LENGTHS|PASS_MINUTES|UNLOCK_MIN_CHARS|UNLOCK_WAIT_SECONDS)\b/],
  ["an unlock limit typed out", /\b(MIN_CHARS|WAIT_SECONDS)\s*=\s*\d/]
];

function hardCoded(file, text) {
  for (const [allowedFile, allowedText] of ALLOWED) if (file === allowedFile) text = text.split(allowedText).join("");
  return FORBIDDEN.filter(([, re]) => re.test(text)).map(([what]) => `${file}: ${what}`);
}

function sourceFiles(dir) {
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = path.posix.join(dir, e.name);
    return e.isDirectory() ? sourceFiles(rel) : /\.(js|html)$/.test(e.name) ? [rel] : [];
  });
}

test("no session length, pass length or unlock limit is typed out outside constants.js", () => {
  const files = sourceFiles("src").filter((f) => f !== CONSTANTS_FILE);
  assert.ok(files.length > 10, "found the source files");
  assert.deepEqual(files.flatMap((f) => hardCoded(f, read(f))), []);
});

test("the check catches the ways these numbers used to be typed out", () => {
  const old = [
    'const SESSION_LENGTHS = [25, 50, 90];',
    'if ([25, 50, 90].includes(lastMinutes)) pickMinutes(lastMinutes);',
    '<button data-min="50" aria-pressed="false">50 min</button>',
    'let minutes = 25, timer;\n<div class="clock" id="clock">25:00</div>',
    'notify(`Your 5-minute pass for ${pass.domain} is over.`)',
    'count.textContent = `Pass granted for ${res.domain} for 5 minutes`;',
    'const MIN_CHARS = 60, WAIT_SECONDS = 60;',
    '<button id="unlock" disabled>Start 60-second wait</button>',
    '<span id="count" class="muted">Write at least 60 characters</span>'
  ];
  for (const snippet of old) assert.notDeepEqual(hardCoded("src/example.js", snippet), [], snippet);
  assert.deepEqual(hardCoded("src/blocked/questions.js", '"Have you stepped away for 5 minutes?"'), [], "the allowed question");
  assert.deepEqual(hardCoded("src/example.js", "const left = MIN_CHARS - reason.value.trim().length;"), []);
});

test("constants.js holds sensible values", () => {
  assert.ok(C.SESSION_LENGTHS.length > 0 && C.SESSION_LENGTHS.every((m) => Number.isInteger(m) && m > 0));
  assert.equal(new Set(C.SESSION_LENGTHS).size, C.SESSION_LENGTHS.length, "no repeated lengths");
  for (const n of [C.PASS_MINUTES, C.UNLOCK_MIN_CHARS, C.UNLOCK_WAIT_SECONDS]) assert.ok(Number.isInteger(n) && n > 0);
  const minutesText = vm.runInContext("minutesText", constants);
  assert.deepEqual([minutesText(1), minutesText(5)], ["1 minute", "5 minutes"]);
});

test("every script that uses the constants loads constants.js first", () => {
  assert.match(read("src/background/background.js"), /^importScripts\("\.\.\/shared\/constants\.js"\);/);
  for (const [page, first] of [["src/popup/popup.html", "../shared/constants.js"], ["src/blocked/blocked.html", "../shared/constants.js"]]) {
    const scripts = [...read(page).split("</head>")[1].matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(scripts[0], first, `${page} loads constants.js before its other scripts`);
  }
});

// The popup, loaded with different numbers: its buttons come from the constants
function loadPopup(constantsSource) {
  const els = {};
  const element = () => ({
    hidden: false, disabled: false, textContent: "", value: "", dataset: {}, children: [],
    classList: { toggle() {}, add() {}, remove() {} },
    attributes: {}, setAttribute(k, v) { this.attributes[k] = String(v); },
    addEventListener() {}, append(...kids) { this.children.push(...kids); }
  });
  const durations = element();
  const document = {
    getElementById: (id) => (els[id] ??= element()),
    createElement: () => element(),
    querySelector: (sel) => (sel === ".durations" ? durations : null),
    querySelectorAll: (sel) => (sel === ".durations button" ? durations.children : [])
  };
  const chrome = {
    storage: { local: { get: async () => ({}), set: async () => {} }, onChanged: { addListener() {} } },
    runtime: { sendMessage: async () => ({ ok: true }) },
    extension: { isAllowedIncognitoAccess: async () => true },
    tabs: {}
  };
  const context = vm.createContext({ document, chrome, navigator: {}, URL, setInterval, clearInterval, confirm: () => false });
  vm.runInContext(constantsSource, context);
  for (const file of ["src/shared/sites.js", "src/shared/browser.js", "src/shared/setup.js", "src/popup/popup.js"]) {
    vm.runInContext(read(file), context);
  }
  return durations.children.map((b) => [b.textContent, b.dataset.min, b.attributes["aria-pressed"]]);
}

test("the popup has one button per session length, the first one picked", () => {
  assert.deepEqual(loadPopup(read(CONSTANTS_FILE)), C.SESSION_LENGTHS.map((m, i) => [`${m} min`, m, String(i === 0)]));
  assert.deepEqual(loadPopup("const SESSION_LENGTHS = [15, 45]; const PASS_MINUTES = 5;"), [
    ["15 min", 15, "true"],
    ["45 min", 45, "false"]
  ]);
});
