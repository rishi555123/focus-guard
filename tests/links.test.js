// Tests for src/blocked/links.js, which reads the block page's address.
// Plain Node 22+, no installs:  node --test
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const context = vm.createContext({ URL, URLSearchParams });
vm.runInContext(fs.readFileSync(path.join(__dirname, "../src/blocked/links.js"), "utf8"), context);
const readBlockLink = (search) => structuredClone(vm.runInContext("readBlockLink", context)(search));
const backSteps = vm.runInContext("backSteps", context);
const sweepNote = vm.runInContext("sweepNote", context);
const otherPass = vm.runInContext("otherPass", context);

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

test("links say why a tab was re-blocked", () => {
  const moved = readBlockLink("?sweep=1&why=moved&to=chatgpt.com&t=" + encodeURIComponent("https://claude.ai/"));
  assert.deepEqual([moved.why, moved.to, moved.url], ["moved", "chatgpt.com", "https://claude.ai/"]);
  assert.deepEqual([readBlockLink("?u=https://claude.ai/").why, readBlockLink("?u=https://claude.ai/").to], ["", ""]);
});

test("the re-block note explains a moved or ended pass, and is empty otherwise", () => {
  assert.match(sweepNote({ why: "moved", to: "chatgpt.com" }), /moved to chatgpt\.com.*one pass at a time/);
  assert.match(sweepNote({ why: "ended", to: "" }), /pass for this site has ended/);
  assert.equal(sweepNote({ why: "", to: "" }), "");
  assert.equal(sweepNote({ why: "moved", to: "" }), "", "no site, no note");
  assert.equal(sweepNote({ why: "something-else", to: "x" }), "");
});

test("the pass warning names a pass for a different site", () => {
  const now = 1000;
  const pass = { domain: "claude.ai", domains: ["claude.ai"], until: now + 60000 };
  assert.equal(otherPass(pass, "https://chatgpt.com/c/1", now), "claude.ai");
});

test("no pass warning when there's no pass, it has ended, or it covers this site", () => {
  const now = 1000;
  const pass = { domain: "chatgpt.com", domains: ["chatgpt.com", "chat.openai.com"], until: now + 60000 };
  assert.equal(otherPass(undefined, "https://chatgpt.com/", now), "");
  assert.equal(otherPass({ ...pass, until: now - 1 }, "https://claude.ai/", now), "");
  assert.equal(otherPass(pass, "https://www.chatgpt.com/", now), "");
  assert.equal(otherPass(pass, "https://chat.openai.com/", now), "", "aliases count as the same site");
});

test("the pass warning works with passes saved before aliases existed", () => {
  const now = 1000;
  const old = { domain: "claude.ai", until: now + 60000 };
  assert.equal(otherPass(old, "https://claude.ai/new", now), "");
  assert.equal(otherPass(old, "https://chatgpt.com/", now), "claude.ai");
});

test("Back reports 0 when there's nothing to go back to", () => {
  assert.equal(backSteps({ fromTab: false }, 1), 0);
  assert.equal(backSteps({ fromTab: true }, 2), 0, "going back 1 would land on the AI page");
});
