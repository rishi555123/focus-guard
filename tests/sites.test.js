// Tests for src/shared/sites.js, the blocklist input cleaning used by the popup.
// Plain Node 18+, no installs:  node --test
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const context = vm.createContext({ URL });
vm.runInContext(fs.readFileSync(path.join(__dirname, "../src/shared/sites.js"), "utf8"), context);
const cleanSite = vm.runInContext("cleanSite", context);
const parseSites = (text) => structuredClone(vm.runInContext("parseSites", context)(text));

test("plain domains are kept as they are", () => {
  for (const d of ["chatgpt.com", "chat.z.ai", "copilot.cloud.microsoft", "t3.chat", "kimi.moonshot.cn"]) {
    assert.equal(cleanSite(d), d);
  }
});

test("scheme, www, path, query, port and case are cleaned off", () => {
  assert.equal(cleanSite("https://www.ChatGPT.com/c/123?model=x#top"), "chatgpt.com");
  assert.equal(cleanSite("http://claude.ai/new"), "claude.ai");
  assert.equal(cleanSite("  Perplexity.AI  "), "perplexity.ai");
  assert.equal(cleanSite("example.com:8080"), "example.com");
  assert.equal(cleanSite("www.poe.com/"), "poe.com");
});

test("a leading *. wildcard is dropped, since subdomains are covered anyway", () => {
  assert.equal(cleanSite("*.openai.com"), "openai.com");
});

test("international domains are stored in their ASCII form", () => {
  assert.equal(cleanSite("bücher.de"), "xn--bcher-kva.de");
});

test("things that aren't domains are rejected", () => {
  for (const bad of ["chat gpt.com", "localhost", "chatgpt", "foo..com", "-foo.com",
                     "foo.c", "127.0.0.1", "foo.*", "*", "https://", "mailto:x@y.com",
                     "me@chatgpt.com", "https://user@chatgpt.com/", "ftp://chatgpt.com"]) {
    assert.equal(cleanSite(bad), null, bad);
  }
});

test("parseSites skips blank lines, removes duplicates and lists bad lines", () => {
  const res = parseSites("chatgpt.com\n\nhttps://www.chatgpt.com/\nclaude.ai\nnot a site\n  \nlocalhost");
  assert.deepEqual(res.sites, ["chatgpt.com", "claude.ai"]);
  assert.deepEqual(res.invalid, ["not a site", "localhost"]);
});

test("parseSites accepts Windows line endings", () => {
  assert.deepEqual(parseSites("chatgpt.com\r\nclaude.ai\r\n").sites, ["chatgpt.com", "claude.ai"]);
});
