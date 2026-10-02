// Tests for src/blocked/links.js, which reads the block page's address.
// Plain Node 18+, no installs:  node --test
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const context = vm.createContext({ URLSearchParams });
vm.runInContext(fs.readFileSync(path.join(__dirname, "../src/blocked/links.js"), "utf8"), context);
const readBlockLink = (search) => structuredClone(vm.runInContext("readBlockLink", context)(search));
const backSteps = vm.runInContext("backSteps", context);

test("redirect links keep the address exactly as Chrome pasted it", () => {
  const link = readBlockLink("?u=https://chatgpt.com/c/1?q=a%26b&x=1");
  assert.equal(link.url, "https://chatgpt.com/c/1?q=a%26b&x=1", "%26 must stay %26");
  assert.equal(link.fromTab, false);
  assert.equal(link.sweep, false);
});

test("tab links are decoded back to the original address", () => {
  const url = "https://chatgpt.com/c/1?q=a%26b&x=1 2+3";
  const link = readBlockLink("?t=" + encodeURIComponent(url));
  assert.equal(link.url, url);
  assert.equal(link.fromTab, true);
  assert.equal(link.sweep, false);
});

test("sweep links are marked so they aren't counted as visits", () => {
  const link = readBlockLink("?sweep=1&t=" + encodeURIComponent("https://claude.ai/new"));
  assert.equal(link.url, "https://claude.ai/new");
  assert.equal(link.sweep, true);
});

test("encoded ?u= links from older versions are still understood", () => {
  assert.equal(readBlockLink("?u=" + encodeURIComponent("https://claude.ai/new")).url, "https://claude.ai/new");
});

test("a block page opened with no address has an empty target", () => {
  assert.equal(readBlockLink("").url, "");
  assert.equal(readBlockLink("?other=1").url, "");
});

test("Back goes 1 step after a redirect and 2 after a tab move", () => {
  assert.equal(backSteps({ fromTab: false }, 2), 1);
  assert.equal(backSteps({ fromTab: true }, 3), 2);
});

test("Back reports 0 when there's nothing to go back to", () => {
  assert.equal(backSteps({ fromTab: false }, 1), 0);
  assert.equal(backSteps({ fromTab: true }, 2), 0, "going back 1 would land on the AI page");
});
