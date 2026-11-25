// Tests for src/shared/sites.js: cleaning blocklist input, and matching addresses
// against entries that are whole sites or parts of them.
// Plain Node 22+, no installs:  node --test
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const context = vm.createContext({ URL });
vm.runInContext(fs.readFileSync(path.join(__dirname, "../src/shared/sites.js"), "utf8"), context);
const cleanSite = vm.runInContext("cleanSite", context);
const parseSites = (text) => structuredClone(vm.runInContext("parseSites", context)(text));
const get = (name) => vm.runInContext(name, context);
const entryMatches = get("entryMatches"), entryRegex = get("entryRegex"), entryCovers = get("entryCovers");

test("plain domains are kept as they are", () => {
  for (const d of ["chatgpt.com", "chat.z.ai", "copilot.cloud.microsoft", "t3.chat", "kimi.moonshot.cn"]) {
    assert.equal(cleanSite(d), d);
  }
});

test("scheme, www, port, #fragment and case are cleaned off", () => {
  assert.equal(cleanSite("https://www.ChatGPT.com/#top"), "chatgpt.com");
  assert.equal(cleanSite("  Perplexity.AI  "), "perplexity.ai");
  assert.equal(cleanSite("example.com:8080"), "example.com");
  assert.equal(cleanSite("www.poe.com/"), "poe.com");
  assert.equal(cleanSite("HTTPS://Claude.AI"), "claude.ai");
});

test("a path is kept, so an entry can block just part of a site", () => {
  assert.equal(cleanSite("https://github.com/copilot"), "github.com/copilot");
  assert.equal(cleanSite("github.com/Copilot/"), "github.com/copilot", "lower case, no trailing slash");
  assert.equal(cleanSite("https://x.com/i/grok?utm=1#x"), "x.com/i/grok?utm=1");
  assert.equal(cleanSite("http://claude.ai/new"), "claude.ai/new");
  assert.equal(cleanSite("https://a.com/%E2%9C%93"), "a.com/%e2%9c%93");
});

test("one key=value query part is kept with a path; on a whole site it's dropped", () => {
  assert.equal(cleanSite("google.com/search?udm=50"), "google.com/search?udm=50");
  assert.equal(cleanSite("https://www.google.com/search?udm=50#x"), "google.com/search?udm=50");
  assert.equal(cleanSite("chatgpt.com/?model=gpt-4o"), "chatgpt.com", "a query on the whole site would block less than meant");
});

test("addresses an entry can't express are rejected, not widened", () => {
  assert.equal(cleanSite("https://www.google.com/search?q=hi&udm=50"), null, "two query parts");
  assert.equal(cleanSite("google.com/search?udm"), null, "no value");
  assert.equal(cleanSite("google.com/search?q=a b"), null);
  assert.equal(cleanSite("site.com/a'b"), null);
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

test("parseSites leaves out entries another entry already covers, and says which", () => {
  const res = parseSites(["github.com/copilot", "github.com", "claude.ai/new", "claude.ai",
    "google.com/search?udm=50", "google.com/search"].join("\n"));
  assert.deepEqual(res.sites, ["github.com", "claude.ai", "google.com/search"]);
  assert.deepEqual(res.covered, [
    ["github.com/copilot", "github.com"],
    ["claude.ai/new", "claude.ai"],
    ["google.com/search?udm=50", "google.com/search"]
  ]);
});

test("parseSites accepts Windows line endings", () => {
  assert.deepEqual(parseSites("chatgpt.com\r\nclaude.ai\r\n").sites, ["chatgpt.com", "claude.ai"]);
});

// Matching addresses against entries

// The rules ignore case (isUrlFilterCaseSensitive: false), hence the "i"
const matches = (entry, urls) => urls.map((u) => [u, entryMatches(u, entry), new RegExp(entryRegex(entry), "i").test(u)]);

test("a whole-site entry matches the site and its subdomains, like before 1.1", () => {
  assert.equal(entryRegex("claude.ai"), String.raw`^https?://([^/]*\.)?claude\.ai(/.*)?$`, "the same rule as 1.0");
  for (const [url, match, rule] of matches("claude.ai", ["https://claude.ai/", "https://claude.ai/new?x=1", "http://www.claude.ai/a", "https://api.claude.ai/"])) {
    assert.ok(match && rule, url);
  }
  for (const [url, match, rule] of matches("claude.ai", ["https://notclaude.ai/", "https://claude.ai.evil.com/", "https://example.com/claude.ai"])) {
    assert.ok(!match && !rule, url);
  }
});

test("a path entry matches that path and the pages under it, and nothing else", () => {
  const yes = ["https://github.com/copilot", "https://github.com/copilot/", "https://github.com/copilot/c/123",
    "https://github.com/copilot?ref=x", "https://www.github.com/Copilot", "https://github.com/copilot#top"];
  const no = ["https://github.com/", "https://github.com/copilotx", "https://github.com/rishi/copilot",
    "https://github.com/features/copilot", "https://gist.github.com/x"];
  for (const [url, match, rule] of matches("github.com/copilot", yes)) assert.ok(match && rule, url);
  for (const [url, match, rule] of matches("github.com/copilot", no)) assert.ok(!match && !rule, url);
  for (const [url, match, rule] of matches("x.com/i/grok", ["https://x.com/i/grok", "https://x.com/i/grok?conversation=1"])) assert.ok(match && rule, url);
  for (const [url, match, rule] of matches("x.com/i/grok", ["https://x.com/i/bookmarks", "https://x.com/grok"])) assert.ok(!match && !rule, url);
});

test("a query entry needs its key=value anywhere in the query", () => {
  const yes = ["https://www.google.com/search?udm=50", "https://www.google.com/search?q=hello&udm=50",
    "https://www.google.com/search?udm=50&q=hello", "https://google.com/search?q=a&udm=50&b=c#x"];
  const no = ["https://www.google.com/search?q=hello", "https://www.google.com/search?udm=500",
    "https://www.google.com/search?xudm=50", "https://www.google.com/searchx?udm=50", "https://www.google.com/?udm=50",
    "https://www.google.com/search?q=udm=50x"];
  for (const [url, match, rule] of matches("google.com/search?udm=50", yes)) assert.ok(match && rule, url);
  for (const [url, match, rule] of matches("google.com/search?udm=50", no)) assert.ok(!match && !rule, url);
});

test("addresses that can't be read match nothing", () => {
  for (const bad of ["", undefined, "not a url", "chrome://newtab/"]) assert.equal(entryMatches(bad, "claude.ai"), false, String(bad));
});

test("entryCovers knows when one entry already blocks everything another does", () => {
  assert.equal(entryCovers("github.com", "github.com/copilot"), true);
  assert.equal(entryCovers("github.com", "gist.github.com/x"), true);
  assert.equal(entryCovers("github.com/copilot", "github.com/copilot/chat"), true);
  assert.equal(entryCovers("google.com/search", "google.com/search?udm=50"), true);
  assert.equal(entryCovers("github.com/copilot", "github.com"), false);
  assert.equal(entryCovers("github.com/copilot", "github.com/copilotx"), false);
  assert.equal(entryCovers("google.com/search?udm=50", "google.com/search"), false);
  assert.equal(entryCovers("claude.ai", "claude.ai"), false, "an entry doesn't cover itself");
});
