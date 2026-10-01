const $ = (id) => document.getElementById(id);
let minutes = 25, timer;

document.querySelectorAll(".durations button").forEach((b) =>
  b.addEventListener("click", () => {
    minutes = +b.dataset.min;
    document.querySelectorAll(".durations button").forEach((x) =>
      x.setAttribute("aria-pressed", x === b));
  })
);

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
  const sites = $("sites").value.split("\n")
    .map((s) => s.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0])
    .filter(Boolean);
  await chrome.storage.local.set({ sites: [...new Set(sites)] });
  await chrome.runtime.sendMessage({ type: "sitesChanged" });
  $("saved").textContent = "Saved";
  setTimeout(() => ($("saved").textContent = ""), 1500);
};

async function render() {
  const { session, sites = [], stats = {}, passUntil = 0 } =
    await chrome.storage.local.get(["session", "sites", "stats", "passUntil"]);
  const active = session && session.endsAt > Date.now();

  $("idle").classList.toggle("hidden", active);
  $("active").classList.toggle("hidden", !active);
  $("sSessions").textContent = stats.sessions || 0;
  $("sMinutes").textContent = stats.minutes || 0;
  $("sBlocked").textContent = stats.blocked || 0;
  $("sUnlocks").textContent = stats.unlocks || 0;

  // No editing the blocklist mid-session, so you can't cheat yourself
  $("sites").value = sites.join("\n");
  $("sites").disabled = $("saveSites").disabled = !!active;

  clearInterval(timer);
  if (active) {
    const tick = () => {
      const ms = Math.max(0, session.endsAt - Date.now());
      const m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000);
      $("clock").textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
      $("passNote").textContent = passUntil > Date.now()
        ? `Pass active for ${Math.ceil((passUntil - Date.now()) / 60000)} more min`
        : "Solve it yourself. You've got this.";
      if (ms === 0) render();
    };
    tick();
    timer = setInterval(tick, 1000);
  }
}
render();
