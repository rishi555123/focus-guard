// Tests for src/background/background.js. Runs the real file against a fake
// chrome API (in-memory storage, rules, alarms and tabs). Plain Node 18+, no installs:
//   node --test
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const SOURCE = fs.readFileSync(path.join(__dirname, "../src/background/background.js"), "utf8");
const REASON = "I tried reading the error, logging the values and the docs, still stuck.";

// Load a fresh copy of background.js with its own fake chrome
async function load() {
  const listeners = {};
  const ev = (name) => ({ addListener: (fn) => (listeners[name] = fn) });
  const env = { store: {}, rules: [], alarms: {}, tabs: [], updates: [], errors: [] };

  const chrome = {
    runtime: {
      getURL: (p) => "chrome-extension://ID/" + p,
      onInstalled: ev("installed"), onStartup: ev("startup"), onMessage: ev("message")
    },
    storage: { local: {
      get: async (keys) => {
        const out = {};
        for (const k of [].concat(keys)) if (k in env.store) out[k] = structuredClone(env.store[k]);
        return out;
      },
      set: async (o) => { Object.assign(env.store, structuredClone(o)); },
      remove: async (keys) => { for (const k of [].concat(keys)) delete env.store[k]; }
    } },
    declarativeNetRequest: {
      getDynamicRules: async () => env.rules,
      updateDynamicRules: async ({ removeRuleIds, addRules }) => {
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
      onUpdated: ev("tabUpdated")
    },
    action: { setBadgeText() {}, setBadgeBackgroundColor() {} }
  };
  const quietConsole = { ...console, error: (...a) => env.errors.push(a.join(" ")) };
  vm.runInNewContext(SOURCE, { chrome, console: quietConsole, structuredClone, URL });

  env.send = (msg) => new Promise((resolve) => listeners.message(msg, {}, resolve));
  env.fire = listeners;
  env.redirects = () => env.rules.filter((r) => r.action.type === "redirect");
  env.allows = () => env.rules.filter((r) => r.action.type === "allow");
  env.updatedTabs = () => env.updates.map((u) => u.id);
  await listeners.installed();
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

test("missing stats don't break an unlock", async () => {
  const env = await inSession();
  delete env.store.stats;
  const res = await env.send({ type: "unlock", reason: REASON, url: "https://claude.ai/" });
  assert.equal(res.ok, true);
  assert.equal(env.store.stats.unlocks, 1);
});
