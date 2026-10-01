const DEFAULT_SITES = [
  "chatgpt.com", "chat.openai.com", "gemini.google.com", "claude.ai",
  "copilot.microsoft.com", "perplexity.ai", "chat.deepseek.com",
  "poe.com", "grok.com", "you.com", "phind.com"
];
const PASS_MINUTES = 5;
const BLOCK_PAGE = () => chrome.runtime.getURL("src/blocked/blocked.html");
const emptyStats = () => ({ blocked: 0, sessions: 0, minutes: 0, unlocks: 0, log: [] });

chrome.runtime.onInstalled.addListener(async () => {
  const s = await chrome.storage.local.get(["sites", "stats"]);
  if (!s.sites) await chrome.storage.local.set({ sites: DEFAULT_SITES });
  if (!s.stats) await chrome.storage.local.set({ stats: emptyStats() });
  await reconcile();
});
chrome.runtime.onStartup.addListener(reconcile);

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function isBlocking() {
  const { session, passUntil = 0 } = await chrome.storage.local.get(["session", "passUntil"]);
  return !!(session && session.endsAt > Date.now() && passUntil < Date.now());
}

// Turn the blocklist into redirect rules (only while a session is active)
async function syncRules() {
  const { sites = [] } = await chrome.storage.local.get("sites");
  const active = await isBlocking();
  const old = await chrome.declarativeNetRequest.getDynamicRules();
  const addRules = active
    ? sites.map((domain, i) => ({
        id: i + 1,
        priority: 1,
        action: { type: "redirect", redirect: { regexSubstitution: BLOCK_PAGE() + "?u=\\0" } },
        condition: {
          regexFilter: "^https?://([^/]*\\.)?" + escapeRe(domain) + "(/.*)?$",
          resourceTypes: ["main_frame"]
        }
      }))
    : [];
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: old.map((r) => r.id),
    addRules
  });
  await updateBadge();
  return active;
}

const blockUrl = (url) => BLOCK_PAGE() + "?u=" + encodeURIComponent(url);

function isBlockedUrl(url, sites) {
  try {
    const host = new URL(url).hostname;
    return sites.some((d) => host === d || host.endsWith("." + d));
  } catch (_) { return false; } // missing or unparseable URL
}

// Catch AI tabs that were already open before the session started
async function blockOpenTabs() {
  const { sites = [] } = await chrome.storage.local.get("sites");
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (isBlockedUrl(tab.url, sites)) chrome.tabs.update(tab.id, { url: blockUrl(tab.url) }).catch(() => {});
  }
}

// Backup for navigations the redirect rules never see: back/forward cache,
// prerendered pages and in-page navigation on single-page apps
chrome.tabs.onUpdated.addListener(async (tabId, change) => {
  if (!change.url || !(await isBlocking())) return;
  const { sites = [] } = await chrome.storage.local.get("sites");
  if (isBlockedUrl(change.url, sites)) chrome.tabs.update(tabId, { url: blockUrl(change.url) }).catch(() => {});
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

async function addStats(fn) {
  const { stats: saved } = await chrome.storage.local.get("stats");
  const stats = { ...emptyStats(), ...saved };
  fn(stats);
  await chrome.storage.local.set({ stats });
}

async function finishSession(completed) {
  const { session } = await chrome.storage.local.get("session");
  if (!session) return;
  const mins = Math.round((Math.min(Date.now(), session.endsAt) - session.startedAt) / 60000);
  await addStats((s) => { s.minutes += mins; if (completed) s.sessions += 1; });
  await chrome.storage.local.remove(["session", "passUntil"]);
  chrome.alarms.clearAll();
  await syncRules();
}

// Chrome can drop alarms on a browser restart or extension update/reload,
// so rebuild them from storage (or finish a session that ran out meanwhile)
async function reconcile() {
  const now = Date.now();
  const { session, passUntil = 0 } = await chrome.storage.local.get(["session", "passUntil"]);
  if (session && session.endsAt <= now) return finishSession(true);
  if (passUntil && passUntil <= now) await chrome.storage.local.remove("passUntil");
  if (session) {
    if (!(await chrome.alarms.get("sessionEnd"))) chrome.alarms.create("sessionEnd", { when: session.endsAt });
    if (!(await chrome.alarms.get("tick"))) chrome.alarms.create("tick", { periodInMinutes: 1 });
    if (passUntil > now && !(await chrome.alarms.get("passEnd"))) chrome.alarms.create("passEnd", { when: passUntil });
  }
  if (await syncRules()) await blockOpenTabs();
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "sessionEnd") await finishSession(true);
  if (alarm.name === "tick") await updateBadge();
  if (alarm.name === "passEnd") {
    await chrome.storage.local.remove("passUntil");
    if (await syncRules()) blockOpenTabs();
  }
});

async function handleMessage(msg) {
  if (msg.type === "start") {
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
  if (msg.type === "blocked") await addStats((s) => { s.blocked += 1; });
  if (msg.type === "unlock") {
    // Pass, alarm and rules first, so a stats failure can't leave a pass that never ends
    const until = Date.now() + PASS_MINUTES * 60000;
    await chrome.storage.local.set({ passUntil: until });
    chrome.alarms.create("passEnd", { when: until });
    await syncRules();
    await addStats((s) => {
      s.unlocks += 1;
      s.log.unshift({ at: Date.now(), reason: msg.reason });
      s.log = s.log.slice(0, 20);
    });
  }
  if (msg.type === "sitesChanged") await syncRules();
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  handleMessage(msg).then(
    () => reply({ ok: true }),
    (err) => { console.error("Focus Guard:", msg.type, err); reply({ ok: false, error: String(err) }); }
  );
  return true;
});
