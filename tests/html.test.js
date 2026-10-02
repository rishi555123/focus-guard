// Checks the popup and block page HTML: ARIA references point at real
// elements, and every element the page's script looks up by id exists.
// Plain Node 18+, no installs:  node --test
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const PAGES = [
  { html: "src/popup/popup.html", script: "src/popup/popup.js" },
  { html: "src/blocked/blocked.html", script: "src/blocked/blocked.js" },
  { html: "src/welcome/welcome.html", script: "src/welcome/welcome.js" }
];
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const idsIn = (html) => new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));

for (const page of PAGES) {
  test(`${page.html}: ARIA attributes only point at ids that exist`, () => {
    const html = read(page.html);
    const ids = idsIn(html);
    const refs = [...html.matchAll(/\saria-(labelledby|describedby|controls|owns|errormessage)="([^"]*)"/g)];
    for (const [, attr, value] of refs) {
      for (const id of value.trim().split(/\s+/)) assert.ok(ids.has(id), `aria-${attr} points at missing id "${id}"`);
    }
  });

  test(`${page.html}: no two elements share an id`, () => {
    const all = [...read(page.html).matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(all.filter((id, i) => all.indexOf(id) !== i), []);
  });

  test(`${page.script}: every id the script looks up exists in ${path.basename(page.html)}`, () => {
    const ids = idsIn(read(page.html));
    const js = read(page.script);
    const lookups = [...js.matchAll(/(?:getElementById|\$)\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1]);
    assert.ok(lookups.length > 0, "found the script's lookups");
    for (const id of lookups) assert.ok(ids.has(id), `#${id} is missing from ${page.html}`);
  });
}
