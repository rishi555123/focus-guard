// Tests for src/background/background.js. Runs the real file against a fake
// chrome API (in-memory storage, rules, alarms and tabs). Plain Node 22+, no installs:
//   node --test
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const SOURCE = fs.readFileSync(path.join(__dirname, "../src/background/background.js"), "utf8");
const CONSTANTS = fs.readFileSync(path.join(__dirname, "../src/shared/constants.js"), "utf8");
// What background.js may importScripts, by path from src/background/
const IMPORTABLE = Object.fromEntries(["src/shared/reason.js", "src/shared/sites.js", "src/shared/streaks.js"]
  .map((f) => [f, fs.readFileSync(path.join(__dirname, "..", f), "utf8")]));

// Read block page links the same way the block page does (src/blocked/links.js)
const linksContext = vm.createContext({ URL, URLSearchParams });
vm.runInContext(CONSTANTS, linksContext);
vm.runInContext(fs.readFileSync(path.join(__dirname, "../src/blocked/links.js"), "utf8"), linksContext);
const BLOCK_PAGE = "chrome-extension://ID/src/blocked/blocked.html";
function linkOf(url) {
  assert.ok(url.startsWith(BLOCK_PAGE + "?"), url);
  return structuredClone(vm.runInContext("readBlockLink", linksContext)(url.slice(BLOCK_PAGE.length)));
}
// The block page's three answers (see src/shared/reason.js)
const ANSWERS = {
  tried: "I read the error and logged the values before the loop",
  expected: "The function should return the sorted list of names",
  got: "It returns undefined and the console shows a TypeError"
};

// Like Chrome, only show a tab's url and pendingUrl if the real manifest grants the
// "tabs" permission or a matching host permission. Chrome's docs: Tab.url "is only
// present if the extension has the "tabs" permission or has host permissions for the page".
const MANIFEST = JSON.parse(fs.readFileSync(path.join(__dirname, "../manifest.json"), "utf8"));
const ALL_URLS_SCHEMES = /^(https?|wss?|ftp|file|data|urn):/; // what <all_urls> matches
function canSeeUrl(url) {
  if (!url) return false;
  if ((MANIFEST.permissions || []).includes("tabs")) return true;
  return (MANIFEST.host_permissions || []).some((p) => p === "<all_urls>" && ALL_URLS_SCHEMES.test(url));
}
function scrubTab(tab) {
  const seen = { ...tab };
  if (!canSeeUrl(tab.url)) { delete seen.url; delete seen.title; delete seen.favIconUrl; }
  if (!canSeeUrl(tab.pendingUrl)) delete seen.pendingUrl;
  return seen;
}

// Load a fresh copy of background.js with its own fake chrome.
// `saved` is what chrome.storage.local already holds before install/update runs.
// `constants` replaces src/shared/constants.js, to check nothing has its numbers built in.
// With nothing saved it's a first install; with saved data it's an update.
async function load(saved = {}, reason = Object.keys(saved).length ? "update" : "install", constants = CONSTANTS) {
  const listeners = {};
  const ev = (name) => ({ addListener: (fn) => (listeners[name] = fn) });
  const env = {
    store: structuredClone(saved), rules: [], alarms: {}, tabs: [], updates: [], errors: [],
    notifications: [], cleared: [], created: [], uninstallUrls: [], failNotifications: false,
    failRemove: false
  };

  const chrome = {
    runtime: {
      getURL: (p) => "chrome-extension://ID/" + p,
      setUninstallURL: (url) => { env.uninstallUrls.push(url); return Promise.resolve(); },
      onInstalled: ev("installed"), onStartup: ev("startup"), onMessage: ev("message")
    },
    storage: { local: {
      get: async (keys) => {
        const out = {};
        for (const k of [].concat(keys)) if (k in env.store) out[k] = structuredClone(env.store[k]);
        return out;
      },
      set: async (o) => { Object.assign(env.store, structuredClone(o)); },
      remove: async (keys) => {
        if (env.failRemove) throw new Error("Storage is unavailable");
        for (const k of [].concat(keys)) delete env.store[k];
      }
    } },
    declarativeNetRequest: {
      getDynamicRules: async () => env.rules,
      updateDynamicRules: async ({ removeRuleIds, addRules }) => {
        await new Promise((r) => setTimeout(r, 0)); // like Chrome, applied a moment later
        const rules = env.rules.filter((r) => !removeRuleIds.includes(r.id)).concat(addRules);
        const ids = rules.map((r) => r.id);
        if (new Set(ids).size !== ids.length) throw new Error("duplicate rule id");
        env.rules = rules;
      }
    },
    alarms: {
      create: (name, o) => { env.alarms[name] = o; },
      get: async (name) => env.alarms[name],
      clearAll: async () => { env.alarms = {}; },
      onAlarm: ev("alarm")
    },
    tabs: {
      query: async () => env.tabs.map(scrubTab), // addresses hidden unless the manifest allows them
      update: (id, o) => { env.updates.push({ id, url: o.url }); return Promise.resolve(); },
      create: (o) => { env.created.push(o.url); return Promise.resolve({ id: 100 + env.created.length }); },
      onUpdated: ev("tabUpdated")
    },
    action: { setBadgeText() {}, setBadgeBackgroundColor() {} },
    notifications: {
      create: (id, options) => {
        if (env.failNotifications) return Promise.reject(new Error("Notifications are blocked"));
        env.notifications.push({ id, ...options });
        return Promise.resolve(id);
      },
      clear: (id) => { env.cleared.push(id); return Promise.resolve(true); }
    }
  };
  const quietConsole = { ...console, error: (...a) => env.errors.push(a.join(" ")) };
  // importScripts like a service worker's: paths are relative to src/background/
  const importScripts = (...files) => {
    for (const file of files) {
      const where = path.posix.join("src/background", file);
      if (where === "src/shared/constants.js") vm.runInContext(constants, context);
      else if (IMPORTABLE[where]) vm.runInContext(IMPORTABLE[where], context);
      else assert.fail("unexpected importScripts: " + where);
    }
  };
  const context = vm.createContext({ chrome, console: quietConsole, structuredClone, URL, URLSearchParams, importScripts });
  vm.runInContext(SOURCE, context);
  env.get = (name) => structuredClone(vm.runInContext(name, context)); // read a top-level const

  env.send = (msg) => new Promise((resolve) => listeners.message(msg, {}, resolve));
  env.fire = listeners;
  // Chrome leaves changeInfo.url out unless the extension may see that address
  const tabUpdated = listeners.tabUpdated;
  listeners.tabUpdated = (tabId, change, tab = {}) => {
    const seen = { ...change };
    if (!canSeeUrl(change.url)) delete seen.url;
    return tabUpdated(tabId, seen, scrubTab({ ...tab, url: change.url || tab.url }));
  };
  env.redirects = () => env.rules.filter((r) => r.action.type === "redirect");
  env.allows = () => env.rules.filter((r) => r.action.type === "allow");
  env.updatedTabs = () => env.updates.map((u) => u.id);
  if (reason) await listeners.installed({ reason });
  return env;
}

async function inSession() {
  const env = await load();
  await env.send({ type: "start", minutes: 25 });
  return env;
}

// Without the "tabs" permission, Focus Guard relies on <all_urls> to see tab addresses

test("the fake Chrome hides tab addresses the manifest doesn't allow", () => {
  assert.equal((MANIFEST.permissions || []).includes("tabs"), false, "these tests run without the tabs permission");
  assert.equal(canSeeUrl("https://chatgpt.com/"), true, "<all_urls> covers web pages");
  assert.equal(canSeeUrl("http://claude.ai/"), true);
  assert.equal(canSeeUrl("chrome://settings/"), false, "browser pages are hidden");
  assert.equal(canSeeUrl("edge://newtab/"), false);
  assert.equal(scrubTab({ id: 1, url: "edge://newtab/", title: "New tab" }).url, undefined);
});

test("already-open AI tabs are found and blocked using only host permissions", async () => {
  const env = await load();
  env.tabs = [
    { id: 1, url: "https://chatgpt.com/c/1" },
    { id: 2, url: "https://example.com/", pendingUrl: "https://claude.ai/new" },
    { id: 3, url: "edge://newtab/" },
    { id: 4, url: "chrome://settings/" }
  ];
  await env.send({ type: "start", minutes: 25 });
  assert.deepEqual(env.updatedTabs(), [1, 2], "web tabs found; browser pages skipped without errors");
});

test("the backup listener still sees navigations to AI sites using only host permissions", async () => {
  const env = await inSession();
  await env.fire.tabUpdated(5, { url: "https://chatgpt.com/" });
  await env.fire.tabUpdated(6, { url: "edge://settings/" });
  await env.fire.tabUpdated(7, { status: "complete" });
  assert.deepEqual(env.updatedTabs(), [5]);
});

test("starting a session adds one redirect rule per site", async () => {
  const env = await inSession();
  assert.equal(env.redirects().length, env.store.sites.length);
  assert.equal(env.allows().length, 0);
  assert.ok(env.alarms.sessionEnd && env.alarms.tick);
});

test("a blocked visit during a session is counted", async () => {
  const env = await inSession();
  const res = await env.send({ type: "blocked", url: "https://chatgpt.com/c/1" });
  assert.equal(res.blocked, true);
  assert.equal(res.reopen, false);
  assert.equal(env.store.stats.blocked, 1);
});

test("a pass unlocks only that site", async () => {
  const env = await inSession();
  env.tabs = [{ id: 1, url: "https://chatgpt.com/c/1" }, { id: 2, url: "https://claude.ai/new" }];
  const res = await env.send({ type: "unlock", answers: ANSWERS, url: "https://chatgpt.com/c/1" });

  assert.equal(res.granted, true);
  assert.equal(res.domain, "chatgpt.com");
  assert.equal(env.redirects().length, env.store.sites.length, "every site keeps its redirect rule");
  assert.ok(env.allows().every((r) => r.priority === 2));
  assert.deepEqual(env.updatedTabs(), [2], "claude.ai tab is blocked, chatgpt.com tab is left alone");
  assert.equal(env.store.stats.unlocks, 1);
  assert.equal(env.store.stats.log[0].domain, "chatgpt.com");
  assert.ok(env.alarms.passEnd);
});

test("the backup tab listener respects the pass", async () => {
  const env = await inSession();
  await env.send({ type: "unlock", answers: ANSWERS, url: "https://chatgpt.com/" });
  env.updates = [];
  await env.fire.tabUpdated(5, { url: "https://www.chatgpt.com/" });
  await env.fire.tabUpdated(6, { url: "https://claude.ai/" });
  assert.deepEqual(env.updatedTabs(), [6]);
});

test("a leftover block page for a passed site reopens it without counting", async () => {
  const env = await inSession();
  await env.send({ type: "unlock", answers: ANSWERS, url: "https://chatgpt.com/" });
  const res = await env.send({ type: "blocked", url: "https://chatgpt.com/" });
  assert.equal(res.blocked, false);
  assert.equal(res.reopen, true);
  assert.equal(env.store.stats.blocked, 0);
});

test("a second pass replaces the first and re-blocks its tabs", async () => {
  const env = await inSession();
  await env.send({ type: "unlock", answers: ANSWERS, url: "https://chatgpt.com/" });
  env.tabs = [{ id: 1, url: "https://chatgpt.com/" }, { id: 3, url: "https://gemini.google.com/app" }];
  env.updates = [];
  const res = await env.send({ type: "unlock", answers: ANSWERS, url: "https://gemini.google.com/app" });
  assert.equal(res.domain, "gemini.google.com");
  assert.deepEqual(env.updatedTabs(), [1]);
});

test("unlocking a site that isn't on the blocklist is refused", async () => {
  const env = await inSession();
  const res = await env.send({ type: "unlock", answers: ANSWERS, url: "https://example.com/" });
  assert.equal(res.ok, false);
  assert.match(res.error, /Not a blocked site/);
  assert.equal(env.store.pass, undefined);
});

test("when a pass ends, its site is blocked again", async () => {
  const env = await inSession();
  await env.send({ type: "unlock", answers: ANSWERS, url: "https://gemini.google.com/app" });
  env.tabs = [{ id: 3, url: "https://gemini.google.com/app" }];
  env.updates = [];
  await env.fire.alarm({ name: "passEnd" });
  assert.equal(env.store.pass, undefined);
  assert.equal(env.allows().length, 0);
  assert.deepEqual(env.updatedTabs(), [3]);
});

test("outside a session the block page counts nothing and grants nothing", async () => {
  const env = await inSession();
  await env.send({ type: "stop" });
  assert.equal(env.rules.length, 0);
  const before = structuredClone(env.store.stats);

  let res = await env.send({ type: "blocked", url: "https://chatgpt.com/" });
  assert.equal(res.blocked, false);
  assert.equal(res.reopen, true);
  res = await env.send({ type: "unlock", answers: ANSWERS, url: "https://chatgpt.com/" });
  assert.equal(res.granted, false);
  assert.equal(res.reopen, true);

  assert.deepEqual(env.store.stats, before);
  assert.equal(env.store.pass, undefined);
  assert.equal(env.alarms.passEnd, undefined);
});

test("addresses that aren't on the blocklist are never reopened", async () => {
  const env = await load();
  const res = await env.send({ type: "blocked", url: "https://evil.example/" });
  assert.equal(res.reopen, false);
});

test("overlapping entries: the pass uses the most specific one", async () => {
  const env = await load();
  env.store.sites = ["google.com", "gemini.google.com"];
  await env.send({ type: "start", minutes: 25 });
  const res = await env.send({ type: "unlock", answers: ANSWERS, url: "https://gemini.google.com/app" });
  assert.equal(res.domain, "gemini.google.com");
  assert.equal(env.store.pass.domains.includes("google.com"), false);

  env.updates = [];
  await env.fire.tabUpdated(4, { url: "https://www.google.com/" });
  assert.deepEqual(env.updatedTabs(), [4], "the rest of google.com stays blocked");
});

test("a pass from chat.openai.com covers chatgpt.com, where it redirects", async () => {
  const env = await inSession();
  const res = await env.send({ type: "unlock", answers: ANSWERS, url: "https://chat.openai.com/" });
  assert.equal(res.domain, "chatgpt.com");
  assert.deepEqual(env.store.pass.domains, ["chatgpt.com", "chat.openai.com"]);
  assert.equal(env.allows().length, 2);

  env.updates = [];
  await env.fire.tabUpdated(7, { url: "https://chatgpt.com/" });
  await env.fire.tabUpdated(8, { url: "https://chat.openai.com/" });
  assert.deepEqual(env.updatedTabs(), []);
});

test("a pass from chatgpt.com also covers chat.openai.com", async () => {
  const env = await inSession();
  await env.send({ type: "unlock", answers: ANSWERS, url: "https://chatgpt.com/" });
  assert.deepEqual(env.store.pass.domains, ["chatgpt.com", "chat.openai.com"]);
});

test("a pass saved before aliases existed still works", async () => {
  const env = await inSession();
  env.store.pass = { domain: "claude.ai", until: Date.now() + 60000 };
  await env.send({ type: "sitesChanged" });
  assert.equal(env.allows().length, 1);
  await env.fire.tabUpdated(9, { url: "https://claude.ai/" });
  assert.deepEqual(env.updatedTabs(), []);
});

test("reconcile finishes a session that ran out while Chrome was closed", async () => {
  const env = await load();
  env.store.session = { startedAt: Date.now() - 26 * 60000, endsAt: Date.now() - 60000, minutes: 25 };
  await env.fire.startup();
  assert.equal(env.store.session, undefined);
  assert.equal(env.store.stats.sessions, 1);
  assert.equal(env.rules.length, 0);
});

test("reconcile recreates lost alarms and clears the old passUntil key", async () => {
  const env = await inSession();
  env.alarms = {};
  env.store.passUntil = Date.now() + 60000;
  await env.fire.startup();
  assert.ok(env.alarms.sessionEnd && env.alarms.tick);
  assert.equal("passUntil" in env.store, false);
});

test("a pass from kimi.moonshot.cn covers kimi.com, where it redirects", async () => {
  const env = await inSession();
  const res = await env.send({ type: "unlock", answers: ANSWERS, url: "https://kimi.moonshot.cn/" });
  assert.equal(res.domain, "kimi.com");
  assert.deepEqual(env.store.pass.domains, ["kimi.com", "kimi.moonshot.cn"]);
});

// #8: new defaults reach existing installs

test("a fresh install gets the full default list", async () => {
  const env = await load();
  assert.deepEqual(env.store.sites, env.get("DEFAULT_SITES"));
  assert.ok(env.get("DEFAULT_SITES").every((d) => env.store.knownDefaults.includes(d)));
});

test("updating from v1.0 adds the new defaults and keeps custom sites", async () => {
  const env0 = await load();
  const v1 = env0.get("V1_DEFAULTS");
  const env = await load({ sites: [...v1, "mysite.dev"] });
  const sites = env.store.sites;

  assert.ok(sites.includes("mysite.dev"));
  assert.ok(env.get("DEFAULT_SITES").every((d) => sites.includes(d)), "every new default added");
  assert.equal(sites.includes("chat.deepseek.com"), false, "chat.deepseek.com swapped for deepseek.com");
  assert.equal(new Set(sites).size, sites.length, "no duplicates");
});

test("updating from v1.0 doesn't bring back defaults the user deleted", async () => {
  const env0 = await load();
  const v1 = env0.get("V1_DEFAULTS");
  const kept = v1.filter((d) => d !== "claude.ai" && d !== "chat.deepseek.com");
  const env = await load({ sites: kept });

  assert.equal(env.store.sites.includes("claude.ai"), false);
  assert.equal(env.store.sites.includes("deepseek.com"), false, "deleted DeepSeek stays deleted");
  assert.ok(env.store.sites.includes("chat.mistral.ai"), "other new defaults still added");
});

test("a new default deleted after updating isn't re-added on the next update", async () => {
  const first = await load({ sites: ["chatgpt.com"], knownDefaults: ["chatgpt.com"] });
  const sites = first.store.sites.filter((d) => d !== "pi.ai");
  const env = await load({ sites, knownDefaults: first.store.knownDefaults });
  assert.equal(env.store.sites.includes("pi.ai"), false);
  assert.deepEqual(env.store.sites, sites);
});

test("every default site and alias passes the blocklist input check", async () => {
  const env = await load();
  const ctx = vm.createContext({ URL });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../src/shared/sites.js"), "utf8"), ctx);
  const cleanSite = vm.runInContext("cleanSite", ctx);
  const aliases = env.get("SITE_ALIASES");
  const all = [...env.get("DEFAULT_SITES"), ...Object.keys(aliases), ...Object.values(aliases)];
  for (const d of all) assert.equal(cleanSite(d), d, d);
});

// #9 and #10: block page links and visit counting

test("redirect rules paste the address in as-is with ?u=", async () => {
  const env = await inSession();
  assert.equal(env.redirects()[0].action.redirect.regexSubstitution, "chrome-extension://ID/src/blocked/blocked.html?u=\\0");
});

test("re-blocking open tabs uses an encoded sweep link", async () => {
  const env = await load();
  const url = "https://chatgpt.com/c/1?q=a%26b";
  env.tabs = [{ id: 1, url }];
  await env.send({ type: "start", minutes: 25 });
  assert.deepEqual(linkOf(env.updates[0].url), { url, fromTab: true, sweep: true, why: "", to: "" });
});

test("the backup tab listener uses a tab link that isn't a sweep", async () => {
  const env = await inSession();
  await env.fire.tabUpdated(4, { url: "https://claude.ai/" });
  assert.deepEqual(linkOf(env.updates[0].url),
    { url: "https://claude.ai/", fromTab: true, sweep: false, why: "", to: "" });
});

// Explaining re-blocks caused by passes

test("a tab re-blocked because the pass moved says where it moved to", async () => {
  const env = await inSession();
  await env.send({ type: "unlock", answers: ANSWERS, url: "https://claude.ai/" });
  env.tabs = [{ id: 1, url: "https://claude.ai/new" }];
  env.updates = [];
  await env.send({ type: "unlock", answers: ANSWERS, url: "https://chatgpt.com/" });
  const link = linkOf(env.updates[0].url);
  assert.deepEqual([link.url, link.sweep, link.why, link.to], ["https://claude.ai/new", true, "moved", "chatgpt.com"]);
});

test("a tab re-blocked because the pass ended says so", async () => {
  const env = await inSession();
  await env.send({ type: "unlock", answers: ANSWERS, url: "https://claude.ai/" });
  env.tabs = [{ id: 1, url: "https://claude.ai/new" }];
  env.updates = [];
  await env.fire.alarm({ name: "passEnd" });
  const link = linkOf(env.updates[0].url);
  assert.deepEqual([link.sweep, link.why, link.to], [true, "ended", ""]);
});

test("tabs blocked when a session starts have no pass note", async () => {
  const env = await load();
  env.tabs = [{ id: 1, url: "https://claude.ai/" }];
  await env.send({ type: "start", minutes: 25 });
  assert.equal(linkOf(env.updates[0].url).why, "");
});

test("visits the block page marks count: false aren't counted", async () => {
  const env = await inSession();
  const res = await env.send({ type: "blocked", url: "https://chatgpt.com/", count: false });
  assert.equal(res.blocked, true);
  assert.equal(env.store.stats.blocked, 0);
});

// #14: tabs still loading

test("a tab that's still loading a blocked site is caught", async () => {
  const env = await load();
  env.tabs = [{ id: 1, url: "https://example.com/", pendingUrl: "https://chatgpt.com/" }];
  await env.send({ type: "start", minutes: 25 });
  assert.deepEqual(env.updatedTabs(), [1]);
});

// #17: session length

test("a session can only be 25, 50 or 90 minutes", async () => {
  for (const minutes of [50, 90]) {
    const env = await load();
    assert.equal((await env.send({ type: "start", minutes })).ok, true, String(minutes));
  }
  for (const minutes of [0, -5, 1000, "25", undefined, NaN]) {
    const env = await load();
    const res = await env.send({ type: "start", minutes });
    assert.equal(res.ok, false, String(minutes));
    assert.equal(env.store.session, undefined);
    assert.equal(env.rules.length, 0);
  }
});

// #12: events happening at the same moment

test("ending a session and the timer firing together count it once", async () => {
  const env = await inSession();
  env.store.session.startedAt = Date.now() - 10 * 60000;
  await Promise.all([env.send({ type: "stop" }), env.fire.alarm({ name: "sessionEnd" })]);
  assert.equal(env.store.stats.minutes, 10);
  assert.equal(env.store.stats.sessions, 0, "the stop came first, so it isn't a finished session");
});

test("two unlocks together don't collide, and the second one wins", async () => {
  const env = await inSession();
  const [first, second] = await Promise.all([
    env.send({ type: "unlock", answers: ANSWERS, url: "https://chatgpt.com/" }),
    env.send({ type: "unlock", answers: ANSWERS, url: "https://claude.ai/" })
  ]);
  assert.equal(first.ok, true, first.error);
  assert.equal(second.ok, true, second.error);
  assert.equal(env.store.pass.domain, "claude.ai");
  assert.deepEqual(env.allows().map((r) => r.condition.regexFilter), ["^https?://([^/]*\\.)?claude\\.ai(/.*)?$"]);
  assert.deepEqual(env.errors, []);
});

test("an unlock and a blocklist save together keep the pass's allow rules", async () => {
  const env = await inSession();
  const [unlock, saved] = await Promise.all([
    env.send({ type: "unlock", answers: ANSWERS, url: "https://chatgpt.com/" }),
    env.send({ type: "sitesChanged" })
  ]);
  assert.equal(unlock.ok, true);
  assert.equal(saved.ok, true);
  assert.equal(env.allows().length, 2, "chatgpt.com and chat.openai.com");
  assert.deepEqual(env.errors, []);
});

test("one failed message doesn't block the ones after it", async () => {
  const env = await inSession();
  const [bad, good] = await Promise.all([
    env.send({ type: "unlock", answers: ANSWERS, url: "https://example.com/" }),
    env.send({ type: "blocked", url: "https://claude.ai/" })
  ]);
  assert.equal(bad.ok, false);
  assert.equal(good.ok, true);
  assert.equal(env.store.stats.blocked, 1);
});

// Pass notifications

const messages = (env) => env.notifications.map((n) => n.message);

test("an unlock sets a warning alarm one minute before the pass ends", async () => {
  const env = await inSession();
  await env.send({ type: "unlock", answers: ANSWERS, url: "https://claude.ai/" });
  assert.equal(env.alarms.passWarn.when, env.store.pass.until - 60000);
  assert.equal(env.alarms.passEnd.when, env.store.pass.until);
  assert.deepEqual(env.notifications, [], "a first pass doesn't notify");
});

test("one minute before the pass ends: 1 minute left notification", async () => {
  const env = await inSession();
  await env.send({ type: "unlock", answers: ANSWERS, url: "https://claude.ai/" });
  await env.fire.alarm({ name: "passWarn" });
  assert.deepEqual(messages(env), ["1 minute left on your claude.ai pass."]);
  const [n] = env.notifications;
  assert.equal(n.id, "focus-guard-pass");
  assert.equal(n.type, "basic");
  assert.equal(n.title, "Focus Guard");
  assert.equal(n.iconUrl, "chrome-extension://ID/icons/icon128.png");
});

test("when the pass ends: pass is over notification", async () => {
  const env = await inSession();
  await env.send({ type: "unlock", answers: ANSWERS, url: "https://claude.ai/" });
  await env.fire.alarm({ name: "passEnd" });
  assert.deepEqual(messages(env), ["Your 5-minute pass for claude.ai is over. It's blocked again."]);
});

test("when the pass moves: moved notification, and both alarms follow the new pass", async () => {
  const env = await inSession();
  await env.send({ type: "unlock", answers: ANSWERS, url: "https://claude.ai/" });
  await env.send({ type: "unlock", answers: ANSWERS, url: "https://chatgpt.com/" });
  assert.deepEqual(messages(env), [
    "Your pass moved to chatgpt.com, so claude.ai is blocked again. Only one site can be unlocked at a time."
  ]);
  assert.equal(env.alarms.passWarn.when, env.store.pass.until - 60000);
  assert.equal(env.alarms.passEnd.when, env.store.pass.until);

  await env.fire.alarm({ name: "passWarn" });
  assert.equal(messages(env)[1], "1 minute left on your chatgpt.com pass.", "the warning is for the new site");
});

test("unlocking the same site again doesn't say the pass moved", async () => {
  const env = await inSession();
  await env.send({ type: "unlock", answers: ANSWERS, url: "https://claude.ai/" });
  await env.send({ type: "unlock", answers: ANSWERS, url: "https://claude.ai/new" });
  assert.deepEqual(env.notifications, []);
});

test("an expired pass doesn't count as moving", async () => {
  const env = await inSession();
  env.store.pass = { domain: "claude.ai", domains: ["claude.ai"], until: Date.now() - 1000 };
  await env.send({ type: "unlock", answers: ANSWERS, url: "https://chatgpt.com/" });
  assert.deepEqual(env.notifications, []);
});

test("ending the session early during a pass clears its alarms and notifications", async () => {
  const env = await inSession();
  await env.send({ type: "unlock", answers: ANSWERS, url: "https://claude.ai/" });
  await env.send({ type: "stop" });
  assert.equal(env.alarms.passWarn, undefined);
  assert.equal(env.alarms.passEnd, undefined);
  assert.deepEqual(env.cleared, ["focus-guard-pass"]);
  assert.deepEqual(env.notifications, []);
});

test("ending the session early clears every alarm, even if a later step fails", async () => {
  const env = await inSession();
  await env.send({ type: "unlock", answers: ANSWERS, url: "https://claude.ai/" });
  delete env.alarms.passWarn; // as after the "1 minute left" shortcut fires
  env.failRemove = true; // like the worker stopping partway through
  const reply = await env.send({ type: "stop" });
  assert.equal(reply.ok, false);
  assert.deepEqual(Object.keys(env.alarms), [], "sessionEnd, tick and passEnd are gone");
});

test("ending the session early clears leftover alarms when no session is saved", async () => {
  const env = await inSession();
  await env.send({ type: "unlock", answers: ANSWERS, url: "https://claude.ai/" });
  delete env.store.session; // a session that didn't finish cleaning up
  await env.send({ type: "stop" });
  assert.deepEqual(Object.keys(env.alarms), []);
  assert.equal(env.store.pass, undefined);
  assert.equal(env.rules.length, 0);
  assert.equal(env.store.stats.minutes, 0, "nothing to count without a session");
});

test("reconcile clears leftover alarms when no session is saved", async () => {
  const env = await inSession();
  await env.send({ type: "unlock", answers: ANSWERS, url: "https://claude.ai/" });
  delete env.store.session;
  await env.fire.startup();
  assert.deepEqual(Object.keys(env.alarms), []);
});

test("no pass notifications when the session itself ends during the pass", async () => {
  const env = await inSession();
  env.store.session.endsAt = Date.now() + 2 * 60000; // session ends before the 5-minute pass
  await env.send({ type: "unlock", answers: ANSWERS, url: "https://claude.ai/" });

  await env.fire.alarm({ name: "passWarn" }); // fires before the session ends
  assert.deepEqual(env.notifications, [], "no 1 minute warning for a pass the session will end first");

  await env.fire.alarm({ name: "sessionEnd" });
  assert.equal(env.alarms.passEnd, undefined, "session end cleared the pass alarm");
  await env.fire.alarm({ name: "passEnd" }); // even if it fired anyway
  assert.deepEqual(env.notifications, []);
});

test("reconcile recreates a lost warning alarm", async () => {
  const env = await inSession();
  await env.send({ type: "unlock", answers: ANSWERS, url: "https://claude.ai/" });
  env.alarms = {};
  await env.fire.startup();
  assert.equal(env.alarms.passWarn.when, env.store.pass.until - 60000);
  assert.equal(env.alarms.passEnd.when, env.store.pass.until);
});

test("reconcile doesn't make a late warning in the pass's last minute", async () => {
  const env = await inSession();
  await env.send({ type: "unlock", answers: ANSWERS, url: "https://claude.ai/" });
  env.store.pass.until = Date.now() + 30000;
  env.alarms = {};
  await env.fire.startup();
  assert.equal(env.alarms.passWarn, undefined);
  assert.ok(env.alarms.passEnd, "the pass still ends on time");
});

// Setup flow: install vs update

const WELCOME = "chrome-extension://ID/src/welcome/welcome.html";
const UNINSTALL = "https://github.com/rishi555123/focus-guard#removed-focus-guard";

test("a first install opens the welcome page once", async () => {
  const env = await load({}, "install");
  assert.deepEqual(env.created, [WELCOME]);
});

test("an update doesn't open the welcome page", async () => {
  const env = await load({ sites: ["chatgpt.com"] }, "update");
  assert.deepEqual(env.created, []);
});

test("clicking reload on an unpacked extension doesn't open the welcome page", async () => {
  // Chrome reports a reload as an update; storage is kept
  const first = await load({}, "install");
  const env = await load(first.store, "update");
  assert.deepEqual(env.created, []);
});

test("a Chrome update doesn't open the welcome page", async () => {
  const env = await load({ sites: ["chatgpt.com"] }, "chrome_update");
  assert.deepEqual(env.created, []);
});

test("the welcome page opens after the defaults are saved", async () => {
  const env = await load({}, "install");
  assert.ok(env.store.sites.length > 0 && env.store.stats, "storage was set up first");
  assert.deepEqual(env.created, [WELCOME]);
});

test("install, update and browser start all set the uninstall page", async () => {
  const installed = await load({}, "install");
  assert.deepEqual(installed.uninstallUrls, [UNINSTALL]);
  const updated = await load({ sites: ["chatgpt.com"] }, "update");
  assert.deepEqual(updated.uninstallUrls, [UNINSTALL]);
  await updated.fire.startup();
  assert.deepEqual(updated.uninstallUrls, [UNINSTALL, UNINSTALL]);
  assert.deepEqual(updated.created, [], "browser start doesn't open the welcome page");
});

test("the test notification looks like a pass notification", async () => {
  const env = await load();
  const res = await env.send({ type: "testNotification" });
  assert.equal(res.ok, true);
  const [n] = env.notifications;
  assert.equal(n.id, "focus-guard-pass");
  assert.equal(n.iconUrl, "chrome-extension://ID/icons/icon128.png");
  assert.equal(n.title, "Focus Guard");
  assert.match(n.message, /test/i);
});

test("a failed test notification is reported, not hidden", async () => {
  const env = await load();
  env.failNotifications = true;
  const res = await env.send({ type: "testNotification" });
  assert.equal(res.ok, false);
  assert.match(res.error, /blocked/);
});

test("a failed pass notification doesn't break the pass", async () => {
  const env = await inSession();
  env.failNotifications = true;
  await env.send({ type: "unlock", answers: ANSWERS, url: "https://claude.ai/" });
  const res = await env.send({ type: "unlock", answers: ANSWERS, url: "https://chatgpt.com/" });
  assert.equal(res.ok, true);
  assert.equal(env.store.pass.domain, "chatgpt.com");
});

test("missing stats don't break an unlock", async () => {
  const env = await inSession();
  delete env.store.stats;
  const res = await env.send({ type: "unlock", answers: ANSWERS, url: "https://claude.ai/" });
  assert.equal(res.ok, true);
  assert.equal(env.store.stats.unlocks, 1);
});

test("session lengths and the pass length come from shared/constants.js", async () => {
  const env = await load({}, "install",
    "const SESSION_LENGTHS = [15, 45]; const PASS_MINUTES = 7; const UNLOCK_MIN_CHARS = 20; const UNLOCK_WAIT_SECONDS = 60;" +
    "const minutesText = (n) => `${n} minute${n === 1 ? \"\" : \"s\"}`;");
  const refused = await env.send({ type: "start", minutes: 25 });
  assert.equal(refused.ok, false, "25 isn't a session length any more");
  assert.match(refused.error, /Session length must be 15, 45 minutes/);
  assert.equal((await env.send({ type: "start", minutes: 45 })).ok, true);
  assert.equal(env.store.session.endsAt - env.store.session.startedAt, 45 * 60000);

  const before = Date.now();
  await env.send({ type: "unlock", answers: ANSWERS, url: "https://claude.ai/" });
  const length = env.store.pass.until - before;
  assert.ok(length >= 7 * 60000 && length < 7 * 60000 + 1000, "a 7-minute pass");
  assert.equal(env.alarms.passEnd.when, env.store.pass.until, "and its alarm");
  await env.fire.alarm({ name: "passEnd" });
  assert.deepEqual(messages(env), ["Your 7-minute pass for claude.ai is over. It's blocked again."]);
});

test("a pass is only granted for three real answers", async () => {
  const env = await inSession();
  for (const answers of [
    undefined,
    { ...ANSWERS, got: "" },
    { ...ANSWERS, expected: "too short" },
    { ...ANSWERS, tried: "asdfasdf asdfasdf asdfasdf" }
  ]) {
    const res = await env.send({ type: "unlock", answers, url: "https://claude.ai/" });
    assert.equal(res.ok, false, JSON.stringify(answers));
    assert.match(res.error, /Answer all three questions first/);
  }
  assert.equal(env.store.pass, undefined, "no pass was granted");
  assert.equal(env.store.stats.unlocks, 0);
});

test("the unlock note keeps all three answers in one line each", async () => {
  const env = await inSession();
  await env.send({ type: "unlock", answers: { ...ANSWERS, tried: "  " + ANSWERS.tried + "  " }, url: "https://claude.ai/" });
  assert.equal(env.store.stats.log[0].reason,
    `Tried: ${ANSWERS.tried}
Expected: ${ANSWERS.expected}
Instead: ${ANSWERS.got}`);
});

test("upgrading keeps unlock notes saved by 1.0.0 as they were", async () => {
  const old = { at: 1, domain: "claude.ai", reason: "I tried reading the error, logging the values and the docs, still stuck." };
  const env = await load({ sites: ["claude.ai"], stats: { blocked: 1, sessions: 1, minutes: 25, unlocks: 1, log: [old] } });
  await env.send({ type: "start", minutes: 25 });
  await env.send({ type: "unlock", answers: ANSWERS, url: "https://claude.ai/" });
  assert.deepEqual(env.store.stats.log[1], old);
  assert.equal(env.store.stats.unlocks, 2);
});

// The optional AI app builders group

const BUILDERS = ["v0.app", "bolt.new", "lovable.dev"];
const ruleSites = (env) => env.rules.filter((r) => r.action.type === "redirect").map((r) => r.condition.regexFilter);
const blocks = (env, site) => ruleSites(env).some((re) => new RegExp(re).test(`https://${site}/`));

test("the app builders are off by default and never added to your list", async () => {
  const env = await inSession();
  for (const site of BUILDERS) {
    assert.equal(blocks(env, site), false, site);
    assert.ok(!env.store.sites.includes(site), site);
  }
  assert.equal(env.store.blockAppBuilders, undefined);
});

test("turning the app builders on blocks them; turning it off unblocks them", async () => {
  const env = await inSession();
  env.store.blockAppBuilders = true;
  await env.send({ type: "sitesChanged" });
  for (const site of BUILDERS) assert.equal(blocks(env, site), true, site);
  assert.equal(blocks(env, "chatgpt.com"), true, "your own list still blocked");
  assert.ok(!BUILDERS.some((s) => env.store.sites.includes(s)), "your list is unchanged");
  env.store.blockAppBuilders = false;
  await env.send({ type: "sitesChanged" });
  for (const site of BUILDERS) assert.equal(blocks(env, site), false, site);
});

test("an app builder you also listed yourself gets one rule, and stays blocked with the group off", async () => {
  const env = await load({ sites: ["chatgpt.com", "bolt.new"], blockAppBuilders: true });
  await env.send({ type: "start", minutes: 25 });
  assert.equal(ruleSites(env).filter((re) => new RegExp(re).test("https://bolt.new/")).length, 1);
  env.store.blockAppBuilders = false;
  await env.send({ type: "sitesChanged" });
  assert.equal(blocks(env, "bolt.new"), true);
});

test("app builder sites are blocked, counted and unlockable like any other", async () => {
  const env = await load({ sites: ["chatgpt.com"], blockAppBuilders: true });
  await env.send({ type: "start", minutes: 25 });
  const res = await env.send({ type: "blocked", url: "https://v0.app/chat/1" });
  assert.equal(res.blocked, true);
  assert.equal(env.store.stats.blocked, 1);
  const pass = await env.send({ type: "unlock", answers: ANSWERS, url: "https://v0.app/chat/1" });
  assert.equal(pass.domain, "v0.app");
});

test("after a session, a leftover block page for an app builder reopens it only while the group is on", async () => {
  const on = await load({ sites: [], blockAppBuilders: true });
  assert.equal((await on.send({ type: "blocked", url: "https://lovable.dev/" })).reopen, true);
  const off = await load({ sites: [] });
  assert.equal((await off.send({ type: "blocked", url: "https://lovable.dev/" })).reopen, false, "not listed, so never reopened");
});

test("upgrading from 1.0.0 leaves the app builders off and the list as it was merged", async () => {
  const env = await load({ sites: ["chatgpt.com", "claude.ai"], stats: { blocked: 3, sessions: 2, minutes: 50, unlocks: 1, log: [] } });
  assert.equal(env.store.blockAppBuilders, undefined);
  assert.ok(!BUILDERS.some((s) => env.store.sites.includes(s)));
});

// Daily history for the streak and the weekly chart (src/shared/streaks.js)

const localDay = (time) => { const d = new Date(time); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

test("a finished session is added to the day it ended", async () => {
  const env = await load();
  const endsAt = Date.now() - 60000;
  env.store.session = { startedAt: endsAt - 25 * 60000, endsAt, minutes: 25 };
  await env.fire.startup(); // ran out while Chrome was closed
  assert.deepEqual(env.store.stats.days, { [localDay(endsAt)]: { sessions: 1, minutes: 25 } });
});

test("a session ended early adds its minutes to the day, but not a finished session", async () => {
  const env = await inSession();
  env.store.session.startedAt = Date.now() - 10 * 60000;
  await env.send({ type: "stop" });
  assert.deepEqual(env.store.stats.days, { [localDay(Date.now())]: { sessions: 0, minutes: 10 } });
  assert.equal(env.store.stats.sessions, 0);
});

test("ending a session straight away adds nothing to the history", async () => {
  const env = await inSession();
  await env.send({ type: "stop" });
  assert.deepEqual(env.store.stats.days, {});
});

test("upgrading from 1.0.0 keeps the totals, and the history starts with the next session", async () => {
  const v1 = { blocked: 7, sessions: 4, minutes: 130, unlocks: 2, log: [{ at: 1, domain: "claude.ai", reason: "old note" }] };
  const env = await load({ sites: ["chatgpt.com"], stats: v1 });
  assert.deepEqual(env.store.stats, v1, "an update alone changes nothing");
  await env.send({ type: "start", minutes: 25 });
  env.store.session.endsAt = Date.now() - 1000;
  env.store.session.startedAt = env.store.session.endsAt - 25 * 60000;
  await env.fire.alarm({ name: "sessionEnd" });
  const { stats } = env.store;
  assert.deepEqual([stats.blocked, stats.sessions, stats.minutes, stats.unlocks], [7, 5, 155, 2]);
  assert.deepEqual(stats.log, v1.log);
  assert.deepEqual(stats.days, { [localDay(Date.now())]: { sessions: 1, minutes: 25 } });
});

test("the history keeps recent days it already had and drops ones over 60 days old", async () => {
  const recent = localDay(Date.now() - 3 * 86400000), old = localDay(Date.now() - 70 * 86400000);
  const days = { [old]: { sessions: 1, minutes: 25 }, [recent]: { sessions: 1, minutes: 50 } };
  const env = await load({ stats: { blocked: 0, sessions: 2, minutes: 75, unlocks: 0, log: [], days } });
  await env.send({ type: "start", minutes: 25 });
  env.store.session.endsAt = Date.now() - 1000;
  await env.fire.alarm({ name: "sessionEnd" });
  assert.deepEqual(Object.keys(env.store.stats.days), [recent, localDay(Date.now())]);
  assert.deepEqual(env.store.stats.days[recent], { sessions: 1, minutes: 50 });
});
