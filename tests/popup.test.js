// Tests for the toolbar popup (src/popup/popup.js), run against a stand-in page and chrome API.
// Plain Node 22+, no installs:  node --test
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { loadPopup } = require("./fake-popup.js");

const html = fs.readFileSync(path.join(__dirname, "../src/popup/popup.html"), "utf8");
const SESSION = () => ({ startedAt: Date.now() - 60000, endsAt: Date.now() + 20 * 60000, minutes: 25 });

test("the app builders checkbox is off by default and names the sites", async () => {
  const popup = loadPopup({ store: { sites: ["chatgpt.com"] } });
  await popup.settle();
  assert.equal(popup.els.appBuilders.checked, false);
  assert.equal(popup.els.appBuilderNames.textContent, "(v0.app, bolt.new, lovable.dev)");
  assert.match(html, /<input type="checkbox" id="appBuilders">\s*Also block AI app builders/);
});

test("turning the app builders on saves it and updates the rules, without touching your list", async () => {
  const popup = loadPopup({ store: { sites: ["chatgpt.com"] } });
  await popup.settle();
  popup.els.appBuilders.checked = true;
  await popup.els.appBuilders.onchange();
  assert.equal(popup.store.blockAppBuilders, true);
  assert.deepEqual(popup.store.sites, ["chatgpt.com"]);
  assert.deepEqual(structuredClone(popup.sent.at(-1)), { type: "sitesChanged" });
});

test("the app builders choice shows as saved, and is locked during a session like the list", async () => {
  const popup = loadPopup({ store: { sites: [], blockAppBuilders: true, session: SESSION() } });
  await popup.settle();
  assert.equal(popup.els.appBuilders.checked, true);
  assert.equal(popup.els.appBuilders.disabled, true);
  assert.equal(popup.els.sites.disabled, true);
});

// The streak and the weekly chart

const NOW = new Date(2026, 10, 25, 15).getTime(); // Wednesday 25 November 2026, 3 pm local time

test("the popup shows the streak, this week's minutes and one bar per day", async () => {
  const days = {
    "2026-11-19": { sessions: 1, minutes: 25 },
    "2026-11-23": { sessions: 1, minutes: 50 },
    "2026-11-24": { sessions: 2, minutes: 100 },
    "2026-11-25": { sessions: 1, minutes: 25 }
  };
  const popup = loadPopup({ store: { stats: { sessions: 5, minutes: 200, blocked: 0, unlocks: 0, log: [], days } }, now: NOW });
  await popup.settle();
  assert.equal(popup.els.streak.textContent, "3-day streak");
  assert.equal(popup.els.weekTotal.textContent, "200 min this week");
  const bars = popup.els.weekBars.children;
  assert.deepEqual(bars.map((b) => b.children[1].textContent), ["Thu", "Fri", "Sat", "Sun", "Mon", "Tue", "Wed"]);
  assert.deepEqual(bars.map((b) => b.children[0].style.height), ["12px", "0px", "0px", "0px", "23px", "46px", "12px"]);
  assert.deepEqual(bars.map((b) => b.className), ["bar", "bar", "bar", "bar", "bar", "bar", "bar today"]);
  assert.equal(popup.els.weekBars.attributes["aria-label"],
    "Focused minutes, last 7 days: Thu 25, Fri 0, Sat 0, Sun 0, Mon 50, Tue 100, Wed (today) 25");
});

test("with no history yet, the popup invites you to start a streak", async () => {
  const popup = loadPopup({ store: { stats: { sessions: 4, minutes: 130, blocked: 7, unlocks: 2, log: [] } }, now: NOW }); // saved by 1.0.0
  await popup.settle();
  assert.equal(popup.els.streak.textContent, "Finish a session to start a streak");
  assert.equal(popup.els.weekTotal.textContent, "0 min this week");
  assert.equal(popup.els.weekBars.children.length, 7);
  assert.equal(popup.els.sMinutes.textContent, 130, "the totals are still shown");
});

test("a short bar is still visible, and the chart's markup is in popup.html", () => {
  assert.match(html, /<div class="bars" id="weekBars" role="img"><\/div>/);
  assert.match(html, /<script src="\.\.\/shared\/streaks\.js"><\/script>\s*<script src="\.\.\/shared\/browser\.js">/);
});

// Saving the blocklist

test("saving says which entries were left out and which block only part of a site", async () => {
  const popup = loadPopup({ store: { sites: ["chatgpt.com", "github.com/copilot"] } });
  await popup.settle();
  popup.els.sites.value = "chatgpt.com\nchatgpt.com/c/123\ngithub.com/copilot\nhttps://claude.ai/new\n";
  await popup.els.saveSites.onclick();
  assert.deepEqual(popup.store.sites, ["chatgpt.com", "github.com/copilot", "claude.ai/new"]);
  assert.equal(popup.els.saved.textContent,
    "Saved. Left out chatgpt.com/c/123 (chatgpt.com already blocks it). " +
    "These block only part of a site: claude.ai/new. To block a whole site, remove everything after its name.");
});

test("a plain save just says Saved, and bad lines are refused with the reason", async () => {
  const popup = loadPopup({ store: { sites: [] } });
  await popup.settle();
  popup.els.sites.value = "chatgpt.com\nclaude.ai";
  await popup.els.saveSites.onclick();
  assert.equal(popup.els.saved.textContent, "Saved");
  popup.els.sites.value = "chatgpt.com\nhttps://www.google.com/search?q=hi&udm=50";
  await popup.els.saveSites.onclick();
  assert.match(popup.els.saved.textContent, /^Not saved\. .*google\.com\/search\?q=hi&udm=50\. A page can have one \?name=value at most\.$/);
  assert.deepEqual(popup.store.sites, ["chatgpt.com", "claude.ai"], "nothing saved");
});
