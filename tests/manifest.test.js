// Checks that every file the extension points to exists, and that the block
// page and everything it loads are exposed to websites. Plain Node 18+, no installs:  node --test
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

// Websites get redirected to the block page, and in Chrome its own scripts and
// stylesheet must be exposed too, or the page loads unstyled and broken
test("the block page and every file it loads are exposed to websites", () => {
  const exposed = manifest.web_accessible_resources.flatMap((w) => w.resources);
  const page = "src/blocked/blocked.html";
  const html = fs.readFileSync(path.join(ROOT, page), "utf8");
  const loads = [...html.matchAll(/(?:href|src)="([^"#:]+)"/g)]
    .map(([, ref]) => path.posix.join(path.posix.dirname(page), ref));

  assert.ok(loads.length > 0, "found the page's scripts and stylesheet");
  for (const file of [page, ...loads]) assert.ok(exposed.includes(file), file + " must be exposed");
});

test("the permissions the background script uses are declared", () => {
  const source = fs.readFileSync(path.join(ROOT, "src/background/background.js"), "utf8");
  for (const api of ["declarativeNetRequest", "storage", "alarms", "tabs", "notifications"]) {
    if (source.includes("chrome." + api)) assert.ok(manifest.permissions.includes(api), api + " permission is missing");
  }
  assert.ok(manifest.permissions.includes("notifications"));
});

test("the welcome page and its scripts exist", () => {
  for (const file of ["src/welcome/welcome.html", "src/welcome/welcome.js", "src/shared/setup.js"]) {
    assert.ok(fs.existsSync(path.join(ROOT, file)), file);
  }
  const html = fs.readFileSync(path.join(ROOT, "src/welcome/welcome.html"), "utf8");
  assert.match(html, /src="\.\.\/shared\/setup\.js"/);
  assert.match(html, /src="welcome\.js"/);
});

test("the uninstall page points at a README heading that exists", () => {
  const source = fs.readFileSync(path.join(ROOT, "src/background/background.js"), "utf8");
  const url = source.match(/UNINSTALL_URL = "([^"]+)"/)[1];
  assert.match(url, /^https:\/\/github\.com\/rishi555123\/focus-guard#/);
  // GitHub's heading anchors: lowercase, punctuation removed, spaces become dashes
  const slug = (heading) => heading.toLowerCase().replace(/[^\w\- ]/g, "").replace(/ /g, "-");
  const readme = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");
  const anchors = [...readme.matchAll(/^#{1,6} (.+)$/gm)].map((m) => slug(m[1].trim()));
  assert.ok(anchors.includes(url.split("#")[1]), "README has no heading for #" + url.split("#")[1]);
});

test("nothing else is exposed to websites", () => {
  const exposed = manifest.web_accessible_resources.flatMap((w) => w.resources);
  assert.deepEqual(exposed.sort(), [
    "src/blocked/blocked.html", "src/blocked/blocked.js", "src/blocked/links.js", "src/shared/style.css"
  ]);
});
