const $ = (id) => document.getElementById(id);
let minutes = SESSION_LENGTHS[0], timer, sitesEdited = false; // lengths from shared/constants.js

// One button per session length, the default one pressed
for (const m of SESSION_LENGTHS) {
  const b = document.createElement("button");
  b.dataset.min = m;
  b.textContent = `${m} min`;
  b.setAttribute("aria-pressed", m === minutes);
  document.querySelector(".durations").append(b);
}

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
  if (SESSION_LENGTHS.includes(lastMinutes)) pickMinutes(lastMinutes);
});

// Setup reminders and links (helpers from shared/browser.js and shared/setup.js)
applyBrowserText(document);
const showGeminiReminder = BROWSER.id === "chrome"; // never in Edge; Edge's Copilot step is optional
incognitoAllowed().then((allowed) => { $("incognito").hidden = allowed; });
$("openSettings").onclick = () => openExtensionSettings();
$("openGemini").onclick = () => openAssistantSettings();
$("openChecklist").onclick = () => openSetupChecklist();
$("geminiOff").onchange = () => chrome.storage.local.set({ geminiOff: $("geminiOff").checked });

$("sites").addEventListener("input", () => (sitesEdited = true));

// The optional AI app builders group (APP_BUILDER_SITES is from shared/sites.js)
$("appBuilderNames").textContent = `(${APP_BUILDER_SITES.join(", ")})`;
$("appBuilders").onchange = async () => {
  await chrome.storage.local.set({ blockAppBuilders: $("appBuilders").checked });
  await chrome.runtime.sendMessage({ type: "sitesChanged" });
};

// Theme: Auto follows the system setting (setTheme is from shared/theme.js)
const themeButtons = document.querySelectorAll(".themes button");
function showTheme(theme) {
  const choice = theme === "light" || theme === "dark" ? theme : "auto";
  themeButtons.forEach((b) => b.setAttribute("aria-pressed", b.dataset.themeChoice === choice));
}
themeButtons.forEach((b) => b.addEventListener("click", () => {
  showTheme(b.dataset.themeChoice);
  setTheme(b.dataset.themeChoice);
}));

$("start").onclick = async () => {
  $("startError").hidden = true;
  let res;
  try {
    res = await chrome.runtime.sendMessage({ type: "start", minutes });
  } catch (err) { // e.g. Focus Guard was reloaded while the popup was open
    res = { ok: false, error: err?.message || String(err) };
  }
  if (!res?.ok) {
    $("startError").textContent = "Couldn't start the session: " + (res?.error || "no reply from Focus Guard") + ". Try again.";
    $("startError").hidden = false;
  }
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
  const { session, sites = [], stats = {}, pass, geminiOff = false, theme, blockAppBuilders = false } =
    await chrome.storage.local.get(["session", "sites", "stats", "pass", "geminiOff", "theme", "blockAppBuilders"]);
  showTheme(theme);
  const active = !!session && session.endsAt > Date.now();

  // Gemini reminder in Chrome, until the user says they've turned it off
  $("geminiNote").hidden = !showGeminiReminder || geminiOff;
  $("geminiOff").checked = geminiOff;

  $("idle").classList.toggle("hidden", active);
  $("active").classList.toggle("hidden", !active);
  $("sSessions").textContent = stats.sessions || 0;
  $("sMinutes").textContent = stats.minutes || 0;
  $("sBlocked").textContent = stats.blocked || 0;
  $("sUnlocks").textContent = stats.unlocks || 0;
  showWeek(stats.days || {});

  // No editing the blocklist mid-session, so you can't cheat yourself.
  // Unsaved edits in the box are kept when the popup refreshes.
  if (!sitesEdited) $("sites").value = sites.join("\n");
  $("sites").disabled = $("saveSites").disabled = $("appBuilders").disabled = active;
  $("appBuilders").checked = blockAppBuilders;

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

// The streak and a bar per day for the last 7 days (from shared/streaks.js)
function showWeek(days) {
  const now = Date.now();
  const streak = currentStreak(days, now);
  $("streak").textContent = streak ? `${streak}-day streak` : "Finish a session to start a streak";
  const week = lastWeek(days, now);
  const total = week.reduce((sum, d) => sum + d.minutes, 0);
  $("weekTotal").textContent = `${total} min this week`;
  const most = Math.max(...week.map((d) => d.minutes), 1);
  $("weekBars").replaceChildren(...week.map((d) => {
    const col = document.createElement("div");
    col.className = d.today ? "bar today" : "bar";
    const bar = document.createElement("i");
    bar.style.height = `${d.minutes ? Math.max(3, Math.round((d.minutes / most) * 46)) : 0}px`; // the busiest day is full height
    const label = document.createElement("span");
    label.textContent = d.day;
    col.append(bar, label);
    return col;
  }));
  // The chart is a picture, so screen readers get the numbers instead
  $("weekBars").setAttribute("aria-label", "Focused minutes, last 7 days: " +
    week.map((d) => `${d.day}${d.today ? " (today)" : ""} ${d.minutes}`).join(", "));
}

// Refresh when anything changes while the popup is open, like a pass granted in another tab
chrome.storage.onChanged.addListener((_changes, area) => { if (area === "local") render(); });
render();
