const DEFAULT_SITES = [
  "chatgpt.com", "chat.openai.com", "gemini.google.com", "claude.ai",
  "copilot.microsoft.com", "perplexity.ai", "chat.deepseek.com",
  "poe.com", "grok.com", "you.com", "phind.com"
];
const PASS_MINUTES = 5;
const BLOCK_PAGE = () => chrome.runtime.getURL("blocked.html");

chrome.runtime.onInstalled.addListener(async () => {
  const s = await chrome.storage.local.get(["sites", "stats"]);
  if (!s.sites) await chrome.storage.local.set({ sites: DEFAULT_SITES });
  if (!s.stats) await chrome.storage.local.set({
    stats: { blocked: 0, sessions: 0, minutes: 0, unlocks: 0, log: [] }
  });
  await syncRules();
});
chrome.runtime.onStartup.addListener(syncRules);

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

// Catch AI tabs that were already open before the session started
async function blockOpenTabs() {
  const { sites = [] } = await chrome.storage.local.get("sites");
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    try {
      const host = new URL(tab.url).hostname;
      if (sites.some((d) => host === d || host.endsWith("." + d))) {
        chrome.tabs.update(tab.id, { url: BLOCK_PAGE() + "?u=" + encodeURIComponent(tab.url) });
      }
    } catch (_) { /* chrome:// and other non-URL tabs */ }
  }
}

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
  const { stats } = await chrome.storage.local.get("stats");
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

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "sessionEnd") await finishSession(true);
  if (alarm.name === "tick") await updateBadge();
  if (alarm.name === "passEnd") {
    await chrome.storage.local.remove("passUntil");
    if (await syncRules()) blockOpenTabs();
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  (async () => {
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
      const until = Date.now() + PASS_MINUTES * 60000;
      await chrome.storage.local.set({ passUntil: until });
      await addStats((s) => {
        s.unlocks += 1;
        s.log.unshift({ at: Date.now(), reason: msg.reason });
        s.log = s.log.slice(0, 20);
      });
      chrome.alarms.create("passEnd", { when: until });
      await syncRules();
    }
    if (msg.type === "sitesChanged") await syncRules();
    reply({ ok: true });
  })();
  return true;
});
