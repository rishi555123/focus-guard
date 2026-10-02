const MIN_CHARS = 60, WAIT_SECONDS = 60;
const link = readBlockLink(location.search); // from links.js
const target = link.url;

document.getElementById("site").textContent = target || "AI chat site";

// Explain re-blocks caused by a pass moving to another site or running out
const whyNote = document.getElementById("why");
whyNote.textContent = sweepNote(link); // from links.js
whyNote.hidden = !whyNote.textContent;

// Warn before the wait if unlocking here would end a pass for another site.
// Kept up to date if a pass starts or ends while this page is open.
const passWarning = document.getElementById("passWarning");
async function showPassWarning() {
  const { pass } = await chrome.storage.local.get("pass");
  const other = otherPass(pass, target, Date.now()); // from links.js
  passWarning.textContent = other
    ? `This will end your pass for ${other}. You can only have one pass at a time, so ${other} will be blocked again.`
    : "";
  passWarning.hidden = !other;
}
showPassWarning();
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && "pass" in changes) showPassWarning();
});

// Only fresh visits count: not reloads, Back/Forward, or Focus Guard
// re-blocking tabs that were already open
const nav = performance.getEntriesByType("navigation")[0];
const countVisit = !link.sweep && (!nav || nav.type === "navigate");

// Counts this visit, or reopens the site if it isn't blocked any more
// (session over, or a pass covers it). Only listed sites are ever reopened.
chrome.runtime.sendMessage({ type: "blocked", url: target, count: countVisit }).then((res) => {
  if (res?.ok && res.reopen) location.replace(target);
});

const reason = document.getElementById("reason");
const btn = document.getElementById("unlock");
const count = document.getElementById("count");

reason.addEventListener("input", () => {
  const left = MIN_CHARS - reason.value.trim().length;
  btn.disabled = left > 0;
  count.textContent = left > 0 ? `${left} more characters` : "Ready";
});

btn.addEventListener("click", () => {
  btn.disabled = true;
  reason.readOnly = true;
  let s = WAIT_SECONDS;
  count.textContent = `Wait ${s}s. Try one more idea while you wait.`;
  const t = setInterval(async () => {
    s -= 1;
    count.textContent = `Wait ${s}s. Try one more idea while you wait.`;
    if (s <= 0) {
      clearInterval(t);
      const res = await chrome.runtime.sendMessage({ type: "unlock", reason: reason.value.trim(), url: target });
      if (!res?.ok) {
        count.textContent = "Couldn't grant a pass: " + (res?.error || "no reply from Focus Guard");
        return;
      }
      if (res.granted) {
        count.textContent = `Pass granted for ${res.domain} for 5 minutes`;
        location.href = target;
      } else if (res.reopen) {
        count.textContent = "No session is running, so this site isn't blocked";
        location.href = target;
      } else {
        count.textContent = "No session is running, so there's nothing to unlock";
      }
    }
  }, 1000);
});

document.getElementById("back").onclick = async () => {
  const steps = backSteps(link, history.length);
  if (steps) return history.go(-steps);
  // Nothing to go back to: close this tab, or show a new tab page if it's the window's last tab
  const tab = await chrome.tabs.getCurrent();
  const inWindow = await chrome.tabs.query({ windowId: tab.windowId });
  if (inWindow.length > 1) chrome.tabs.remove(tab.id);
  else chrome.tabs.update(tab.id, { url: "chrome://newtab/" });
};
