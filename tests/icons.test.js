// Tests for the toolbar icons (icons/icon16.png, icon32.png, icon48.png): they must stand out
// on light and dark browser toolbars. Plain Node 22+, no installs:  node --test
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { readPng } = require("./png.js");
const { ratio } = require("./contrast.js");

const ROOT = path.join(__dirname, "..");
const LIGHT_TOOLBAR = [0xF1, 0xF3, 0xF4]; // Chrome's light toolbar
const DARK_TOOLBARS = [[0x20, 0x21, 0x24], [0x35, 0x36, 0x3A]]; // Chrome's dark toolbar and a dark theme
const hex = (rgb) => "#" + rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
const over = ([r, g, b, a], bg) => [r, g, b].map((v, i) => (v * a + bg[i] * (255 - a)) / 255);

// The icon's outer edge: visible pixels next to a see-through one (or the image border)
function edgePixels({ width, height, pixels }) {
  const solid = (x, y) => x >= 0 && y >= 0 && x < width && y < height && pixels[y][x][3] >= 128;
  const edge = [];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (solid(x, y) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !solid(x + dx, y + dy))) edge.push(pixels[y][x]);
  }
  return edge;
}

for (const px of [16, 32, 48]) {
  const icon = readPng(path.join(ROOT, `icons/icon${px}.png`));

  test(`icon${px}.png is ${px} x ${px} with a transparent background`, () => {
    assert.deepEqual([icon.width, icon.height], [px, px]);
    const clear = icon.pixels.flat().filter((p) => p[3] === 0).length;
    assert.ok(clear / (px * px) >= 0.1, `${clear} of ${px * px} pixels are see-through`);
  });

  for (const toolbar of DARK_TOOLBARS) {
    test(`icon${px}.png has a light outline that stands out on a dark toolbar (${hex(toolbar)})`, () => {
      const edge = edgePixels(icon);
      assert.ok(edge.length > px, "found the outline");
      const visible = edge.filter((p) => ratio(hex(over(p, toolbar)), hex(toolbar)) >= 3).length;
      assert.ok(visible / edge.length >= 0.9, `${visible} of ${edge.length} edge pixels reach 3:1`);
    });
  }

  test(`icon${px}.png still shows its navy on a light toolbar`, () => {
    const opaque = icon.pixels.flat().filter((p) => p[3] >= 200);
    const strong = opaque.filter((p) => ratio(hex(over(p, LIGHT_TOOLBAR)), hex(LIGHT_TOOLBAR)) >= 3).length;
    assert.ok(strong / opaque.length >= 0.25, `${strong} of ${opaque.length} pixels reach 3:1`);
  });
}

test("the PNG reader finds the logo's navy and yellow in icon128.png", () => {
  const icon = readPng(path.join(ROOT, "icons/icon128.png"));
  assert.deepEqual([icon.width, icon.height], [128, 128]);
  const solid = icon.pixels.flat().filter((p) => p[3] === 255);
  assert.ok(solid.some(([r, g, b]) => r === 0x05 && g === 0x2B && b === 0x5C), "navy #052B5C");
  assert.ok(solid.some(([r, g, b]) => r >= 250 && g >= 185 && g <= 200 && b <= 10), "yellow, around #FFC004");
  assert.equal(icon.pixels[0][0][3], 0, "transparent padding");
});
