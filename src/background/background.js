const DEFAULT_SITES = [
  "chatgpt.com", "chat.openai.com", "gemini.google.com", "aistudio.google.com",
  "claude.ai", "copilot.microsoft.com", "copilot.cloud.microsoft", "perplexity.ai",
  "deepseek.com", "chat.mistral.ai", "meta.ai", "chat.qwen.ai", "kimi.com",
  "kimi.moonshot.cn", "chat.z.ai", "grok.com", "poe.com", "you.com", "phind.com",
  "blackbox.ai", "lmarena.ai", "duck.ai", "pi.ai", "t3.chat", "typingmind.com"
];
// The v1.0 list, for installs from before knownDefaults was saved
const V1_DEFAULTS = [
  "chatgpt.com", "chat.openai.com", "gemini.google.com", "claude.ai",
  "copilot.microsoft.com", "perplexity.ai", "chat.deepseek.com",
  "poe.com", "grok.com", "you.com", "phind.com"
];
// Old default entries that were swapped for a broader one
const REPLACED_DEFAULTS = { "chat.deepseek.com": "deepseek.com" };
// Old addresses that now redirect to another site. A pass for either one
// covers both, so the redirect doesn't land back on the block page.
const SITE_ALIASES = {
  "chat.openai.com": "chatgpt.com",
  "bard.google.com": "gemini.google.com",
  "kimi.moonshot.cn": "kimi.com"
};
const PASS_MINUTES = 5;
const PASS_WARN_MS = 60000; // "1 minute left" notification
const SESSION_LENGTHS = [25, 50, 90];
const NOTIFY_ID = "focus-guard-pass"; // one id, so a newer pass notification replaces an older one
const WELCOME_PAGE = "src/welcome/welcome.html";
// Opened by Chrome after Focus Guard is removed: how to turn Gemini in Chrome back on
const UNINSTALL_URL = "https://github.com/rishi555123/focus-guard#removed-focus-guard";
const BLOCK_PAGE = () => chrome.runtime.getURL("src/blocked/blocked.html");
const emptyStats = () => ({ blocked: 0, sessions: 0, minutes: 0, unlocks: 0, log: [] });

// Run state changes one at a time, so two events can't interleave their
// storage and rule updates. Only event listeners use this, never helpers,
// so nothing waits on itself.
let queue = Promise.resolve();
function serial(fn) {
  const run = queue.then(fn);
  queue = run.catch(() => {});
  return run;
}

// Runs on first install, on updates (including clicking reload on an unpacked
// extension) and on Chrome updates. Only a first install opens the welcome page.
chrome.runtime.onInstalled.addListener((details) => serial(async () => {
  const s = await chrome.storage.local.get(["sites", "stats", "knownDefaults"]);
  const sites = s.sites ? mergeDefaults(s.sites, s.knownDefaults || V1_DEFAULTS) : DEFAULT_SITES;
  const knownDefaults = [...new Set([...(s.knownDefaults || V1_DEFAULTS), ...DEFAULT_SITES])];
  await chrome.storage.local.set({ sites, knownDefaults });
  if (!s.stats) await chrome.storage.local.set({ stats: emptyStats() });
  setUninstallPage();
  await reconcile();
  if (details?.reason === "install") {
    await chrome.tabs.create({ url: chrome.runtime.getURL(WELCOME_PAGE) }).catch(() => {});
  }
}));

function setUninstallPage() {
  chrome.runtime.setUninstallURL(UNINSTALL_URL).catch(() => {});
}

// Add defaults that are new since the user last got the list, without
// bringing back any default they deleted themselves
function mergeDefaults(sites, known) {
  const deleted = known.filter((d) => !sites.includes(d));
  const skip = new Set([...known, ...deleted.map((d) => REPLACED_DEFAULTS[d]).filter(Boolean)]);
  const merged = sites.map((d) => REPLACED_DEFAULTS[d] || d);
  for (const d of DEFAULT_SITES) if (!skip.has(d)) merged.push(d);
  return [...new Set(merged)];
}
chrome.runtime.onStartup.addListener(() => serial(async () => {
  setUninstallPage();
  await reconcile();
}));

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const siteRegex = (domain) => "^https?://([^/]*\\.)?" + escapeRe(domain) + "(/.*)?$";
const onSite = (host, domain) => host === domain || host.endsWith("." + domain);

function hostOf(url) {
  try { return new URL(url).hostname; } catch (_) { return ""; } // missing or unparseable URL
}

const isListed = (url, sites) => {
  const host = hostOf(url);
  return !!host && sites.some((d) => onSite(host, d));
};

// What's blocked right now: null outside a session, otherwise the blocklist
// plus the one site a pass has unlocked (if any)
async function getBlockState() {
  const now = Date.now();
  const { session, sites = [], pass } = await chrome.storage.local.get(["session", "sites", "pass"]);
  if (!session || session.endsAt <= now) return null;
  return { sites, pass: pass && pass.until > now ? pass : null };
}

// The final site plus every old address that redirects to it
function passDomains(entry) {
  const final = SITE_ALIASES[entry] || entry;
  const aliases = Object.keys(SITE_ALIASES).filter((a) => SITE_ALIASES[a] === final);
  return [...new Set([final, entry, ...aliases])];
}

// Passes saved before aliases existed only have `domain`
const coveredBy = (pass) => pass.domains || [pass.domain];

function isBlockedUrl(url, state) {
  if (!state || !isListed(url, state.sites)) return false;
  const host = hostOf(url);
  return !(state.pass && coveredBy(state.pass).some((d) => onSite(host, d)));
}

// Turn the blocklist into redirect rules (only while a session is active).
// A pass adds higher-priority allow rules for just that site and its aliases.
async function syncRules() {
  const state = await getBlockState();
  const old = await chrome.declarativeNetRequest.getDynamicRules();
  const addRules = [];
  if (state) {
    state.sites.forEach((domain, i) => addRules.push({
      id: i + 1,
      priority: 1,
      action: { type: "redirect", redirect: { regexSubstitution: BLOCK_PAGE() + "?u=\\0" } },
      condition: { regexFilter: siteRegex(domain), resourceTypes: ["main_frame"] }
    }));
    if (state.pass) coveredBy(state.pass).forEach((domain, i) => addRules.push({
      id: state.sites.length + 1 + i,
      priority: 2,
      action: { type: "allow" },
      condition: { regexFilter: siteRegex(domain), resourceTypes: ["main_frame"] }
    }));
  }
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: old.map((r) => r.id),
    addRules
  });
  await updateBadge();
  return !!state;
}

// Block page link for moving a tab (see src/blocked/links.js). `sweep` marks
// re-blocking a tab that was already open, which isn't counted as a visit;
// `why`/`to` tell the block page when a pass moving or ending is the reason.
function blockUrl(url, { sweep = false, why = "", to = "" } = {}) {
  const params = new URLSearchParams();
  if (sweep) params.set("sweep", "1");
  if (why) params.set("why", why);
  if (to) params.set("to", to);
  params.set("t", url);
  return BLOCK_PAGE() + "?" + params;
}

// Catch AI tabs that were already open before the session started (or before a pass
// moved or ended), including tabs that are still loading one
async function blockOpenTabs(reason = {}) {
  const state = await getBlockState();
  if (!state) return;
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    const url = tab.pendingUrl || tab.url;
    if (isBlockedUrl(url, state)) {
      chrome.tabs.update(tab.id, { url: blockUrl(url, { sweep: true, ...reason }) }).catch(() => {});
    }
  }
}

// Backup for navigations the redirect rules never see: back/forward cache,
// prerendered pages and in-page navigation on single-page apps
chrome.tabs.onUpdated.addListener(async (tabId, change) => {
  if (!change.url) return;
  if (isBlockedUrl(change.url, await getBlockState())) {
    chrome.tabs.update(tabId, { url: blockUrl(change.url) }).catch(() => {});
  }
});

async function updateBadge() {
  const { session } = await chrome.storage.local.get("session");
  if (session && session.endsAt > Date.now()) {
    const left = Math.ceil((session.endsAt - Date.now()) / 60000);
    chrome.action.setBadgeText({ text: String(left) });
    chrome.action.setBadgeBackgroundColor({ color: "#1D3B6E" });
  } else {
    chrome.action.setBadgeText({ text: "" });
  }
}

const notification = (message) => ({
  type: "basic",
  iconUrl: chrome.runtime.getURL("icons/icon128.png"),
  title: "Focus Guard",
  message
});

function notify(message) {
  // Notifications are a nice-to-have; never let them break a pass
  return chrome.notifications.create(NOTIFY_ID, notification(message)).catch(() => {});
}

// A pass only ends with its site blocked again if the session outlasts it.
// Otherwise the session ending unblocks everything, so there's nothing to warn about.
const passEndsInSession = (pass, session) => !!pass && !!session && pass.until < session.endsAt;

async function addStats(fn) {
  const { stats: saved } = await chrome.storage.local.get("stats");
  const stats = { ...emptyStats(), ...saved };
  fn(stats);
  await chrome.storage.local.set({ stats });
}

// Always clears the timers, pass and rules, even with no saved session, so
// leftover alarms from a session that didn't finish cleaning up can't outlive it
async function finishSession(completed) {
  // Timers first: if a later step fails or the worker stops, none are left running
  await chrome.alarms.clearAll(); // includes passWarn and passEnd, so no pass notifications follow
  const { session } = await chrome.storage.local.get("session");
  if (session) {
    const mins = Math.round((Math.min(Date.now(), session.endsAt) - session.startedAt) / 60000);
    await addStats((s) => { s.minutes += mins; if (completed) s.sessions += 1; });
  }
  await chrome.storage.local.remove(["session", "pass", "passUntil"]);
  chrome.notifications.clear(NOTIFY_ID).catch(() => {}); // a leftover "1 minute left" no longer applies
  await syncRules();
}

// Chrome can drop alarms on a browser restart or extension update/reload,
// so rebuild them from storage (or finish a session that ran out meanwhile)
async function reconcile() {
  const now = Date.now();
  const { session, pass } = await chrome.storage.local.get(["session", "pass"]);
  if (session && session.endsAt <= now) return finishSession(true);
  await chrome.storage.local.remove("passUntil"); // all-sites pass from before passes were per site
  if (pass && pass.until <= now) await chrome.storage.local.remove("pass");
  if (session) {
    if (!(await chrome.alarms.get("sessionEnd"))) chrome.alarms.create("sessionEnd", { when: session.endsAt });
    if (!(await chrome.alarms.get("tick"))) chrome.alarms.create("tick", { periodInMinutes: 1 });
    if (pass && pass.until > now && !(await chrome.alarms.get("passEnd"))) chrome.alarms.create("passEnd", { when: pass.until });
    // No late warning if the last minute already started while Chrome was closed
    if (pass && pass.until - PASS_WARN_MS > now && !(await chrome.alarms.get("passWarn"))) {
      chrome.alarms.create("passWarn", { when: pass.until - PASS_WARN_MS });
    }
  } else {
    await chrome.alarms.clearAll(); // leftovers from a session that didn't finish cleaning up
  }
  if (await syncRules()) await blockOpenTabs();
}

chrome.alarms.onAlarm.addListener((alarm) => serial(async () => {
  if (alarm.name === "sessionEnd") await finishSession(true);
  if (alarm.name === "tick") await updateBadge();
  if (alarm.name === "passWarn") {
    const { session, pass } = await chrome.storage.local.get(["session", "pass"]);
    if (passEndsInSession(pass, session) && pass.until > Date.now()) {
      await notify(`1 minute left on your ${pass.domain} pass.`);
    }
  }
  if (alarm.name === "passEnd") {
    const { session, pass } = await chrome.storage.local.get(["session", "pass"]);
    await chrome.storage.local.remove("pass");
    if (await syncRules()) {
      await blockOpenTabs({ why: "ended" });
      if (passEndsInSession(pass, session)) await notify(`Your 5-minute pass for ${pass.domain} is over. It's blocked again.`);
    }
  }
}));

async function handleMessage(msg) {
  if (msg.type === "start") {
    if (!SESSION_LENGTHS.includes(msg.minutes)) {
      throw new Error("Session length must be " + SESSION_LENGTHS.join(", ") + " minutes");
    }
    const now = Date.now();
    await chrome.storage.local.set({
      session: { startedAt: now, endsAt: now + msg.minutes * 60000, minutes: msg.minutes }
    });
    chrome.alarms.create("sessionEnd", { when: now + msg.minutes * 60000 });
    chrome.alarms.create("tick", { periodInMinutes: 1 });
    await syncRules();
    await blockOpenTabs();
  }
  if (msg.type === "stop") await finishSession(false);
  if (msg.type === "blocked") {
    // Only count real blocks, and only fresh visits (the page sends count: false for
    // reloads, Back/Forward and sweeps). A leftover block page for a listed site that
    // isn't blocked right now (session over, or a pass covers it) is told to reopen it.
    const { sites = [] } = await chrome.storage.local.get("sites");
    const state = await getBlockState();
    const blocked = msg.url ? isBlockedUrl(msg.url, state) : !!state;
    if (blocked && msg.count !== false) await addStats((s) => { s.blocked += 1; });
    return { blocked, reopen: !blocked && isListed(msg.url, sites) };
  }
  if (msg.type === "unlock") {
    const state = await getBlockState();
    if (!state) {
      const { sites = [] } = await chrome.storage.local.get("sites");
      return { granted: false, reopen: isListed(msg.url, sites) }; // no session, nothing to unlock
    }
    // Use the most specific matching entry so the pass covers as little as possible
    const host = hostOf(msg.url);
    const entry = state.sites.filter((d) => onSite(host, d)).sort((a, b) => b.length - a.length)[0];
    if (!entry) throw new Error("Not a blocked site: " + (msg.url || "(no address)"));
    const domains = passDomains(entry);
    const domain = domains[0];
    // Pass, alarm and rules first, so a stats failure can't leave a pass that never ends
    const until = Date.now() + PASS_MINUTES * 60000;
    await chrome.storage.local.set({ pass: { domain, domains, until } });
    // Same alarm names, so these replace the previous pass's alarms
    chrome.alarms.create("passEnd", { when: until });
    chrome.alarms.create("passWarn", { when: until - PASS_WARN_MS });
    await syncRules();
    await blockOpenTabs({ why: "moved", to: domain }); // re-block the previous pass's site, if there was one
    const previous = state.pass; // the pass that was active before this unlock
    if (previous && previous.domain !== domain) {
      await notify(`Your pass moved to ${domain}, so ${previous.domain} is blocked again. Only one site can be unlocked at a time.`);
    }
    await addStats((s) => {
      s.unlocks += 1;
      s.log.unshift({ at: Date.now(), domain, reason: msg.reason });
      s.log = s.log.slice(0, 20);
    });
    return { granted: true, domain };
  }
  if (msg.type === "sitesChanged") await syncRules();
  if (msg.type === "testNotification") {
    // Not through notify(), so a failure reaches the welcome page instead of being hidden
    await chrome.notifications.create(NOTIFY_ID, notification("This is a test. Pass notifications will look like this."));
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  serial(() => handleMessage(msg)).then(
    (result) => reply({ ok: true, ...result }),
    (err) => { console.error("Focus Guard:", msg.type, err); reply({ ok: false, error: String(err) }); }
  );
  return true;
});
