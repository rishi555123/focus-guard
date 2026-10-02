// Checks TESTING.md's checklist so GitHub keeps rendering it as real checkboxes.
// Plain Node 22+, no installs:  node --test
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const TESTING = fs.readFileSync(path.join(__dirname, "..", "TESTING.md"), "utf8");

// Characters that look like a space but aren't one, so GitHub doesn't see a task list
const ODD_SPACES = /[   -​  ⁠　﻿\t]/g;
// A real checklist line: "- [ ] " then a check number like 4.3 and some text
const GOOD = /^- \[ \] \d+\.\d+ \S/;

// Does this line look like a checklist item, even a broken one?
function looksLikeCheck(line) {
  const plain = line.replace(ODD_SPACES, " ");
  return /^\s*(?:[-*+]\s*)?\[[^\]]{0,2}\]/.test(plain) ||    // [ ], [], [x], with or without a bullet
         /^\s*(?:[-*+]\s*)?\d+\.\d+\s/.test(plain);         // a check number without a box
}

// Problems with one checklist line, or [] if it's fine
function problems(line) {
  const found = [];
  if (ODD_SPACES.test(line)) found.push("contains a tab or a character that only looks like a space");
  ODD_SPACES.lastIndex = 0;
  if (!GOOD.test(line)) found.push('must start with "- [ ] " and a check number like 4.3');
  return found;
}

// Checklist lines outside code blocks, with their line numbers
function checklistLines(markdown) {
  let inFence = false;
  return markdown.split(/\r?\n/).flatMap((line, i) => {
    if (/^\s*```/.test(line)) { inFence = !inFence; return []; }
    return !inFence && looksLikeCheck(line) ? [{ n: i + 1, line }] : [];
  });
}

test("the checker spots broken checklist lines", () => {
  const bad = [
    "-[ ] 1.1 No space after the dash",
    "- [] 1.1 No space inside the box",
    "- [ ]1.1 No space after the box",
    "* [ ] 1.1 Star bullet",
    "+ [ ] 1.1 Plus bullet",
    "  - [ ] 1.1 Indented",
    "[ ] 1.1 No bullet",
    "- [x] 1.1 Already ticked",
    "- [ ] Missing its check number",
    "- 1.1 Missing its box",
    "- [ ] 1.1 Non-breaking space after the dash",
    "- [ ] 1.1 Non-breaking space inside the box",
    "- [ ] 1.1 Non-breaking space after the box",
    "- [ ] 1.1​ Zero-width space",
    "-\t[ ] 1.1 Tab after the dash"
  ];
  for (const line of bad) {
    assert.ok(looksLikeCheck(line), "should be noticed: " + JSON.stringify(line));
    assert.notDeepEqual(problems(line), [], "should be rejected: " + JSON.stringify(line));
  }
  assert.deepEqual(problems("- [ ] 4.3 Unlock claude.ai, then unlock chatgpt.com."), []);
  assert.equal(looksLikeCheck("1. Go to `chrome://extensions` and click reload."), false, "numbered steps aren't checks");
  assert.equal(looksLikeCheck("| Show the warning | **Active pass** | `chrome.alarms.create(...)` |"), false);
});

test("every checklist line in TESTING.md is a real GitHub checkbox", () => {
  const lines = checklistLines(TESTING);
  assert.ok(lines.length >= 50, `found only ${lines.length} checklist lines; did the format change?`);
  const failures = lines.flatMap(({ n, line }) =>
    problems(line).map((p) => `TESTING.md:${n} ${p}: ${JSON.stringify(line.slice(0, 40))}`));
  assert.deepEqual(failures, []);
});

test("every check number in TESTING.md is used once", () => {
  const numbers = checklistLines(TESTING).map(({ line }) => (line.match(/\d+\.\d+/) || [""])[0]);
  const repeated = numbers.filter((num, i) => numbers.indexOf(num) !== i);
  assert.deepEqual(repeated, []);
});

test("TESTING.md has no byte order mark", () => {
  assert.notEqual(TESTING.charCodeAt(0), 0xFEFF);
});
