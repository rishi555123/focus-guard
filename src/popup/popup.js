const $ = (id) => document.getElementById(id);
let minutes = 25, timer, sitesEdited = false;

function pickMinutes(m) {
  minutes = m;
  document.querySelectorAll(".durations button").forEach((x) =>
    x.setAttribute("aria-pressed", +x.dataset.min === m));
}

document.querySelectorAll(".durations button").forEach((b) =>
  b.addEventListener("click", () => {
    pickMinutes(+b.dataset.min);
    chrome.storage.local.set({ lastMinutes: minutes });
  })
);

// Start with the length picked last time
chrome.storage.local.get("lastMinutes").then(({ lastMinutes }) => {
  if ([25, 50, 90].includes(lastMinutes)) pickMinutes(lastMinutes);
});

// Setup reminders and links (helpers from shared/setup.js)
incognitoAllowed().then((allowed) => { $("incognito").hidden = allowed; });
$("openSettings").onclick = () => openExtensionSettings();
$("openGemini").onclick = () => openGeminiSettings();
$("openChecklist").onclick = () => openSetupChecklist();
$("geminiOff").onchange = () => chrome.storage.local.set({ geminiOff: $("geminiOff").checked });

$("sites").addEventListener("input", () => (sitesEdited = true));

$("start").onclick = async () => {
  await chrome.runtime.sendMessage({ type: "start", minutes });
  render();
};

$("stop").onclick = async () => {
  if (!confirm("End the session now? It won't count as finished.")) return;
  await chrome.runtime.sendMessage({ type: "stop" });
  render();
};

$("saveSites").onclick = async () => {
  const { sites, invalid } = parseSites($("sites").value); // from shared/sites.js
  if (invalid.length) {
    $("saved").className = "error";
    $("saved").textContent = "Not saved. These don't look like domains: " + invalid.join(", ");
    return;
  }
  sitesEdited = false;
  $("sites").value = sites.join("\n");
  await chrome.storage.local.set({ sites });
  await chrome.runtime.sendMessage({ type: "sitesChanged" });
  $("saved").className = "muted";
  $("saved").textContent = "Saved";
  setTimeout(() => ($("saved").textContent = ""), 1500);
};

async function render() {
  const { session, sites = [], stats = {}, pass, geminiOff = false } =
    await chrome.storage.local.get(["session", "sites", "stats", "pass", "geminiOff"]);
  const active = !!session && session.endsAt > Date.now();

  // Gemini reminder until the user says they've turned it off
  $("geminiNote").hidden = geminiOff;
  $("geminiOff").checked = geminiOff;

  $("idle").classList.toggle("hidden", active);
  $("active").classList.toggle("hidden", !active);
  $("sSessions").textContent = stats.sessions || 0;
  $("sMinutes").textContent = stats.minutes || 0;
  $("sBlocked").textContent = stats.blocked || 0;
  $("sUnlocks").textContent = stats.unlocks || 0;

  // No editing the blocklist mid-session, so you can't cheat yourself.
  // Unsaved edits in the box are kept when the popup refreshes.
  if (!sitesEdited) $("sites").value = sites.join("\n");
  $("sites").disabled = $("saveSites").disabled = active;

  clearInterval(timer);
  if (active) {
    const tick = () => {
      const ms = Math.max(0, session.endsAt - Date.now());
      const m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000);
      $("clock").textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
      $("passNote").textContent = pass && pass.until > Date.now()
        ? `Pass for ${pass.domain}: ${Math.ceil((pass.until - Date.now()) / 60000)} more min`
        : "Solve it yourself. You've got this.";
      if (ms === 0) render();
    };
    tick();
    timer = setInterval(tick, 1000);
  }
}

// Refresh when anything changes while the popup is open, like a pass granted in another tab
chrome.storage.onChanged.addListener((_changes, area) => { if (area === "local") render(); });
render();
