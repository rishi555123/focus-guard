// Tests for src/background/background.js. Runs the real file against a fake
// chrome API (in-memory storage, rules, alarms and tabs). Plain Node 22+, no installs:
//   node --test
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const SOURCE = fs.readFileSync(path.join(__dirname, "../src/background/background.js"), "utf8");

// Read block page links the same way the block page does (src/blocked/links.js)
const linksContext = vm.createContext({ URL, URLSearchParams });
vm.runInContext(fs.readFileSync(path.join(__dirname, "../src/blocked/links.js"), "utf8"), linksContext);
const BLOCK_PAGE = "chrome-extension://ID/src/blocked/blocked.html";
function linkOf(url) {
  assert.ok(url.startsWith(BLOCK_PAGE + "?"), url);
  return structuredClone(vm.runInContext("readBlockLink", linksContext)(url.slice(BLOCK_PAGE.length)));
}
const REASON = "I tried reading the error, logging the values and the docs, still stuck.";

// Load a fresh copy of background.js with its own fake chrome.
// `saved` is what chrome.storage.local already holds before install/update runs.
// With nothing saved it's a first install; with saved data it's an update.
async function load(saved = {}, reason = Object.keys(saved).length ? "update" : "install") {
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
      query: async () => env.tabs,
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
  const context = vm.createContext({ chrome, console: quietConsole, structuredClone, URL, URLSearchParams });
  vm.runInContext(SOURCE, context);
  env.get = (name) => structuredClone(vm.runInContext(name, context)); // read a top-level const

  env.send = (msg) => new Promise((resolve) => listeners.message(msg, {}, resolve));
  env.fire = listeners;
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
  const res = await env.send({ type: "unlock", reason: REASON, url: "https://chatgpt.com/c/1" });

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
  await env.send({ type: "unlock", reason: REASON, url: "https://chatgpt.com/" });
  env.updates = [];
  await env.fire.tabUpdated(5, { url: "https://www.chatgpt.com/" });
  await env.fire.tabUpdated(6, { url: "https://claude.ai/" });
  assert.deepEqual(env.updatedTabs(), [6]);
});

test("a leftover block page for a passed site reopens it without counting", async () => {
  const env = await inSession();
  await env.send({ type: "unlock", reason: REASON, url: "https://chatgpt.com/" });
  const res = await env.send({ type: "blocked", url: "https://chatgpt.com/" });
  assert.equal(res.blocked, false);
  assert.equal(res.reopen, true);
  assert.equal(env.store.stats.blocked, 0);
});

test("a second pass replaces the first and re-blocks its tabs", async () => {
  const env = await inSession();
  await env.send({ type: "unlock", reason: REASON, url: "https://chatgpt.com/" });
  env.tabs = [{ id: 1, url: "https://chatgpt.com/" }, { id: 3, url: "https://gemini.google.com/app" }];
  env.updates = [];
  const res = await env.send({ type: "unlock", reason: REASON, url: "https://gemini.google.com/app" });
  assert.equal(res.domain, "gemini.google.com");
  assert.deepEqual(env.updatedTabs(), [1]);
});

test("unlocking a site that isn't on the blocklist is refused", async () => {
  const env = await inSession();
  const res = await env.send({ type: "unlock", reason: REASON, url: "https://example.com/" });
  assert.equal(res.ok, false);
  assert.match(res.error, /Not a blocked site/);
  assert.equal(env.store.pass, undefined);
});

test("when a pass ends, its site is blocked again", async () => {
  const env = await inSession();
  await env.send({ type: "unlock", reason: REASON, url: "https://gemini.google.com/app" });
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
  res = await env.send({ type: "unlock", reason: REASON, url: "https://chatgpt.com/" });
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
  const res = await env.send({ type: "unlock", reason: REASON, url: "https://gemini.google.com/app" });
  assert.equal(res.domain, "gemini.google.com");
  assert.equal(env.store.pass.domains.includes("google.com"), false);

  env.updates = [];
  await env.fire.tabUpdated(4, { url: "https://www.google.com/" });
  assert.deepEqual(env.updatedTabs(), [4], "the rest of google.com stays blocked");
});

test("a pass from chat.openai.com covers chatgpt.com, where it redirects", async () => {
  const env = await inSession();
  const res = await env.send({ type: "unlock", reason: REASON, url: "https://chat.openai.com/" });
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
  await env.send({ type: "unlock", reason: REASON, url: "https://chatgpt.com/" });
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
  const res = await env.send({ type: "unlock", reason: REASON, url: "https://kimi.moonshot.cn/" });
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
  await env.send({ type: "unlock", reason: REASON, url: "https://claude.ai/" });
  env.tabs = [{ id: 1, url: "https://claude.ai/new" }];
  env.updates = [];
  await env.send({ type: "unlock", reason: REASON, url: "https://chatgpt.com/" });
  const link = linkOf(env.updates[0].url);
  assert.deepEqual([link.url, link.sweep, link.why, link.to], ["https://claude.ai/new", true, "moved", "chatgpt.com"]);
});

test("a tab re-blocked because the pass ended says so", async () => {
  const env = await inSession();
  await env.send({ type: "unlock", reason: REASON, url: "https://claude.ai/" });
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
    env.send({ type: "unlock", reason: REASON, url: "https://chatgpt.com/" }),
    env.send({ type: "unlock", reason: REASON, url: "https://claude.ai/" })
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
    env.send({ type: "unlock", reason: REASON, url: "https://chatgpt.com/" }),
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
    env.send({ type: "unlock", reason: REASON, url: "https://example.com/" }),
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
  await env.send({ type: "unlock", reason: REASON, url: "https://claude.ai/" });
  assert.equal(env.alarms.passWarn.when, env.store.pass.until - 60000);
  assert.equal(env.alarms.passEnd.when, env.store.pass.until);
  assert.deepEqual(env.notifications, [], "a first pass doesn't notify");
});

test("one minute before the pass ends: 1 minute left notification", async () => {
  const env = await inSession();
  await env.send({ type: "unlock", reason: REASON, url: "https://claude.ai/" });
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
  await env.send({ type: "unlock", reason: REASON, url: "https://claude.ai/" });
  await env.fire.alarm({ name: "passEnd" });
  assert.deepEqual(messages(env), ["Your 5-minute pass for claude.ai is over. It's blocked again."]);
});

test("when the pass moves: moved notification, and both alarms follow the new pass", async () => {
  const env = await inSession();
  await env.send({ type: "unlock", reason: REASON, url: "https://claude.ai/" });
  await env.send({ type: "unlock", reason: REASON, url: "https://chatgpt.com/" });
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
  await env.send({ type: "unlock", reason: REASON, url: "https://claude.ai/" });
  await env.send({ type: "unlock", reason: REASON, url: "https://claude.ai/new" });
  assert.deepEqual(env.notifications, []);
});

test("an expired pass doesn't count as moving", async () => {
  const env = await inSession();
  env.store.pass = { domain: "claude.ai", domains: ["claude.ai"], until: Date.now() - 1000 };
  await env.send({ type: "unlock", reason: REASON, url: "https://chatgpt.com/" });
  assert.deepEqual(env.notifications, []);
});

test("ending the session early during a pass clears its alarms and notifications", async () => {
  const env = await inSession();
  await env.send({ type: "unlock", reason: REASON, url: "https://claude.ai/" });
  await env.send({ type: "stop" });
  assert.equal(env.alarms.passWarn, undefined);
  assert.equal(env.alarms.passEnd, undefined);
  assert.deepEqual(env.cleared, ["focus-guard-pass"]);
  assert.deepEqual(env.notifications, []);
});

test("ending the session early clears every alarm, even if a later step fails", async () => {
  const env = await inSession();
  await env.send({ type: "unlock", reason: REASON, url: "https://claude.ai/" });
  delete env.alarms.passWarn; // as after the "1 minute left" shortcut fires
  env.failRemove = true; // like the worker stopping partway through
  const reply = await env.send({ type: "stop" });
  assert.equal(reply.ok, false);
  assert.deepEqual(Object.keys(env.alarms), [], "sessionEnd, tick and passEnd are gone");
});

test("ending the session early clears leftover alarms when no session is saved", async () => {
  const env = await inSession();
  await env.send({ type: "unlock", reason: REASON, url: "https://claude.ai/" });
  delete env.store.session; // a session that didn't finish cleaning up
  await env.send({ type: "stop" });
  assert.deepEqual(Object.keys(env.alarms), []);
  assert.equal(env.store.pass, undefined);
  assert.equal(env.rules.length, 0);
  assert.equal(env.store.stats.minutes, 0, "nothing to count without a session");
});

test("reconcile clears leftover alarms when no session is saved", async () => {
  const env = await inSession();
  await env.send({ type: "unlock", reason: REASON, url: "https://claude.ai/" });
  delete env.store.session;
  await env.fire.startup();
  assert.deepEqual(Object.keys(env.alarms), []);
});

test("no pass notifications when the session itself ends during the pass", async () => {
  const env = await inSession();
  env.store.session.endsAt = Date.now() + 2 * 60000; // session ends before the 5-minute pass
  await env.send({ type: "unlock", reason: REASON, url: "https://claude.ai/" });

  await env.fire.alarm({ name: "passWarn" }); // fires before the session ends
  assert.deepEqual(env.notifications, [], "no 1 minute warning for a pass the session will end first");

  await env.fire.alarm({ name: "sessionEnd" });
  assert.equal(env.alarms.passEnd, undefined, "session end cleared the pass alarm");
  await env.fire.alarm({ name: "passEnd" }); // even if it fired anyway
  assert.deepEqual(env.notifications, []);
});

test("reconcile recreates a lost warning alarm", async () => {
  const env = await inSession();
  await env.send({ type: "unlock", reason: REASON, url: "https://claude.ai/" });
  env.alarms = {};
  await env.fire.startup();
  assert.equal(env.alarms.passWarn.when, env.store.pass.until - 60000);
  assert.equal(env.alarms.passEnd.when, env.store.pass.until);
});

test("reconcile doesn't make a late warning in the pass's last minute", async () => {
  const env = await inSession();
  await env.send({ type: "unlock", reason: REASON, url: "https://claude.ai/" });
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
  await env.send({ type: "unlock", reason: REASON, url: "https://claude.ai/" });
  const res = await env.send({ type: "unlock", reason: REASON, url: "https://chatgpt.com/" });
  assert.equal(res.ok, true);
  assert.equal(env.store.pass.domain, "chatgpt.com");
});

test("missing stats don't break an unlock", async () => {
  const env = await inSession();
  delete env.store.stats;
  const res = await env.send({ type: "unlock", reason: REASON, url: "https://claude.ai/" });
  assert.equal(res.ok, true);
  assert.equal(env.store.stats.unlocks, 1);
});
