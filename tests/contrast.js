// WCAG contrast helpers and the colour pairs the website and the extension use,
// shared by the site and extension style tests.
const fs = require("node:fs");
const path = require("node:path");

const CSS = fs.readFileSync(path.join(__dirname, "../site/assets/style.css"), "utf8");
const EXTENSION_CSS = fs.readFileSync(path.join(__dirname, "../src/shared/style.css"), "utf8");

// Colour variables for one theme: the light :root block, with the dark block on top.
// Reads the website's stylesheet unless another one is given.
function palette(theme, css = CSS) {
  const block = (selector) => {
    const m = css.match(new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\{([^}]*)\\}"));
    return Object.fromEntries([...(m ? m[1] : "").matchAll(/--([\w-]+):\s*(#[0-9A-Fa-f]{6}|var\(--[\w-]+\))/g)].map((x) => [x[1], x[2]]));
  };
  const vars = { ...block(":root"), ...(theme === "dark" ? block(':root[data-theme="dark"]') : {}) };
  const resolve = (v) => (v && v.startsWith("var(") ? resolve(vars[v.slice(6, -1)]) : v);
  return Object.fromEntries(Object.keys(vars).map((k) => [k, resolve(vars[k])]));
}

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

// [what, foreground variable, background variable, minimum ratio]
// 4.5:1 for text, 3:1 for interface parts like borders and focus rings (WCAG 1.4.3 and 1.4.11)
const PAIRS = [
  ["body text on paper", "ink", "paper", 4.5],
  ["body text on cards, tabs and code", "ink", "card", 4.5],
  ["muted text on paper", "pencil", "paper", 4.5],
  ["muted text on cards", "pencil", "card", 4.5],
  ["Download button text", "on-ink", "ink", 4.5],
  ["step number in its circle", "on-ink", "ink", 4.5],
  ["highlighted text on the marker", "mark-text", "marker", 4.5],
  ["focus ring against paper", "focus", "paper", 3],
  ["focus ring against cards", "focus", "card", 3],
  ["toggle, tab and card borders against paper", "ink", "paper", 3],
  ["toggle icon on its button", "ink", "card", 3],
  ["warning stripe against its note", "redpen", "card", 3]
];

// The same, for the popup, the setup checklist and the block page (src/shared/style.css)
const EXTENSION_PAIRS = [
  ["body text on paper", "ink", "paper", 4.5],
  ["text on sheets, stats, notes and text boxes", "ink", "card", 4.5],
  ["muted text on paper", "pencil", "paper", 4.5],
  ["muted text on sheets", "pencil", "card", 4.5],
  ["button text and the Done badge", "on-ink", "ink", 4.5],
  ["highlighted heading text on the marker", "mark-text", "marker", 4.5],
  ["blocked address and popup errors on paper", "redpen", "paper", 4.5],
  ["unlock errors and warnings on sheets", "redpen", "card", 4.5],
  ["focus ring against paper", "focus", "paper", 3],
  ["focus ring against sheets", "focus", "card", 3],
  ["button and sheet borders against paper", "ink", "paper", 3],
  ["unpicked duration button border on its fill", "ink", "card", 3],
  ["weekly chart bars and today's bar outline on the sheet", "ink", "card", 3],
  ["weekly chart day labels and the streak rule on the sheet", "pencil", "card", 4.5],
  ["minutes above the chart bars, the week and the arrows on the sheet", "ink", "card", 4.5]
];

module.exports = { palette, ratio, PAIRS, CSS, EXTENSION_PAIRS, EXTENSION_CSS };

// Run directly to print a table:  node tests/contrast.js
if (require.main === module) {
  for (const [name, css, pairs] of [["website", CSS, PAIRS], ["extension", EXTENSION_CSS, EXTENSION_PAIRS]]) {
    for (const theme of ["light", "dark"]) {
      const p = palette(theme, css);
      console.log(`\n${name.toUpperCase()}, ${theme.toUpperCase()}`);
      for (const [what, fg, bg, min] of pairs) {
        const r = ratio(p[fg], p[bg]);
        console.log(`${r >= min ? "OK  " : "FAIL"} ${r.toFixed(2).padStart(5)}:1 (needs ${min}:1)  ${what}  ${p[fg]} on ${p[bg]}`);
      }
    }
  }
}
