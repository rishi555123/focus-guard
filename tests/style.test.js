// Tests for the extension's shared colours (src/shared/style.css).
// Plain Node 22+, no installs:  node --test
const test = require("node:test");
const assert = require("node:assert/strict");
const { palette, ratio, EXTENSION_PAIRS, EXTENSION_CSS } = require("./contrast.js");

for (const theme of ["light", "dark"]) {
  test(`extension ${theme} theme meets WCAG AA contrast for text and interface parts`, () => {
    const p = palette(theme, EXTENSION_CSS);
    for (const [what, fg, bg] of EXTENSION_PAIRS) {
      assert.match(p[fg] || "", /^#[0-9A-Fa-f]{6}$/, `${what}: --${fg} isn't set`);
      assert.match(p[bg] || "", /^#[0-9A-Fa-f]{6}$/, `${what}: --${bg} isn't set`);
    }
    const failures = EXTENSION_PAIRS.map(([what, fg, bg, min]) => [what, p[fg], p[bg], min, ratio(p[fg], p[bg])])
      .filter(([, , , min, r]) => r < min)
      .map(([what, fg, bg, min, r]) => `${what}: ${fg} on ${bg} is ${r.toFixed(2)}:1, needs ${min}:1`);
    assert.deepEqual(failures, []);
  });
}

test("the extension pages only use colour variables that style.css defines", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const defined = new Set(Object.keys(palette("light", EXTENSION_CSS)));
  for (const page of ["src/shared/style.css", "src/popup/popup.html", "src/welcome/welcome.html", "src/blocked/blocked.html"]) {
    const text = fs.readFileSync(path.join(__dirname, "..", page), "utf8");
    for (const [, name] of text.matchAll(/var\(--([\w-]+)\)/g)) {
      if (name === "font" || name === "code") continue; // fonts, not colours
      assert.ok(defined.has(name), `${page} uses --${name}, which isn't defined`);
    }
  }
});

test("every logo on an extension page has a dark-mode copy, and style.css swaps them", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  assert.match(EXTENSION_CSS, /\[data-theme="dark"\] \.logo-light, :root:not\(\[data-theme="dark"\]\) \.logo-dark \{ display: none; \}/);
  for (const page of ["src/popup/popup.html", "src/welcome/welcome.html", "src/blocked/blocked.html"]) {
    const html = fs.readFileSync(path.join(__dirname, "..", page), "utf8");
    const logos = [...html.matchAll(/<img\b[^>]*>/g)].map(([tag]) => tag).filter((tag) => /logo-256/.test(tag));
    assert.ok(logos.length > 0, `${page} shows the logo`);
    const light = logos.filter((tag) => /class="[^"]*\blogo-light\b[^"]*" src="\.\.\/\.\.\/icons\/logo-256\.png"/.test(tag));
    const dark = logos.filter((tag) => /class="[^"]*\blogo-dark\b[^"]*" src="\.\.\/\.\.\/icons\/logo-256-dark\.png"/.test(tag));
    assert.equal(light.length + dark.length, logos.length, `${page}: every logo is marked light or dark`);
    assert.equal(light.length, dark.length, `${page}: each light logo has a dark copy`);
  }
});
