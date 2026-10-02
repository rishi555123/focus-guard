// Tests for the website in site/. It must be fully self-contained, so it can be dragged
// onto Netlify Drop: every link, image, stylesheet and script resolves inside site/, and
// nothing points outside it. Plain Node 22+, no installs:  node --test
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const SITE = path.join(ROOT, "site");
const DOWNLOAD = "https://github.com/rishi555123/focus-guard/releases/latest/download/focus-guard.zip";

// The only addresses outside the site that pages may link to
const ALLOWED_EXTERNAL = [
  /^https:\/\/github\.com\/rishi555123\/focus-guard(\/|#|$)/, // the repo, its releases, files and README sections
  /^https:\/\/docs\.github\.com\/en\/site-policy\//,         // GitHub's privacy statement, linked from the privacy policy
  /^https:\/\/www\.flaticon\.com\/free-icon\/security-agent_11618268$/ // the icon credit Flaticon's licence asks for
];

function filesIn(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? filesIn(path.join(dir, e.name)) : [path.join(dir, e.name)]);
}
const FILES = filesIn(SITE);
const PAGES = FILES.filter((f) => f.endsWith(".html"));
const rel = (f) => path.relative(ROOT, f).replace(/\\/g, "/");
const read = (f) => fs.readFileSync(f, "utf8");

// Every reference a file makes: href, src, srcset and CSS url()
function referencesIn(file) {
  const text = read(file);
  const refs = [];
  if (file.endsWith(".html")) {
    for (const [, , value] of text.matchAll(/\s(href|src)="([^"]*)"/g)) refs.push(value);
    for (const [, value] of text.matchAll(/\ssrcset="([^"]*)"/g)) refs.push(...value.split(",").map((s) => s.trim().split(/\s+/)[0]));
    for (const [, value] of text.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) refs.push(value);
  } else if (file.endsWith(".css")) {
    for (const [, value] of text.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) refs.push(value);
    for (const [, value] of text.matchAll(/@import\s+['"]([^'"]+)['"]/g)) refs.push(value);
  } else if (file.endsWith(".js")) {
    for (const [, value] of text.matchAll(/(?:fetch|import)\(\s*['"]([^'"]+)['"]/g)) refs.push(value);
  }
  return refs;
}

const isExternal = (ref) => /^[a-z][a-z0-9+.-]*:/i.test(ref) || ref.startsWith("//");

// Where a local reference points, as an absolute path on disk
function resolveLocal(file, ref) {
  const clean = decodeURIComponent(ref.split("#")[0].split("?")[0]);
  if (clean === "") return file; // a link to an anchor on the same page
  return clean.startsWith("/") ? path.join(SITE, clean) : path.resolve(path.dirname(file), clean);
}

test("site/ has the expected pages", () => {
  for (const name of ["index.html", "install.html", "releases.html", "privacy.html", "404.html"]) {
    assert.ok(fs.existsSync(path.join(SITE, name)), name);
  }
});

test("every local link, image, stylesheet and script in site/ resolves to a file inside site/", () => {
  const problems = [];
  for (const file of FILES.filter((f) => /\.(html|css|js)$/.test(f))) {
    for (const ref of referencesIn(file)) {
      if (isExternal(ref)) continue;
      const target = resolveLocal(file, ref);
      if (!target.startsWith(SITE + path.sep) && target !== SITE) problems.push(`${rel(file)}: "${ref}" points outside site/`);
      else if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) problems.push(`${rel(file)}: "${ref}" is missing`);
    }
  }
  assert.deepEqual(problems, []);
});

test("nothing in site/ uses ../ or points at the project's other folders", () => {
  for (const file of FILES.filter((f) => /\.(html|css|js|toml|txt)$/.test(f))) {
    const text = read(file);
    assert.doesNotMatch(text, /(["'(=\s])\.\.\//, `${rel(file)} uses ../`);
    assert.doesNotMatch(text, /(href|src)="\/?(docs|src|icons|tests|dist)\//, `${rel(file)} points at a folder outside site/`);
    assert.doesNotMatch(text, /[A-Z]:\\|file:\/\/|\/Users\/|OneDrive/i, `${rel(file)} has a local path from this computer`);
  }
});

test("external links go only to the download, GitHub, and the icon credit", () => {
  const problems = [];
  for (const file of FILES.filter((f) => /\.(html|css|js)$/.test(f))) {
    for (const ref of referencesIn(file)) {
      if (isExternal(ref) && !ALLOWED_EXTERNAL.some((re) => re.test(ref))) problems.push(`${rel(file)}: ${ref}`);
    }
  }
  assert.deepEqual(problems, []);
});

test("no page loads anything from another website (fonts, scripts, styles, images)", () => {
  for (const page of PAGES) {
    const html = read(page);
    for (const [tag] of html.matchAll(/<(script|link|img|source|iframe)\b[^>]*>/g)) {
      const value = (tag.match(/\s(?:src|href)="([^"]*)"/) || [])[1];
      if (value) assert.ok(!isExternal(value), `${rel(page)} loads ${value}`);
    }
  }
  for (const css of FILES.filter((f) => f.endsWith(".css"))) assert.doesNotMatch(read(css), /@import|url\(\s*['"]?https?:/, rel(css));
});

test("the download buttons point at the newest release's focus-guard.zip", () => {
  for (const name of ["index.html", "install.html"]) {
    const html = read(path.join(SITE, name));
    const buttons = [...html.matchAll(/<a class="button big" href="([^"]+)">Download Focus Guard<\/a>/g)];
    assert.ok(buttons.length > 0, `${name} has a Download Focus Guard button`);
    for (const [, href] of buttons) assert.equal(href, DOWNLOAD);
  }
});

test("every page has a language, title, description, viewport and the shared stylesheet", () => {
  for (const page of PAGES) {
    const html = read(page);
    assert.match(html, /<html lang="en"/, rel(page));
    assert.match(html, /<title>[^<]{5,}<\/title>/, rel(page));
    assert.match(html, /<meta name="description" content="[^"]{20,}">/, rel(page));
    assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1">/, rel(page));
    assert.match(html, /href="\/?assets\/style\.css"/, rel(page));
    assert.match(html, /<main id="main"/, `${rel(page)} has a main landmark for the skip link`);
    assert.match(html, /<a class="skip" href="#main">/, rel(page));
  }
});

test("every image has alt text, and content images describe themselves", () => {
  for (const page of PAGES) {
    for (const [tag] of read(page).matchAll(/<img\b[^>]*>/g)) {
      assert.match(tag, /\salt="[^"]*"/, `${rel(page)}: ${tag}`);
      const alt = tag.match(/\salt="([^"]*)"/)[1];
      if (!/class="icon-ink"/.test(tag)) assert.ok(alt.length >= 20, `${rel(page)}: screenshot alt text is too short: ${tag}`);
    }
  }
});

test("each page's headings don't skip a level", () => {
  for (const page of PAGES) {
    const levels = [...read(page).matchAll(/<h([1-6])[\s>]/g)].map((m) => +m[1]);
    assert.equal(levels[0], 1, `${rel(page)} starts with an h1`);
    for (let i = 1; i < levels.length; i++) {
      assert.ok(levels[i] <= levels[i - 1] + 1, `${rel(page)}: h${levels[i - 1]} is followed by h${levels[i]}`);
    }
  }
});

test("the navigation marks the current page", () => {
  const expected = { "index.html": "index.html", "install.html": "install.html", "releases.html": "releases.html", "privacy.html": "privacy.html" };
  for (const [name, current] of Object.entries(expected)) {
    const html = read(path.join(SITE, name));
    const marked = [...html.matchAll(/<a href="([^"]+)" aria-current="page">/g)].map((m) => m[1]);
    assert.deepEqual(marked, [current], name);
  }
});

test("the footer has the GitHub repo, the MIT license and the Flaticon credit on every page", () => {
  for (const page of PAGES) {
    const footer = read(page).split("<footer")[1] || "";
    assert.match(footer, /href="https:\/\/github\.com\/rishi555123\/focus-guard">/, rel(page));
    assert.match(footer, /MIT License/, rel(page));
    assert.match(footer, /Security agent icon<\/a> by Any Icon from Flaticon, recolored and resized\./, rel(page));
  }
});

test("the install guide has Chrome and Edge tabs with all the steps", () => {
  const html = read(path.join(SITE, "install.html"));
  for (const browser of ["chrome", "edge"]) {
    const panel = html.match(new RegExp(`<section id="panel-${browser}"[\\s\\S]*?</section>`))[0];
    assert.match(html, new RegExp(`role="tab" id="tab-${browser}" aria-controls="panel-${browser}"`));
    assert.match(panel, new RegExp(`role="tabpanel" aria-labelledby="tab-${browser}"`));
    assert.match(panel, new RegExp(`<code>${browser}://extensions</code>`));
    for (const step of ["Download", "Extract it into a folder you'll keep", "deleting or moving the folder removes the extension", "Turn on Developer mode", "Click Load unpacked", "Select the folder"]) {
      assert.ok(panel.includes(step), `${browser} panel: "${step}"`);
    }
    assert.equal([...panel.matchAll(/<li>/g)].length, 7, `${browser} has 7 numbered steps`);
  }
  assert.match(html, /developer mode extensions\? That's expected/i, "explains the developer mode warning");
  assert.match(html, /<h2 id="updating">/, "has the updating section");
  assert.match(html, /<script src="assets\/tabs\.js"><\/script>/);
});

test("the releases page lists every version and date in CHANGELOG.md", () => {
  const changelog = read(path.join(ROOT, "CHANGELOG.md"));
  const html = read(path.join(SITE, "releases.html"));
  const versions = [...changelog.matchAll(/^## \[(\d+\.\d+\.\d+)\] - (\d{4}-\d{2}-\d{2})$/gm)];
  assert.ok(versions.length > 0);
  for (const [, version, day] of versions) {
    assert.match(html, new RegExp(`<h2 id="h-v${version.replace(/\./g, "\\.")}">Version ${version.replace(/\./g, "\\.")}</h2>`), `missing ${version}`);
    assert.ok(html.includes(`<time datetime="${day}">`), `missing date ${day} for ${version}`);
  }
  assert.ok(html.includes('href="https://github.com/rishi555123/focus-guard/releases"'), "links to all GitHub releases");
  // Every bullet in the changelog appears on the page (ignoring Markdown formatting)
  const plain = (s) => s.replace(/<[^>]+>/g, "").replace(/\*\*|`/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
  const page = plain(html);
  for (const [, bullet] of changelog.matchAll(/^- (.+)$/gm)) assert.ok(page.includes(plain(bullet)), "missing: " + bullet.slice(0, 60));
});

test("the privacy page matches PRIVACY.md", () => {
  const privacy = read(path.join(ROOT, "PRIVACY.md"));
  const html = read(path.join(SITE, "privacy.html"));
  const effective = privacy.match(/\*\*Effective date:\*\* (.+)/)[1];
  assert.ok(html.includes(`<b>Effective date:</b> ${effective}`), "same effective date");
  for (const [, heading] of privacy.matchAll(/^## (.+)$/gm)) assert.ok(html.includes(`<h2>${heading.replace(/'/g, "'")}</h2>`), "missing section: " + heading);
  assert.match(html, /<table>/, "has the storage table");
});

// Light/dark theme toggle

const vm = require("node:vm");
const { palette, ratio, PAIRS } = require("./contrast.js");
const HEAD_SCRIPT = /<script>try\{if\(localStorage\.getItem\("fg-theme"\)==="dark"\)document\.documentElement\.setAttribute\("data-theme","dark"\)\}catch\(e\)\{\}<\/script>/;

test("light is the default; dark only applies with data-theme, never from the system setting", () => {
  const css = read(path.join(SITE, "assets/style.css"));
  assert.doesNotMatch(css, /prefers-color-scheme/, "the system setting mustn't switch the theme");
  assert.match(css, /:root \{[^}]*color-scheme: light;/);
  assert.match(css, /:root\[data-theme="dark"\] \{[^}]*color-scheme: dark;/);
  assert.match(css, /--paper: #EEF2F7/, "uses the extension's paper colour");
  assert.match(css, /--ink: #1D3B6E/, "uses the extension's ink colour");
  assert.match(css, /--marker: #FFE45C/, "uses the extension's marker colour");
});

test("every page applies the saved theme in <head>, before the stylesheet and anything else loads", () => {
  for (const page of PAGES) {
    const html = read(page);
    const head = html.split("</head>")[0];
    const script = head.search(HEAD_SCRIPT);
    assert.ok(script > 0, `${rel(page)} has the theme script in <head>`);
    assert.ok(script < head.search(/<link rel="stylesheet"/), `${rel(page)}: theme script comes before the stylesheet`);
    assert.ok(script < head.search(/<link rel="icon"/), `${rel(page)}: theme script comes first`);
    assert.doesNotMatch(html, /<html[^>]*data-theme/, `${rel(page)}: no theme is hard-coded, so light is the fallback`);
  }
});

// Run the head script the way a browser would, with a given localStorage
function runHeadScript(storage) {
  const code = read(path.join(SITE, "index.html")).match(HEAD_SCRIPT)[0].replace(/^<script>|<\/script>$/g, "");
  const attrs = {};
  const document = { documentElement: { setAttribute: (k, v) => (attrs[k] = v) } };
  vm.runInNewContext(code, { document, localStorage: storage });
  return attrs["data-theme"];
}

test("the head script applies a saved dark theme, and falls back to light otherwise", () => {
  assert.equal(runHeadScript({ getItem: () => "dark" }), "dark");
  assert.equal(runHeadScript({ getItem: () => "light" }), undefined);
  assert.equal(runHeadScript({ getItem: () => null }), undefined, "first-time visitors get light");
  assert.equal(runHeadScript({ getItem: () => "something else" }), undefined);
  assert.equal(runHeadScript({ getItem: () => { throw new Error("SecurityError"); } }), undefined, "blocked storage doesn't break the page");
  assert.equal(runHeadScript(undefined), undefined, "no localStorage at all");
});

test("every page has the same theme toggle in its header, hidden until JavaScript runs", () => {
  for (const page of PAGES) {
    const html = read(page);
    const header = html.match(/<header[\s\S]*?<\/header>/)[0];
    const button = header.match(/<button[^>]*id="theme-toggle"[^>]*>/);
    assert.ok(button, `${rel(page)} has the toggle in its header`);
    assert.match(button[0], /type="button"/);
    assert.match(button[0], /aria-label="Switch to dark mode"/, "labelled for the default light theme");
    assert.match(button[0], /\shidden[\s>]/, "hidden without JavaScript, since it couldn't work");
    assert.match(header, /<svg class="icon-moon"[^>]*aria-hidden="true"/);
    assert.match(header, /<svg class="icon-sun"[^>]*aria-hidden="true"/);
    assert.match(html, /<script src="\/?assets\/theme\.js"><\/script>\s*(<script[^>]*><\/script>\s*)*<\/body>/, `${rel(page)} loads theme.js`);
  }
});

test("the toggle is at least 44 x 44 px and fits the phone header on its own row with the logo", () => {
  const css = read(path.join(SITE, "assets/style.css"));
  const rule = css.match(/\.theme-toggle \{([^}]*)\}/)[1];
  assert.match(rule, /width: 44px/);
  assert.match(rule, /height: 44px/);
  const phone = css.match(/@media \(max-width: 640px\) \{([\s\S]*?)\n\}/)[1];
  assert.match(phone, /grid-template-areas: "brand toggle" "nav nav"/, "phones: logo and toggle, then navigation");
});

// Run theme.js against a tiny fake page
function loadToggle({ saved = null, storageThrows = false, dark = false } = {}) {
  const attrs = dark ? { "data-theme": "dark" } : {};
  const listeners = {};
  const button = {
    hidden: true, title: "", attrs: {},
    setAttribute(k, v) { this.attrs[k] = v; },
    addEventListener: (type, fn) => (listeners["button:" + type] = fn)
  };
  const store = { "fg-theme": saved };
  const localStorage = {
    getItem: (k) => { if (storageThrows) throw new Error("blocked"); return store[k]; },
    setItem: (k, v) => { if (storageThrows) throw new Error("blocked"); store[k] = v; }
  };
  const document = {
    documentElement: {
      getAttribute: (k) => attrs[k] ?? null,
      setAttribute: (k, v) => (attrs[k] = v),
      removeAttribute: (k) => delete attrs[k]
    },
    getElementById: (id) => (id === "theme-toggle" ? button : null)
  };
  const window = { addEventListener: (type, fn) => (listeners["window:" + type] = fn) };
  vm.runInNewContext(read(path.join(SITE, "assets/theme.js")), { document, window, localStorage });
  return {
    theme: () => attrs["data-theme"] || "light",
    label: () => button.attrs["aria-label"],
    click: () => listeners["button:click"](),
    storage: (newValue) => listeners["window:storage"]({ key: "fg-theme", newValue }),
    store, button
  };
}

test("theme.js shows the toggle and labels it for what a press will do", () => {
  const light = loadToggle();
  assert.equal(light.button.hidden, false);
  assert.equal(light.label(), "Switch to dark mode");
  assert.equal(light.button.title, "Switch to dark mode");
  const dark = loadToggle({ dark: true });
  assert.equal(dark.label(), "Switch to light mode");
});

test("pressing the toggle switches the theme, saves it, and updates the label", () => {
  const t = loadToggle();
  t.click();
  assert.equal(t.theme(), "dark");
  assert.equal(t.store["fg-theme"], "dark");
  assert.equal(t.label(), "Switch to light mode");
  t.click();
  assert.equal(t.theme(), "light");
  assert.equal(t.store["fg-theme"], "light");
  assert.equal(t.label(), "Switch to dark mode");
});

test("the toggle still works when localStorage is blocked", () => {
  const t = loadToggle({ storageThrows: true });
  assert.doesNotThrow(() => t.click());
  assert.equal(t.theme(), "dark", "switches for this page even if it can't be saved");
});

test("changing the theme in another tab updates this one", () => {
  const t = loadToggle();
  t.storage("dark");
  assert.equal(t.theme(), "dark");
  assert.equal(t.label(), "Switch to light mode");
  t.storage("light");
  assert.equal(t.theme(), "light");
});

for (const theme of ["light", "dark"]) {
  test(`${theme} theme meets WCAG AA contrast for text and interface parts`, () => {
    const p = palette(theme);
    const failures = PAIRS.map(([what, fg, bg, min]) => [what, p[fg], p[bg], min, ratio(p[fg], p[bg])])
      .filter(([, , , min, r]) => r < min)
      .map(([what, fg, bg, min, r]) => `${what}: ${fg} on ${bg} is ${r.toFixed(2)}:1, needs ${min}:1`);
    assert.deepEqual(failures, []);
  });
}

test("every image and asset in site/ is used by a page, so nothing unused gets deployed", () => {
  const used = new Set();
  for (const file of FILES.filter((f) => /\.(html|css)$/.test(f))) {
    for (const ref of referencesIn(file)) if (!isExternal(ref)) used.add(resolveLocal(file, ref));
  }
  const unused = FILES.filter((f) => !f.endsWith(".html") && !used.has(f) && path.basename(f) !== "favicon.ico")
    .map(rel); // favicon.ico is requested by browsers automatically
  assert.deepEqual(unused, []);
});

test("netlify.toml publishes site/ with no build step", () => {
  const toml = read(path.join(ROOT, "netlify.toml"));
  assert.match(toml, /^\[build\]\s*\n\s*publish = "site"\s*$/m);
  assert.doesNotMatch(toml, /^\s*command\s*=/m, "no build command");
});
