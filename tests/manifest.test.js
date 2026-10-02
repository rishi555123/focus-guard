// Checks that every file the extension points to exists, and that only the
// block page is exposed to websites. Plain Node 18+, no installs:  node --test
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));

function filesIn(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name === ".git" || e.name === "node_modules") return [];
    const full = path.join(dir, e.name);
    return e.isDirectory() ? filesIn(full) : [full];
  });
}
const files = filesIn(path.join(ROOT, "src"));

test("every path in manifest.json exists", () => {
  const refs = [
    manifest.background.service_worker,
    manifest.action.default_popup,
    ...Object.values(manifest.icons),
    ...Object.values(manifest.action.default_icon),
    ...manifest.web_accessible_resources.flatMap((w) => w.resources)
  ];
  for (const ref of refs) assert.ok(fs.existsSync(path.join(ROOT, ref)), ref);
});

test("every script and stylesheet in the HTML pages exists", () => {
  for (const file of files.filter((f) => f.endsWith(".html"))) {
    const html = fs.readFileSync(file, "utf8");
    for (const [, ref] of html.matchAll(/(?:href|src)="([^"#:]+)"/g)) {
      assert.ok(fs.existsSync(path.resolve(path.dirname(file), ref)), `${path.relative(ROOT, file)} -> ${ref}`);
    }
  }
});

test("every chrome.runtime.getURL path exists", () => {
  for (const file of files.filter((f) => f.endsWith(".js"))) {
    const js = fs.readFileSync(file, "utf8");
    for (const [, ref] of js.matchAll(/getURL\(\s*["']([^"']+)["']/g)) {
      assert.ok(fs.existsSync(path.join(ROOT, ref)), `${path.relative(ROOT, file)} -> ${ref}`);
    }
  }
});

test("only the block page is exposed to websites", () => {
  const exposed = manifest.web_accessible_resources.flatMap((w) => w.resources);
  assert.deepEqual(exposed, ["src/blocked/blocked.html"]);
});
