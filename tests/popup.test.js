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
